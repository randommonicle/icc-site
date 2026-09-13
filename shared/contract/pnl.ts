// API v1 — operational P&L contract (D-039, D-042). A LIGHT operational view, not formal
// accounting. Revenue is cash RECEIVED in the period (the D-041 receipts feed, the same one
// the accountant export uses, so the margin reconciles). Money is GBP; no VAT (D-024).

/** `GET /api/v1/pnl[?from=&to=]` response. Period is YYYY-MM-DD (UTC calendar days);
 *  default (both absent) is the current calendar month. `margin = revenue - expenses`. */
export interface PnlResponse {
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  margin: number;
  /** Cash received, split by receipt kind: deposit / invoice_balance / invoice_full. */
  revenue_by_type: Record<string, number>;
  /** Expenses split by category (fuel / materials / equipment / insurance / software / other). */
  expenses_by_category: Record<string, number>;
  receipt_count: number;
  expense_count: number;
}
