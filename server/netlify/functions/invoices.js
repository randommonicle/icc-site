// D-026 invoicing endpoint — POST /api/v1/invoices (admin-gated). The platform is the
// invoice system of record; this drives Stripe Invoicing from our backend (create a draft
// -> Mark reviews/adjusts the amount -> one-click send -> status reflects). Under /api/v1
// so the field app is a client, not a rebuild (D-003/D-012; the contract's own instruction
// for state/money endpoints, shared/contract/README.md:42-44).
//
// Discipline (mirrors reviewRequest.js / handoffs.js):
//   - Admin-gated: requireAdmin (Supabase Auth) fails closed.
//   - Dormant until configured: no STRIPE_SECRET_KEY -> 503 "not configured", nothing written.
//   - Server-authoritative money: line items come from the stored server-computed figure
//     (jobs.estimated_price_ex_vat, from pricing.quote() at booking) or Mark's reviewed
//     override, never a client free-text figure; amounts convert pounds -> integer pence.
//   - Idempotent: one invoice per job; a create for a job that already has one returns the
//     existing row rather than raising a second (and the adapter carries a Stripe
//     idempotency key, so a same-request retry returns the same draft).
//   - Fail-closed: a provider error returns 502 and records nothing half-made.
//
// Deposit-vs-invoice (Decision A, docs/BACKEND_PHASE1_PLAN.md): the invoice face value is
// the FULL job value (revenue = full service value); a paid deposit is a negative credit
// line, so the amount DUE is the balance. Full deposit/balance reconciliation is Phase 3.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const invoiceProvider = require("./invoiceProvider.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

function poundsToPence(pounds) {
  return Math.round(Number(pounds) * 100);
}

// One round-trip: the job plus the fields an invoice needs and the customer's name/email.
async function loadJobForInvoice(supabase, id) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id,status,rooms,estimated_price_ex_vat,deposit_ex_vat,deposit_status,customer_id,customers(name,email)")
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

