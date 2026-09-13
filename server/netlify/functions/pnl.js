// D-039 operational P&L — GET /api/v1/pnl?from&to (admin-gated). A LIGHT operational view:
// revenue MINUS expenses = margin for a period, so Mark can see "am I making money" at a
// glance. NOT formal accounting (D-039). Revenue is cash RECEIVED in the period (D-041,
// D-042): the SAME receipts feed the accountant export uses (receipts.buildPayments), so
// the P&L margin reconciles with that feed. Expenses are the cost rows with incurred_on in
// the period. Period via the shared period.js (default current month, UTC calendar days).
//
// No credential gate: a missing table/column on hosted (a pending migration — 42P01 or
// 42703) returns a clean 503 "not set up yet", not a 500. Receipts are loaded in full then
// filtered to the window in JS (single-sourced with the export); fine at this scale.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const receipts = require("./receipts.js");
const { parsePeriod, endExclusiveISO } = require("./period.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// A pending migration on hosted surfaces as undefined_table (42P01) or undefined_column
// (42703) — the P&L reads invoices provider columns + the expenses table. Map both to a
// clean 503 so a deploy-before-migration fails legibly rather than as a 500.
function pgNotReady(error) {
  const code = error && error.code;
  return code === "42P01" || code === "42703";
}

async function loadExpensesInPeriod(supabase, from, to) {
  const { data, error } = await supabase
    .from("expenses").select("category,amount,incurred_on")
    .gte("incurred_on", from).lte("incurred_on", to)
    .limit(5000);
  if (error) throw error;
  return data || [];
}

// Pure aggregation (exported for tests). Receipts count when their date is within
// [from 00:00Z, (to + 1 day) 00:00Z) (end-exclusive, so 23:59:59Z on `to` is in);
// expenses are already period-filtered by the caller (incurred_on). round2 once at the end
// of each sum so float drift (e.g. three 0.1s) cannot leak into the figures.
function buildPnl(period, payments, expenseRows) {
  const startT = Date.parse(period.from + "T00:00:00Z");
  const endT = Date.parse(endExclusiveISO(period.to));
  let revenue = 0;
  const revenueByType = {};
  let receiptCount = 0;
  for (const p of (payments || [])) {
    const t = Date.parse(p.date);
    if (!Number.isFinite(t) || t < startT || t >= endT) continue;
    const a = Number(p.amount) || 0;
    revenue += a;
    revenueByType[p.type] = round2((revenueByType[p.type] || 0) + a);
    receiptCount += 1;
  }
  let expenses = 0;
  const expensesByCategory = {};
  for (const e of (expenseRows || [])) {
    const a = Number(e.amount) || 0;
    expenses += a;
    expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + a);
  }
  revenue = round2(revenue);
  expenses = round2(expenses);
  return {
    from: period.from,
    to: period.to,
    revenue,
    expenses,
    margin: round2(revenue - expenses),
    revenue_by_type: revenueByType,
    expenses_by_category: expensesByCategory,
    receipt_count: receiptCount,
    expense_count: (expenseRows || []).length,
  };
}

async function handleGet(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const period = parsePeriod(event.queryStringParameters, deps.now);
  if (period.error) return json(400, headers, { error: period.error });

  let invoiceRows, depositRows, expenseRows;
  try {
    invoiceRows = await (deps.loadInvoiceRows || receipts.loadInvoiceRows)(supabase);
    depositRows = await (deps.loadPaidDepositRows || receipts.loadPaidDepositRows)(supabase);
    expenseRows = await (deps.loadExpensesInPeriod || loadExpensesInPeriod)(supabase, period.from, period.to);
  } catch (e) {
    if (pgNotReady(e)) return json(503, headers, { error: "The P&L is not set up yet (apply the pending migrations to the database)." });
    console.log("pnl load failed:", e.message);
    return json(500, headers, { error: "Could not load the P&L data." });
  }
  const payments = receipts.buildPayments(depositRows, invoiceRows);
  return json(200, headers, buildPnl(period, payments, expenseRows));
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
    console.log("pnl error:", e.message);
    return json(500, headers, { error: "Something went wrong building the P&L." });
  }
};

// Exported for unit tests (test/pnl.test.js).
exports.handleGet = handleGet;
exports.buildPnl = buildPnl;
exports.loadExpensesInPeriod = loadExpensesInPeriod;
