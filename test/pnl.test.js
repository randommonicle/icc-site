// D-039/D-042 operational P&L (pnl.js). buildPnl is pure so the aggregation, the
// end-exclusive period window, and float-drift are tested directly; handleGet is tested
// with injected loaders for the period validation and the not-ready (42P01) mapping. The
// reconciliation test proves the P&L revenue is the SAME receipts feed as the export.

const { test } = require("node:test");
const assert = require("node:assert");

const pnl = require("../server/netlify/functions/pnl.js");
const receipts = require("../server/netlify/functions/receipts.js");
const HEADERS = { "Content-Type": "application/json" };
const SEP = { from: "2026-09-01", to: "2026-09-30" };

test("buildPnl: revenue window is end-exclusive (23:59:59Z on `to` is in, next-day 00:00Z is out)", () => {
  const payments = [
    { date: "2026-09-30T23:59:59Z", type: "deposit", amount: 10 },
    { date: "2026-10-01T00:00:00Z", type: "deposit", amount: 20 },
    { date: "2026-08-31T23:59:59Z", type: "deposit", amount: 5 }, // before window
  ];
  const out = pnl.buildPnl(SEP, payments, []);
  assert.strictEqual(out.revenue, 10);
  assert.strictEqual(out.receipt_count, 1);
});

test("buildPnl: revenue by type + margin", () => {
  const payments = [
    { date: "2026-09-05T10:00:00Z", type: "deposit", amount: 7.5 },
    { date: "2026-09-20T10:00:00Z", type: "invoice_balance", amount: 67.5 },
  ];
  const expenses = [{ category: "fuel", amount: 20 }, { category: "materials", amount: 5 }];
  const out = pnl.buildPnl(SEP, payments, expenses);
  assert.strictEqual(out.revenue, 75);
  assert.strictEqual(out.revenue_by_type.deposit, 7.5);
  assert.strictEqual(out.revenue_by_type.invoice_balance, 67.5);
  assert.strictEqual(out.expenses, 25);
  assert.strictEqual(out.expenses_by_category.fuel, 20);
  assert.strictEqual(out.margin, 50);
});

test("buildPnl: sums round to 2dp (no float drift)", () => {
  const expenses = [{ category: "other", amount: 0.1 }, { category: "other", amount: 0.1 }, { category: "other", amount: 0.1 }];
  const out = pnl.buildPnl(SEP, [], expenses);
  assert.strictEqual(out.expenses, 0.3);
  assert.strictEqual(out.expenses_by_category.other, 0.3);
  assert.strictEqual(out.margin, -0.3);
});

test("buildPnl revenue reconciles with the export's receipts (single source)", () => {
  // A deposit job whose full-value invoice is paid, both receipts inside September.
  const depositRows = [{ id: "j1", deposit_ex_vat: 7.5, deposit_status: "paid", deposit_paid_at: "2026-09-01T10:00:00Z", customers: {} }];
  const invoiceRows = [{ job_id: "j1", amount_ex_vat: 75, paid_at: "2026-09-20T09:00:00Z", jobs: { deposit_ex_vat: 7.5, deposit_status: "paid", customers: {} } }];
  const payments = receipts.buildPayments(depositRows, invoiceRows);
  const out = pnl.buildPnl(SEP, payments, []);
  // deposit 7.5 + balance 67.5 = the full job value, exactly what the export would show.
  assert.strictEqual(out.revenue, 75);
  assert.strictEqual(out.receipt_count, 2);
});

test("handleGet 400s on a half-specified period", async () => {
  const res = await pnl.handleGet({ httpMethod: "GET", queryStringParameters: { from: "2026-09-01" } }, HEADERS, { supabase: {} });
  assert.strictEqual(res.statusCode, 400);
});

test("handleGet maps PostgREST's PGRST205 on the expenses table to a clean 503 (invoices already migrated)", async () => {
  // The state between applying 20260910120000 and 20260913120000: invoices load fine, the
  // expenses table is absent and PostgREST says PGRST205, not 42P01. Until L-040 this 500'd.
  const deps = {
    supabase: {},
    loadInvoiceRows: async () => [],
    loadPaidDepositRows: async () => [],
    loadExpensesInPeriod: async () => { throw Object.assign(new Error("Could not find the table 'public.expenses' in the schema cache"), { code: "PGRST205" }); },
  };
  const res = await pnl.handleGet({ httpMethod: "GET", queryStringParameters: SEP }, HEADERS, deps);
  assert.strictEqual(res.statusCode, 503);
  assert.match(JSON.parse(res.body).error, /not set up yet/i);
});

test("handleGet maps a pending migration (42P01) to a clean 503", async () => {
  const deps = {
    supabase: {},
    loadInvoiceRows: async () => [],
    loadPaidDepositRows: async () => [],
    loadExpensesInPeriod: async () => { throw Object.assign(new Error('relation "expenses" does not exist'), { code: "42P01" }); },
  };
  const res = await pnl.handleGet({ httpMethod: "GET", queryStringParameters: SEP }, HEADERS, deps);
  assert.strictEqual(res.statusCode, 503);
  assert.match(JSON.parse(res.body).error, /not set up yet/i);
});

test("handleGet computes the P&L for the period", async () => {
  const deps = {
    supabase: {}, now: "2026-09-15T00:00:00Z",
    loadInvoiceRows: async () => [{ job_id: "j1", amount_ex_vat: 75, paid_at: "2026-09-20T09:00:00Z", jobs: { deposit_status: "unpaid", customers: {} } }],
    loadPaidDepositRows: async () => [],
    loadExpensesInPeriod: async () => [{ category: "fuel", amount: 25 }],
  };
  const res = await pnl.handleGet({ httpMethod: "GET", queryStringParameters: SEP }, HEADERS, deps);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.revenue, 75);   // no deposit -> full invoice receipt
  assert.strictEqual(body.expenses, 25);
  assert.strictEqual(body.margin, 50);
});
