# ICC API — integration contract (`/api/v1`)

The versioned API surface shared by every client of the ICC platform — the
website today, the field app next (D-003, D-012, D-014). One documented
contract, imported by both clients, so they cannot drift.

**Versioning.** Endpoints live under `/api/v1/*`. Breaking changes get a new
version prefix; additive changes (new optional fields, new endpoints) stay in
`v1`. `API_VERSION` is exported from [`index.ts`](index.ts).

**Types vs. runtime.** The serverless functions are CommonJS and validate
requests in JavaScript; the `.ts` files here are the **compile-time contract**
the TypeScript clients build against. When a server response shape changes,
update the matching interface here in the same change.

**Source of truth for figures.** Pricing, the out-of-area surcharge and the
deposit are computed **server-side** from [`shared/config`](../config) — never
trusted from the client. `shared/config/pricing.js` `quote()` and
`serviceArea.js` `isOutOfArea()` are the figures of record.

## Endpoints

### `POST /api/v1/quote`  →  Slice 3

Stateless itemised quote. No database, no auth, no secrets — pure compute over
the request body. Runs *alongside* the live `/api/chat` flow and changes no
existing behaviour.

- **Request:** [`QuoteRequest`](quote.ts) — `{ lines: [{ code, qty? }], postcode?, outOfArea? }`.
  Provide `postcode` and the server derives the out-of-area surcharge
  (D-011) via `isOutOfArea`; or pass `outOfArea` to override; with neither, a
  core (no-surcharge) quote is returned.
- **200:** [`QuoteResponse`](quote.ts) — priced lines, ex-VAT subtotal, the flat
  £15 + VAT surcharge when applicable, VAT (20%), inc-VAT total, and the 10%
  deposit (taken on the inc-VAT total).
- **400:** [`ApiError`](quote.ts) — invalid body, unknown item `code`, or invalid
  quantity.
- **Server:** [`server/netlify/functions/v1-quote.js`](../../server/netlify/functions/v1-quote.js).

Public by design: pricing is not sensitive, so CORS is open and there is no
per-IP rate limit (L-006 gates only money / shared-state paths — this endpoint
is neither). When v1 grows endpoints that write state or cost money, factor the
origin-allowlist + `rateLimit` helpers out of `chat.js` into a shared server lib
and apply them there.
