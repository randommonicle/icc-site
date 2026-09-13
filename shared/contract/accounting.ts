// API v1 — accounting export contract (D-026 build note 6, D-039).
//
// A generic, tool-agnostic feed for Mark's accountant / MTD tool, shared by every client
// (the website admin today, the field app later). The server of record is
// server/netlify/functions/accountingExport.js. Money fields are GBP; no VAT (D-024).
//
// Two entities: an invoices REGISTER (documents raised) and a payments FEED (money-in
// events). Two-receipts model (Decision A, docs/BACKEND_PHASE1_PLAN.md): a paid deposit
// and the invoice balance are separate receipts that sum to the full job value, so the
// feed neither double-counts nor misdates cash received.

/** One row of the invoices register (documents raised). `amount_ex_vat` is the FULL job
 *  value; `status` includes `overdue`, derived from `due_at`. */
export interface AccountingInvoiceRow {
  number: string;
  job_id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  amount_ex_vat: number;
  issued_at: string;
  due_at: string;
  paid_at: string;
  created_at: string;
}

/** A money-in event's kind: the paid deposit, the invoice balance (full − deposit) when a
 *  deposit was paid, or the full invoice amount when no deposit was taken. */
export type AccountingPaymentType = "deposit" | "invoice_balance" | "invoice_full";

/** One money-in event (an actual receipt, not a document). `amount` is the GBP received in
 *  this event; `reference` is the Stripe payment_intent (deposit) or the invoice number/id. */
export interface AccountingPaymentRow {
  date: string;
  type: AccountingPaymentType;
  amount: number;
  job_id: string;
  customer_name: string;
  customer_email: string;
  reference: string;
}

/** `GET /api/v1/accounting-export` JSON response (the default; `?format=csv&entity=…`
 *  returns a single CSV sheet instead). */
export interface AccountingExportResponse {
  invoices: AccountingInvoiceRow[];
  payments: AccountingPaymentRow[];
  generated_at: string;
}
