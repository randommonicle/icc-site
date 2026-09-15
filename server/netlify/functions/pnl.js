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
const { parsePeriod } = require("./period.js");
const { schemaNotReady } = require("./schemaNotReady.js");
// The pure calculation lives in pnlCalc.js (client-free) so the operator assistant can
// share it; re-exported below so test/pnl.test.js and any caller keep the same import.
const { buildPnl } = require("./pnlCalc.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// A pending migration on hosted surfaces as undefined_column (42703, the invoices provider
// columns) or, for the expenses table, PostgREST's PGRST205 (not in its schema cache);
// schemaNotReady.js names the full set. Map it to a clean 503 so a deploy-before-migration
// fails legibly rather than as a 500. Until 2026-09-14 this keyed on 42P01 and answered
// 503 only because the invoices load ran first (L-040).

async function loadExpensesInPeriod(supabase, from, to) {
  const { data, error } = await supabase
    .from("expenses").select("category,amount,incurred_on")
    .gte("incurred_on", from).lte("incurred_on", to)
    .limit(5000);
  if (error) throw error;
  return data || [];
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
    if (schemaNotReady(e)) return json(503, headers, { error: "The P&L is not set up yet (apply the pending migrations to the database)." });
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
