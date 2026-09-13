// D-039/D-042 operational P&L — the PURE calculation, client-free (Beta 4 slice 3).
//
// Moved verbatim out of pnl.js so the operator assistant's tools (D-040) can compute the
// same P&L through the read-only facade without importing pnl.js, which requires the
// service-role client at module level for its endpoint. The endpoint keeps using this
// function (pnl.js re-exports it), so the admin P&L and the assistant's P&L cannot
// diverge — one calculation, two callers. Imports only period.js. CommonJS for the
// functions and the plain-Node `node --test` runner.

const { endExclusiveISO } = require("./period.js");

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

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

module.exports = { buildPnl, round2 };
