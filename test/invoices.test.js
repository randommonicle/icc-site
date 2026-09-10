// D-026 invoicing endpoint (invoices.js). Fake Supabase (chainable) + injected adapter
// fns, so these exercise the real routing, the completed-job gate, idempotency, the
// deposit-credit line, fail-closed provider handling and the status write with no network.

const { test } = require("node:test");
const assert = require("node:assert");

const inv = require("../server/netlify/functions/invoices.js");
const HEADERS = { "Content-Type": "application/json" };

// Chainable fake: every query ends in .limit(n); the handler(state) returns {data,error}
// based on the table, op ('select'|'insert'|'update') and eq filters it recorded.
function fakeSupabase(handler) {
  const calls = [];
  function builder(state) {
    return {
      select() { if (!state.op) state.op = "select"; return builder(state); },
      insert(row) { state.op = "insert"; state.payload = row; return builder(state); },
      update(patch) { state.op = "update"; state.payload = patch; return builder(state); },
      eq(col, val) { state.filters.push([col, val]); return builder(state); },
      order() { return builder(state); },
      limit() { calls.push(state); return Promise.resolve(handler(state) || { data: null, error: null }); },
    };
  }
  const sb = { from(table) { return builder({ table, op: null, payload: null, filters: [] }); } };
  sb.calls = calls;
  return sb;
}

function post(body) { return { httpMethod: "POST", body: JSON.stringify(body) }; }
async function parse(res) { return { status: res.statusCode, body: JSON.parse(res.body) }; }

const JOB = {
  id: "job-1", status: "completed", rooms: "lounge, stairs",
  estimated_price_ex_vat: 75, deposit_ex_vat: 7.5, deposit_status: "paid",
  customer_id: "cust-1", customers: { name: "A Body", email: "a@b.com" },
};

test("handlePost 503s when Supabase is not configured", async () => {
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "job-1" }), HEADERS, { supabase: null }));
  assert.strictEqual(res.status, 503);
});

test("handlePost rejects an unknown action", async () => {
  const sb = fakeSupabase(() => ({ data: [], error: null }));
  const res = await parse(await inv.handlePost(post({ action: "nope" }), HEADERS, { supabase: sb, invoicingConfigured: true }));
  assert.strictEqual(res.status, 400);
});

test("create 503s when invoicing is not configured", async () => {
  const sb = fakeSupabase(() => ({ data: [], error: null }));
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "job-1" }), HEADERS, { supabase: sb, invoicingConfigured: false }));
  assert.strictEqual(res.status, 503);
});

test("create 404s for an unknown job", async () => {
  const sb = fakeSupabase((s) => (s.table === "jobs" ? { data: [], error: null } : { data: [], error: null }));
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "nope" }), HEADERS, { supabase: sb, invoicingConfigured: true, createDraftFn: async () => { throw new Error("must not be called"); } }));
  assert.strictEqual(res.status, 404);
});

test("create 409s when the job is not completed", async () => {
  const sb = fakeSupabase((s) => (s.table === "jobs" ? { data: [{ ...JOB, status: "booked" }], error: null } : { data: [], error: null }));
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "job-1" }), HEADERS, { supabase: sb, invoicingConfigured: true }));
  assert.strictEqual(res.status, 409);
});

test("create is idempotent: an existing invoice is returned, no draft raised", async () => {
  const existing = { id: "inv-1", job_id: "job-1", status: "draft", amount_ex_vat: 75 };
  let drafted = false;
  const sb = fakeSupabase((s) => {
    if (s.table === "jobs") return { data: [JOB], error: null };
    if (s.table === "invoices" && s.op === "select") return { data: [existing], error: null };
    return { data: [], error: null };
  });
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "job-1" }), HEADERS, {
    supabase: sb, invoicingConfigured: true, createDraftFn: async () => { drafted = true; return {}; },
  }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.invoice.id, "inv-1");
  assert.strictEqual(drafted, false, "no second draft is raised for a job that already has an invoice");
});

test("create raises a draft with a deposit-credit line and stores the full value", async () => {
  let captured = null;
  const sb = fakeSupabase((s) => {
    if (s.table === "jobs") return { data: [JOB], error: null };
    if (s.table === "invoices" && s.op === "select") return { data: [], error: null };
    if (s.table === "invoices" && s.op === "insert") return { data: [{ id: "inv-9", ...s.payload }], error: null };
    return { data: [], error: null };
  });
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "job-1" }), HEADERS, {
    supabase: sb, invoicingConfigured: true,
    createDraftFn: async (input) => { captured = input; return { providerInvoiceId: "in_1", status: "draft", number: null, paymentUrl: null, amountDuePence: 6750 }; },
  }));
  assert.strictEqual(res.status, 200);
  // Full job value on the local row (revenue = full value, Decision A)...
  assert.strictEqual(res.body.invoice.amount_ex_vat, 75);
  assert.strictEqual(res.body.invoice.provider_invoice_id, "in_1");
  // ...and the paid deposit is a negative credit line to the rail.
  assert.strictEqual(captured.lines.length, 2);
  assert.strictEqual(captured.lines[0].amountPence, 7500);
  assert.strictEqual(captured.lines[1].amountPence, -750);
  assert.strictEqual(captured.customerEmail, "a@b.com");
});

