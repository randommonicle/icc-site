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

/** A priced line in the response. Money fields are GBP. */
export interface QuoteLine {
  code: string;
  label: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

/** `POST /api/v1/quote` success response (HTTP 200). Money fields are GBP. No VAT
 *  is applied (the business is not VAT-registered); the 10% deposit is taken on
 *  the total the customer pays. */
export interface QuoteResponse {
  currency: "GBP";
  lines: QuoteLine[];
  out_of_area: boolean;
  items_total: number;
  out_of_area_surcharge: number;
  total: number;
  deposit_rate: number;
  deposit: number;
}

/** Error response shape for v1 endpoints (HTTP 4xx/5xx). */
export interface ApiError {
  error: string;
}
