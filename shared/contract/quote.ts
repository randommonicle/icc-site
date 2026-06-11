// API v1 — quote endpoint contract (D-003, D-012).
//
// The request/response shapes for `POST /api/v1/quote`, shared by every client
// (the website today, the field app next) so they never drift. The server
// implementation of record is server/netlify/functions/v1-quote.js, which
// computes the figures via shared/config/pricing.js `quote()` and
// serviceArea.js `isOutOfArea()`. Keep these types in step with that function's
// return shape — the server is CommonJS and validates in JS, these types are the
// compile-time contract its TypeScript clients build against.

/** One requested priced line. `code` must be a known pricing item code
 *  (see shared/config/pricing.js `items`); `qty` defaults to 1. */
export interface QuoteLineRequest {
  code: string;
  qty?: number;
}

/** `POST /api/v1/quote` request body. Provide `postcode` for an accurate quote
 *  (the server derives the out-of-area surcharge from it via `isOutOfArea`), or
 *  pass `outOfArea` explicitly to override it. With neither, a core
 *  (no-surcharge) quote is returned. */
export interface QuoteRequest {
  lines: QuoteLineRequest[];
  postcode?: string;
  outOfArea?: boolean;
}

/** A priced line in the response. Money fields are GBP, ex-VAT. */
export interface QuoteLine {
  code: string;
  label: string;
  qty: number;
  unit_ex_vat: number;
  line_ex_vat: number;
}

/** `POST /api/v1/quote` success response (HTTP 200). Money fields are GBP.
 *  All are ex-VAT except `vat`, `total_inc_vat` and `deposit_inc_vat`. The 10%
 *  deposit is taken on the inc-VAT total (what the customer actually pays). */
export interface QuoteResponse {
  currency: "GBP";
  lines: QuoteLine[];
  out_of_area: boolean;
  items_ex_vat: number;
  out_of_area_surcharge_ex_vat: number;
  subtotal_ex_vat: number;
  vat_rate: number;
  vat: number;
  total_inc_vat: number;
  deposit_rate: number;
  deposit_inc_vat: number;
}

/** Error response shape for v1 endpoints (HTTP 4xx/5xx). */
export interface ApiError {
  error: string;
}
