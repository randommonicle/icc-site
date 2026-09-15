// D-026 build note 6 / D-039 — accounting export (accountingExport.js). The receipt math
// is the load-bearing part, so the pure builders are tested directly; handleGet is tested
// with injected loaders (no network) for the json/csv routing.

const { test } = require("node:test");
const assert = require("node:assert");

const acc = require("../server/netlify/functions/accountingExport.js");
const HEADERS = { "Content-Type": "application/json" };

// A completed job that took a paid £7.50 deposit and whose full-value £75 invoice is paid.
const DEPOSIT_JOB = {
  id: "job-1", deposit_ex_vat: 7.5, deposit_status: "paid",
  deposit_paid_at: "2026-09-01T10:00:00.000Z", stripe_payment_intent_id: "pi_1",
  customers: { name: "A Body", email: "a@b.com" },
};
const PAID_INVOICE = {
  id: "inv-1", job_id: "job-1", number: "ICC-0001", status: "paid", amount_ex_vat: 75,
  paid_at: "2026-09-20T09:00:00.000Z", due_at: "2026-09-15T00:00:00.000Z", created_at: "2026-09-06T00:00:00Z",
  jobs: { deposit_ex_vat: 7.5, deposit_status: "paid", customers: { name: "A Body", email: "a@b.com" } },
};

test("payments: a deposit job yields TWO receipts (deposit + balance) that sum to the full value", () => {
  const payments = acc.buildPayments([DEPOSIT_JOB], [PAID_INVOICE]);
  assert.strictEqual(payments.length, 2);
  const deposit = payments.find((p) => p.type === "deposit");
  const balance = payments.find((p) => p.type === "invoice_balance");
  assert.ok(deposit && balance, "one deposit receipt and one balance receipt");
  assert.strictEqual(deposit.amount, 7.5);
  assert.strictEqual(deposit.date, "2026-09-01T10:00:00.000Z"); // dated when the deposit was received
  assert.strictEqual(balance.amount, 67.5);                     // full 75 - deposit 7.5
  assert.strictEqual(balance.date, "2026-09-20T09:00:00.000Z"); // dated when the invoice was paid
  // The invariant: the two receipts reconstruct the full job value, no double count.
  assert.strictEqual(deposit.amount + balance.amount, 75);
});

test("payments: a paid invoice with NO paid deposit is one full receipt", () => {
  const noDepInvoice = { ...PAID_INVOICE, jobs: { deposit_status: "unpaid", customers: { name: "A Body", email: "a@b.com" } } };
  const payments = acc.buildPayments([], [noDepInvoice]);
  assert.strictEqual(payments.length, 1);
  assert.strictEqual(payments[0].type, "invoice_full");
  assert.strictEqual(payments[0].amount, 75);
});

test("payments: an UNPAID invoice is not a receipt (excluded from payments)", () => {
  const unpaid = { ...PAID_INVOICE, status: "sent", paid_at: null };
  const payments = acc.buildPayments([], [unpaid]);
  assert.strictEqual(payments.length, 0);
});

test("payments: a paid deposit with no invoice yet still appears as a receipt", () => {
  const payments = acc.buildPayments([DEPOSIT_JOB], []);
  assert.strictEqual(payments.length, 1);
  assert.strictEqual(payments[0].type, "deposit");
  assert.strictEqual(payments[0].amount, 7.5);
});

test("register: 'overdue' is derived from due_at (unpaid, past due), paid stays paid", () => {
  const rows = [
    { id: "i1", job_id: "j1", status: "sent", amount_ex_vat: 75, due_at: "2026-09-01T00:00:00Z", jobs: { customers: {} } },
    { id: "i2", job_id: "j2", status: "sent", amount_ex_vat: 75, due_at: "2026-12-01T00:00:00Z", jobs: { customers: {} } },
    { id: "i3", job_id: "j3", status: "paid", amount_ex_vat: 75, due_at: "2026-09-01T00:00:00Z", jobs: { customers: {} } },
  ];
  const reg = acc.buildInvoiceRegister(rows, "2026-09-10T00:00:00Z");
  const byJob = Object.fromEntries(reg.map((r) => [r.job_id, r.status]));
  assert.strictEqual(byJob["j1"], "overdue");
  assert.strictEqual(byJob["j2"], "sent");
  assert.strictEqual(byJob["j3"], "paid");
});

test("toCsv quotes a value containing a comma, and doubles embedded quotes", () => {
  const rows = [{ customer_name: 'Smith, John "JJ"', amount: 75 }];
  const cols = [{ key: "customer_name", label: "Customer" }, { key: "amount", label: "Amount (GBP)" }];
  const csv = acc.toCsv(rows, cols);
  const lines = csv.trim().split("\r\n");
  assert.strictEqual(lines[0], "Customer,Amount (GBP)");
  assert.strictEqual(lines[1], '"Smith, John ""JJ""",75');
});

test("handleGet returns JSON with both entities by default", async () => {
  const deps = {
    supabase: {}, now: "2026-09-25T00:00:00Z",
    loadInvoiceRows: async () => [PAID_INVOICE],
    loadPaidDepositRows: async () => [DEPOSIT_JOB],
  };
  const res = await acc.handleGet({ httpMethod: "GET", queryStringParameters: {} }, HEADERS, deps);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.invoices.length, 1);
  assert.strictEqual(body.payments.length, 2);
  assert.ok(body.generated_at);
});

test("handleGet returns text/csv for the payments entity", async () => {
  const deps = {
    supabase: {},
    loadInvoiceRows: async () => [PAID_INVOICE],
    loadPaidDepositRows: async () => [DEPOSIT_JOB],
  };
  const res = await acc.handleGet({ httpMethod: "GET", queryStringParameters: { format: "csv", entity: "payments" } }, HEADERS, deps);
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /text\/csv/);
  const lines = res.body.trim().split("\r\n");
  assert.strictEqual(lines[0], "Date,Type,Amount (GBP),Customer,Email,Reference,Job ID");
  assert.strictEqual(lines.length, 3); // header + deposit + balance
});

test("handleGet maps a pending invoices migration (42703 on the provider columns) to a clean 503", async () => {
  // receipts.loadInvoiceRows names the provider columns, so hosted without 20260910120000
  // answers 42703 (the live state on 2026-09-14, L-040). This mapping had no test before.
  const deps = {
    supabase: {},
    loadInvoiceRows: async () => { throw Object.assign(new Error("column invoices.provider does not exist"), { code: "42703" }); },
    loadPaidDepositRows: async () => [],
  };
  const res = await acc.handleGet({ httpMethod: "GET", queryStringParameters: {} }, HEADERS, deps);
  assert.strictEqual(res.statusCode, 503);
  assert.match(JSON.parse(res.body).error, /not set up yet/i);
});

test("handleGet 503s when Supabase is not configured", async () => {
  const res = await acc.handleGet({ httpMethod: "GET", queryStringParameters: {} }, HEADERS, { supabase: null });
  assert.strictEqual(res.statusCode, 503);
});
