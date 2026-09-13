// API v1 — expenses contract (D-039). The cost-log half of the operational P&L, shared by
// the website admin today and the field app later. The server of record is
// server/netlify/functions/expenses.js (admin-gated). Money is GBP; no VAT (D-024).

/** The cost categories, matching the Postgres `expense_category` enum. */
export type ExpenseCategory = "fuel" | "materials" | "equipment" | "insurance" | "software" | "other";

/** An expense row. `amount` is GBP (> 0); `job_id` is null for a general overhead. */
export interface ExpenseRecord {
  id: string;
  created_at: string;
  updated_at: string;
  incurred_on: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  job_id: string | null;
  notes: string | null;
}

/** `POST /api/v1/expenses` body (create). */
export interface ExpenseCreateRequest {
  incurred_on: string;
  category: ExpenseCategory;
  amount: number;
  description?: string | null;
  job_id?: string | null;
  notes?: string | null;
}

/** `PATCH /api/v1/expenses` body (update): `id` plus any subset of the editable fields. */
export interface ExpenseUpdateRequest {
  id: string;
  incurred_on?: string;
  category?: ExpenseCategory;
  amount?: number;
  description?: string | null;
  job_id?: string | null;
  notes?: string | null;
}

/** `POST`/`PATCH` success response. */
export interface ExpenseResponse {
  ok: true;
  expense: ExpenseRecord;
}

/** `GET /api/v1/expenses[?from=&to=]` response (optional YYYY-MM-DD period on `incurred_on`). */
export interface ExpenseListResponse {
  expenses: ExpenseRecord[];
}