test("create fails closed on a provider error and writes nothing", async () => {
  let inserted = false;
  const sb = fakeSupabase((s) => {
    if (s.table === "jobs") return { data: [JOB], error: null };
    if (s.table === "invoices" && s.op === "select") return { data: [], error: null };
    if (s.table === "invoices" && s.op === "insert") { inserted = true; return { data: [{}], error: null }; }
    return { data: [], error: null };
  });
  const res = await parse(await inv.handlePost(post({ action: "create", job_id: "job-1" }), HEADERS, {
    supabase: sb, invoicingConfigured: true, createDraftFn: async () => { throw new Error("Stripe 402: card declined"); },
  }));
  assert.strictEqual(res.status, 502);
  assert.strictEqual(inserted, false, "no local row is written when the draft fails");
});

test("send finalises a draft and reflects the sent status locally", async () => {
  const draftRow = { id: "inv-1", job_id: "job-1", status: "draft", provider_invoice_id: "in_1", number: null, payment_url: null };
  let sentId = null;
  const sb = fakeSupabase((s) => {
    if (s.table === "invoices" && s.op === "select") return { data: [draftRow], error: null };
    if (s.table === "invoices" && s.op === "update") return { data: [{ ...draftRow, ...s.payload }], error: null };
    return { data: [], error: null };
  });
  const res = await parse(await inv.handlePost(post({ action: "send", invoice_id: "inv-1" }), HEADERS, {
    supabase: sb, invoicingConfigured: true,
    sendFn: async (id) => { sentId = id; return { status: "sent", number: "ICC-0001", paymentUrl: "https://pay/in_1" }; },
  }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(sentId, "in_1");
  assert.strictEqual(res.body.invoice.status, "sent");
  assert.strictEqual(res.body.invoice.number, "ICC-0001");
});

test("send is a no-op on an already-sent invoice", async () => {
  const sentRow = { id: "inv-1", job_id: "job-1", status: "sent", provider_invoice_id: "in_1" };
  let called = false;
  const sb = fakeSupabase((s) => (s.table === "invoices" ? { data: [sentRow], error: null } : { data: [], error: null }));
  const res = await parse(await inv.handlePost(post({ action: "send", invoice_id: "inv-1" }), HEADERS, {
    supabase: sb, invoicingConfigured: true, sendFn: async () => { called = true; return {}; },
  }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(called, false, "a sent invoice is not re-finalised");
});

test("status marks paid_at when the provider reports paid", async () => {
  const openRow = { id: "inv-1", job_id: "job-1", status: "sent", provider_invoice_id: "in_1", paid_at: null };
  let patch = null;
  const sb = fakeSupabase((s) => {
    if (s.table === "invoices" && s.op === "select") return { data: [openRow], error: null };
    if (s.table === "invoices" && s.op === "update") { patch = s.payload; return { data: [{ ...openRow, ...s.payload }], error: null }; }
    return { data: [], error: null };
  });
  const res = await parse(await inv.handlePost(post({ action: "status", invoice_id: "inv-1" }), HEADERS, {
    supabase: sb, invoicingConfigured: true,
    statusFn: async () => ({ status: "paid", number: "ICC-0001", paymentUrl: "https://pay/in_1" }),
  }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.invoice.status, "paid");
  assert.ok(patch.paid_at, "paid_at is set when the invoice becomes paid");
});

test("handleGet lists invoices, optionally filtered by job_id", async () => {
  const rows = [{ id: "inv-1", job_id: "job-1" }, { id: "inv-2", job_id: "job-2" }];
  const sb = fakeSupabase(() => ({ data: rows, error: null }));
  const res = await parse(await inv.handleGet({ httpMethod: "GET", queryStringParameters: {} }, HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.invoices.length, 2);
});

test("handleGet derives 'overdue' for a sent invoice past its due date (not stored)", async () => {
  const rows = [
    { id: "inv-1", status: "sent", due_at: "2026-09-01T00:00:00Z" }, // past due -> overdue
    { id: "inv-2", status: "sent", due_at: "2026-12-01T00:00:00Z" }, // future due -> stays sent
    { id: "inv-3", status: "paid", due_at: "2026-09-01T00:00:00Z" }, // paid stays paid even if past due
    { id: "inv-4", status: "draft", due_at: null },                  // draft untouched
  ];
  const sb = fakeSupabase(() => ({ data: rows, error: null }));
  const res = await parse(await inv.handleGet({ httpMethod: "GET", queryStringParameters: {} }, HEADERS, { supabase: sb, now: "2026-09-10T00:00:00Z" }));
  const byId = Object.fromEntries(res.body.invoices.map((r) => [r.id, r.status]));
  assert.strictEqual(byId["inv-1"], "overdue");
  assert.strictEqual(byId["inv-2"], "sent");
  assert.strictEqual(byId["inv-3"], "paid");
  assert.strictEqual(byId["inv-4"], "draft");
});
