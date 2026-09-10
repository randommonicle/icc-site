// API v1 — invoicing endpoint contract (D-026, D-003/D-012).
//
// The request/response shapes for `/api/v1/invoices`, shared by every client (the
// website admin today, the field app's "complete + invoice" next, ROADMAP:122) so they
// never drift. The server implementation of record is
// server/netlify/functions/invoices.js (admin-gated; drives Stripe Invoicing via
// invoiceProvider.js). Money fields are GBP; no VAT is applied (the business is not
// VAT-registered, D-024), so amount_ex_vat equals the gross figure.

/** The invoice lifecycle, matching the Postgres `invoice_status` enum. `sent` is an
 *  open (finalised, awaiting-payment) invoice; `overdue` is derived from `due_at`. */
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void" | "uncollectible";

/** `POST /api/v1/invoices` actions: create a draft against a completed job, send
 *  (finalise + email) a draft, or refresh status from the provider. */
export type InvoiceAction = "create" | "send" | "status";

/** `POST /api/v1/invoices` request body. `create` needs `job_id` (with an optional
 *  reviewed `amount_ex_vat` override, in GBP); `send`/`status` take `invoice_id` or
 *  `job_id`. */
export interface InvoiceRequest {
  action: InvoiceAction;
  job_id?: string;
  invoice_id?: string;
  amount_ex_vat?: number;
}

/** The local invoice record (the `invoices` row). The face value `amount_ex_vat` is the
 *  FULL job value; a paid deposit is credited on the provider invoice so the amount DUE
 *  is the balance (Decision A, docs/BACKEND_PHASE1_PLAN.md). `provider_invoice_id`,
 *  `number` and `payment_url` come from the rail (null until the draft/finalise). */
export interface InvoiceRecord {
  id: string;
  job_id: string;
  status: InvoiceStatus;
  amount_ex_vat: number;
  provider: string;
  provider_invoice_id: string | null;
  number: string | null;
  payment_url: string | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `POST /api/v1/invoices` success response (HTTP 200). `note` is present when the
 *  action was a no-op (e.g. an invoice already existed for the job). */
export interface InvoiceResponse {
  ok: true;
  invoice: InvoiceRecord;
  note?: string;
}

/** `GET /api/v1/invoices[?job_id=...]` success response. */
export interface InvoiceListResponse {
  invoices: InvoiceRecord[];
}
