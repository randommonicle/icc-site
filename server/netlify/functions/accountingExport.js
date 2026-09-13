// D-026 build note 6 + D-039 — accounting export (GET /api/v1/accounting-export, admin-gated).
// A generic, tool-agnostic feed for Mark's accountant / MTD tool. Two entities:
//   - invoices REGISTER: the documents raised (full face value, status, dates).
//   - payments FEED: money-in EVENTS. Two-receipts model (Decision A): a paid deposit
//     (jobs.deposit_*) is one receipt and the invoice BALANCE (full - deposit) is a
//     second, so the feed sums to the full job value without double-counting or
//     misdating cash received. full = deposit + balance.
//
// Only ACTUAL receipts appear in payments: a deposit with deposit_status='paid', and an
// invoice with paid_at set. Refunded deposits are out of this first cut (only 'paid' is
// counted); refund reconciliation is a later slice. Unpaid invoices stay in the register.
//
// JSON by default; ?format=csv&entity=payments|invoices returns ONE CSV (a single sheet
// can hold one entity). The admin fetches with the Bearer and downloads the text, so no
// Content-Disposition is relied upon. Reads our own DB only, so it works whether or not
// the Stripe rail is configured.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// The invoices register + the per-invoice deposit info the balance derivation needs.
async function loadInvoiceRows(supabase) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id,job_id,number,status,amount_ex_vat,provider,provider_invoice_id,issued_at,due_at,paid_at,created_at,jobs(slot_date,deposit_ex_vat,deposit_status,customers(name,email))")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return data || [];
}

// Every PAID deposit, including jobs whose completion invoice does not exist yet — the
// deposit is cash received regardless of the invoice.
async function loadPaidDepositRows(supabase) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id,deposit_ex_vat,deposit_status,deposit_paid_at,stripe_payment_intent_id,customers(name,email)")
    .eq("deposit_status", "paid")
    .limit(2000);
  if (error) throw new Error(error.message);
  // TODO(backend-phase1/accounting-refunds): a refunded deposit (deposit_status='refunded')
  // is excluded here, so a paid-then-refunded deposit shows neither the receipt nor the
  // refund; a later slice should emit both as +/- events for period-accurate cash-in.
  return data || [];
}

// Invoices register: one row per invoice, 'overdue' derived from due_at (as the invoices
// list endpoint does — the stored status for an unpaid finalised invoice is 'sent').
function buildInvoiceRegister(invoiceRows, now) {
  const nowT = now ? new Date(now).getTime() : Date.now();
  return (invoiceRows || []).map((r) => {
    const job = r.jobs || {};
    const cust = job.customers || {};
    let status = r.status;
    if (status === "sent" && r.due_at && new Date(r.due_at).getTime() < nowT) status = "overdue";
    return {
      number: r.number || "",
      job_id: r.job_id || "",
      customer_name: cust.name || "",
      customer_email: cust.email || "",
      status: status || "",
      amount_ex_vat: Number(r.amount_ex_vat) || 0,
      issued_at: r.issued_at || "",
      due_at: r.due_at || "",
      paid_at: r.paid_at || "",
      created_at: r.created_at || "",
    };
  });
}

// Payments feed: money-in events (two-receipts, Decision A). A paid deposit is one
// receipt (at deposit_paid_at); a paid invoice is the BALANCE (full - deposit when the
// deposit was paid, else the full amount) at paid_at. The deposit and the balance never
// overlap, so full = deposit + balance. Sorted by date for a ledger feel.
function buildPayments(paidDepositRows, invoiceRows) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const payments = [];
  for (const j of (paidDepositRows || [])) {
    const cust = j.customers || {};
    payments.push({
      date: j.deposit_paid_at || "",
      type: "deposit",
      amount: round2(Number(j.deposit_ex_vat) || 0),
      job_id: j.id || "",
      customer_name: cust.name || "",
      customer_email: cust.email || "",
      reference: j.stripe_payment_intent_id || "",
    });
  }
  for (const r of (invoiceRows || [])) {
    if (!r.paid_at) continue; // only actual receipts, not documents
    const job = r.jobs || {};
    const cust = job.customers || {};
    const full = Number(r.amount_ex_vat) || 0;
    const depositPaid = job.deposit_status === "paid" ? (Number(job.deposit_ex_vat) || 0) : 0;
    payments.push({
      date: r.paid_at,
      type: depositPaid > 0 ? "invoice_balance" : "invoice_full",
      amount: round2(full - depositPaid),
      job_id: r.job_id || "",
      customer_name: cust.name || "",
      customer_email: cust.email || "",
      reference: r.number || r.provider_invoice_id || "",
    });
  }
  payments.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return payments;
}

const INVOICE_COLUMNS = [
  { key: "number", label: "Invoice number" },
  { key: "customer_name", label: "Customer" },
  { key: "customer_email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "amount_ex_vat", label: "Amount (GBP)" },
  { key: "issued_at", label: "Issued" },
  { key: "due_at", label: "Due" },
  { key: "paid_at", label: "Paid" },
  { key: "job_id", label: "Job ID" },
];

const PAYMENT_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount (GBP)" },
  { key: "customer_name", label: "Customer" },
  { key: "customer_email", label: "Email" },
  { key: "reference", label: "Reference" },
  { key: "job_id", label: "Job ID" },
];

// RFC 4180 quoting: wrap a cell in quotes and double its quotes if it holds a comma,
// quote or newline, so a customer name with a comma cannot shift columns.
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, columns) {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = (rows || []).map((row) => columns.map((c) => csvCell(row[c.key])).join(",")).join("\r\n");
  return header + "\r\n" + body + (body ? "\r\n" : "");
}

// deps injectable for the tests: supabase, loadInvoiceRows/loadPaidDepositRows, now.
async function handleGet(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const qs = event.queryStringParameters || {};
  const format = String(qs.format || "json").toLowerCase();
  let invoiceRows, depositRows;
  try {
    invoiceRows = await (deps.loadInvoiceRows || loadInvoiceRows)(supabase);
    depositRows = await (deps.loadPaidDepositRows || loadPaidDepositRows)(supabase);
  } catch (e) {
    console.log("accounting-export load failed:", e.message);
    return json(500, headers, { error: "Could not load the accounting data." });
  }
  const invoices = buildInvoiceRegister(invoiceRows, deps.now);
  const payments = buildPayments(depositRows, invoiceRows);

  if (format === "csv") {
    const entity = String(qs.entity || "payments").toLowerCase();
    const csv = entity === "invoices" ? toCsv(invoices, INVOICE_COLUMNS) : toCsv(payments, PAYMENT_COLUMNS);
    return { statusCode: 200, headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" }, body: csv };
  }
  return json(200, headers, { invoices, payments, generated_at: new Date(deps.now || Date.now()).toISOString() });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const auth = await requireAdmin(event);
  if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const supabase = getSupabaseAdmin();
  try {
    if (event.httpMethod === "GET") return await handleGet(event, headers, { supabase });
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  } catch (e) {
    console.log("accounting-export error:", e.message);
    return json(500, headers, { error: "Something went wrong building the export." });
  }
};

// Exported for unit tests (test/accounting-export.test.js).
exports.handleGet = handleGet;
exports.buildInvoiceRegister = buildInvoiceRegister;
exports.buildPayments = buildPayments;
exports.toCsv = toCsv;
exports.INVOICE_COLUMNS = INVOICE_COLUMNS;
exports.PAYMENT_COLUMNS = PAYMENT_COLUMNS;