async function existingInvoiceForJob(supabase, jobId) {
  const { data, error } = await supabase.from("invoices").select("*").eq("job_id", jobId).limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

async function loadInvoice(supabase, { invoiceId, jobId }) {
  let q = supabase.from("invoices").select("*");
  q = invoiceId ? q.eq("id", invoiceId) : q.eq("job_id", jobId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

// Server-authoritative line items: one service line for the stored/reviewed total, plus a
// negative deposit-credit line when the deposit is paid (Decision A). Returns the Stripe
// lines and the face value (full total, pounds) stored on the local row.
function buildInvoiceLines(job, amountExVatOverride) {
  const total = amountExVatOverride != null && amountExVatOverride !== "" ? Number(amountExVatOverride) : Number(job.estimated_price_ex_vat);
  if (!(total > 0)) throw new Error("invoice amount must be a positive number");
  const lines = [{ description: `Carpet cleaning services${job.rooms ? " — " + job.rooms : ""}`, amountPence: poundsToPence(total) }];
  if (job.deposit_status === "paid" && Number(job.deposit_ex_vat) > 0) {
    lines.push({ description: "Deposit already paid", amountPence: -poundsToPence(Number(job.deposit_ex_vat)) });
  }
  return { lines, amountExVat: total };
}

async function doCreate(supabase, body, deps, headers) {
  const jobId = body.job_id;
  if (!jobId || typeof jobId !== "string") return json(400, headers, { error: "Missing job_id" });
  const job = await loadJobForInvoice(supabase, jobId);
  if (!job) return json(404, headers, { error: "Job not found" });
  if (job.status !== "completed") return json(409, headers, { error: "An invoice can only be raised against a completed job." });

  const existing = await existingInvoiceForJob(supabase, jobId);
  if (existing) return json(200, headers, { ok: true, invoice: existing, note: "An invoice already exists for this job." });

  const cust = job.customers || {};
  if (!cust.email) return json(400, headers, { error: "No customer email on file for this job." });

  let built;
  try { built = buildInvoiceLines(job, body.amount_ex_vat); }
  catch (e) { return json(400, headers, { error: e.message }); }

  let draft;
  try {
    draft = await deps.createDraftFn({
      customerEmail: cust.email,
      customerName: cust.name,
      lines: built.lines,
      daysUntilDue: 14,
      metadata: { job_id: jobId },
      idempotencyKey: `invoice-${jobId}`,
    });
  } catch (e) {
    console.log("invoice draft failed for job", jobId, "-", e.message);
    return json(502, headers, { error: "The invoicing provider rejected the draft." });
  }

  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    job_id: jobId,
    status: draft.status || "draft",
    amount_ex_vat: built.amountExVat,
    provider: "stripe",
    provider_invoice_id: draft.providerInvoiceId,
    number: draft.number || null,
    payment_url: draft.paymentUrl || null,
    due_at: dueAt,
  };
  const { data, error } = await supabase.from("invoices").insert(row).select().limit(1);
  if (error) {
    // The Stripe draft exists (metadata carries job_id) but our record did not persist.
    // Return the provider id so it is traceable; a create retry is deduped by the Stripe
    // idempotency key. TODO(backend-phase1/invoice-orphan): reconcile orphaned drafts.
    console.log("invoice local insert failed for job", jobId, "-", error.message);
    return json(500, headers, { error: "The draft was created on the provider but the local record failed to save.", provider_invoice_id: draft.providerInvoiceId });
  }
  return json(200, headers, { ok: true, invoice: (data && data[0]) || row });
}

async function doSend(supabase, body, deps, headers) {
  const invoice = await loadInvoice(supabase, { invoiceId: body.invoice_id, jobId: body.job_id });
  if (!invoice) return json(404, headers, { error: "Invoice not found" });
  if (!invoice.provider_invoice_id) return json(409, headers, { error: "This invoice has no provider draft to send." });
  if (invoice.status !== "draft") return json(200, headers, { ok: true, invoice, note: "This invoice has already been sent." });

  let sent;
  try { sent = await deps.sendFn(invoice.provider_invoice_id); }
  catch (e) {
    console.log("invoice send failed for", invoice.id, "-", e.message);
    return json(502, headers, { error: "The invoicing provider could not send the invoice." });
  }
  const { data, error } = await supabase.from("invoices")
    .update({ status: sent.status || "sent", number: sent.number || invoice.number, payment_url: sent.paymentUrl || invoice.payment_url, issued_at: new Date().toISOString() })
    .eq("id", invoice.id).select().limit(1);
  if (error) return json(500, headers, { error: "Sent on the provider but the local status did not update.", provider_invoice_id: invoice.provider_invoice_id });
  return json(200, headers, { ok: true, invoice: (data && data[0]) || invoice });
}

async function doStatus(supabase, body, deps, headers) {
  const invoice = await loadInvoice(supabase, { invoiceId: body.invoice_id, jobId: body.job_id });
  if (!invoice) return json(404, headers, { error: "Invoice not found" });
  if (!invoice.provider_invoice_id) return json(409, headers, { error: "This invoice has no provider record to check." });

  let s;
  try { s = await deps.statusFn(invoice.provider_invoice_id); }
  catch (e) {
    console.log("invoice status failed for", invoice.id, "-", e.message);
    return json(502, headers, { error: "Could not read the invoice status from the provider." });
  }
  const patch = { status: s.status, number: s.number || invoice.number, payment_url: s.paymentUrl || invoice.payment_url };
  if (s.status === "paid" && !invoice.paid_at) patch.paid_at = new Date().toISOString();
  const { data, error } = await supabase.from("invoices").update(patch).eq("id", invoice.id).select().limit(1);
  if (error) return json(500, headers, { error: "Read the status but the local record did not update." });
  return json(200, headers, { ok: true, invoice: (data && data[0]) || invoice });
}

// POST dispatcher. Deps injectable for the tests: supabase, invoicingConfigured, and the
// three adapter fns (createDraftFn/sendFn/statusFn).
async function handlePost(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const configured = deps.invoicingConfigured != null ? deps.invoicingConfigured : invoiceProvider.isInvoicingConfigured();

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, headers, { error: "Invalid JSON" }); }
  const action = body.action;
  if (!["create", "send", "status"].includes(action)) return json(400, headers, { error: "Unknown action" });

  if (!configured) return json(503, headers, { error: "Invoicing is not configured." });

  if (action === "create") return doCreate(supabase, body, deps, headers);
  if (action === "send") return doSend(supabase, body, deps, headers);
  return doStatus(supabase, body, deps, headers);
}

// GET /api/v1/invoices[?job_id=...] — list invoices (admin-gated), for the dashboard.
// 'overdue' is a DERIVED status, not stored: Stripe's truth for an unpaid finalised
// invoice is 'open' (we store 'sent'), so we compute overdue at read time from due_at.
// Without this an unpaid invoice past its due date would read as 'sent' (the enum value
// and the contract both promise 'overdue', so a reader must actually produce it).
async function handleGet(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const jobId = (event.queryStringParameters || {}).job_id;
  let q = supabase.from("invoices").select("*").order("created_at", { ascending: false });
  if (jobId) q = q.eq("job_id", jobId);
  const { data, error } = await q.limit(500);
  if (error) return json(500, headers, { error: "Could not load invoices." });
  const now = deps.now ? new Date(deps.now) : new Date();
  const invoices = (data || []).map((row) =>
    row.status === "sent" && row.due_at && new Date(row.due_at) < now ? { ...row, status: "overdue" } : row
  );
  return json(200, headers, { invoices });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const auth = await requireAdmin(event);
  if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const supabase = getSupabaseAdmin();
  const deps = {
    supabase,
    createDraftFn: invoiceProvider.createDraftInvoice,
    sendFn: invoiceProvider.sendInvoice,
    statusFn: invoiceProvider.getInvoiceStatus,
  };
  try {
    if (event.httpMethod === "GET") return await handleGet(event, headers, deps);
    if (event.httpMethod === "POST") return await handlePost(event, headers, deps);
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  } catch (e) {
    console.log("invoices error:", e.message);
    return json(500, headers, { error: "Something went wrong handling the invoice." });
  }
};

// Exported for unit tests (test/invoices.test.js).
exports.handlePost = handlePost;
exports.handleGet = handleGet;
exports.buildInvoiceLines = buildInvoiceLines;
exports.loadJobForInvoice = loadJobForInvoice;
exports.loadInvoice = loadInvoice;
