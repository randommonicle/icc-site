# ICC Backend Phase 1 — Build Plan & Checkpoint Log

**Goal.** Flesh out the operational back end: invoicing, a jobs status dashboard, expenditure + a light operational P&L, and a Mark-only operator assistant. Build the first beta versions locally (no deploy), dormant behind credential flags where they touch external services.

**Provenance.** Ben's steer, 2026-09-10: "flesh out the back end, invoice generation, job logger, profit and loss tracking, expenditure, the back-end chat bot that assists Mark only". Grounded in two Opus survey passes (decisions/design + code/schema) plus primary-source verification of the load-bearing facts. Follows the D-027 `docs/*_PLAN.md` + checkpoint-log precedent.

**Deploy posture.** Everything here lands LOCAL/UNPUSHED on top of the held 2026-09-09 batch. No push, no deploy, per Ben. Schema migrations are validated on the local Supabase Docker stack only; Ben applies them to the hosted DB himself (the auto-mode classifier blocks agent schema writes). See [MEMORY / icc-supabase-db-access].

---

## Current state (verified)

- **`invoices` table already exists but is entirely unused** (`supabase/migrations/20260605115456_init.sql:140-154`): `id, job_id→jobs(restrict), status (invoice_status default draft), amount_ex_vat numeric(10,2) >0, issued_at, due_at, paid_at, created_at, updated_at`. No number, line items, provider pointer, or payment URL. `messages.invoice_id` FK + the `invoice_chase` message kind already anticipate invoice comms. Zero references in `server/`.
- **Enums** (`init.sql:30-34`): `invoice_status = draft|sent|paid|overdue`; `job_status = enquiry|booked|in_progress|completed|cancelled` (only booked/completed/cancelled are ever written today; enquiry/in_progress await the field app).
- **Stripe rail is built and proven in Test mode for deposits** (D-004/D-036): `paymentProvider.js` (Checkout Session + constant-time webhook verify), `stripe-webhook.js` (compare-and-set mark-paid). Deposit columns live on `jobs` (`deposit_status/deposit_paid_at/stripe_checkout_session_id/stripe_payment_intent_id`, migration `20260906120000`).
- **A branded A4 PDF generator exists** (`generateJobCardPDF` via `pdfkit`, in `chat.js`) — the precedent for an invoice PDF.
- **Admin surface** (`admin.html`, served at `/admin`, `requireAdmin`-gated via Supabase Auth JWT + `ADMIN_EMAILS` allowlist): job cards with per-card status, mark-complete (D-025), provisional accept/decline (D-027), a handoffs queue with AI draft/send. Filters are **date-based only** (all/upcoming/today); no status axis. The "Est. Revenue" stat regex-parses the price display string client-side, ignoring completion status.
- **Versioned API is one endpoint** (`POST /api/v1/quote`; `shared/contract/`). Every admin op (`bookings.js`, `handoffs.js`, `bookingAdmin.js`, `reviewRequest.js`) is on non-versioned `/api/*`. The contract instructs: new state/money endpoints go under `/api/v1/*`, and "factor the origin-allowlist + `rateLimit` helpers out of `chat.js` into a shared server lib" when that happens (`shared/contract/README.md:42-44`).
- **AI reuse base for the operator assistant:** `runAssistantTurn` in `chat.js` is a reusable agentic loop (tool_use/pause_turn, round-bounded, exported + tested); `handoffs.js` `draftReplyForHandoff` is the existing **operator-facing, input-minimised** AI precedent (only the captured question is sent, never PII; draft and send are separate actions; `damage_risk`/`customer_request` never auto-drafted). Model source is `shared/config/models.js` (`text = claude-sonnet-4-6`).
- **RLS** is enabled with **zero policies** on every table (`init.sql:185-194`); the server uses the service-role key (bypasses RLS). **Any new table must `enable row level security` in the same migration** or the locked-by-default posture silently breaks.
- **Migration numbering:** `YYYYMMDDHHMMSS_desc.sql`, applied lexically. Highest existing is `20260906120000`; the next is `> ` that (today 2026-09-10, so `20260910HHMMSS_...`). Each carries an inline post-apply catalog verification block + a pgTAP test in `supabase/tests/`.
- **Test pattern:** `node --test`, each file builds its own inline fakes (chainable fake Supabase, injected `now`/send fns). Functions export a pure `handlePost(event, headers, deps)`. `admin-html-syntax.test.js` guards `admin.html` edits.

---

## Two decisions to settle (recommended resolutions; Ben to confirm/override)

### Decision A — deposit-vs-invoice reconciliation
The customer pays a 10% deposit at booking. When the completion invoice is raised, it must not double-charge.

**Recommendation:** the invoice records the **full job value** (so revenue = the full service value, correct for P&L), with the **paid deposit shown as a credit line**, leaving **balance due = full − deposit**. `invoices.amount_ex_vat` stores the full total; the Stripe draft carries the job line items plus a negative "Deposit already paid" line so the hosted amount-due is the balance. ROADMAP parks *full* deposit/balance reconciliation in Phase 3; the beta implements the credit so nobody is double-charged and refines later. Dormant behind `STRIPE_SECRET_KEY`, so no live money rides on this yet.

### Decision B — P&L / expenditure crosses D-026's boundary (propose **D-039**)
D-026 (`DECISIONS.md:334-336`) deliberately split "invoicing = platform owns" from "accounting/MTD = Mark's/his accountant's duty, platform only feeds it via a generic export". Expenditure and P&L sit on the accounting side of that line.

**Recommendation (draft D-039, needs Ben's sign-off):** build a **light operational P&L** in-platform — revenue the platform already owns (invoices/jobs) minus a simple expense log Mark keeps — for his own at-a-glance visibility. This is explicitly **operational management insight, not formal tax accounting**: it does not do MTD digital records, quarterly ITSA, bank reconciliation, or filing, and the generic accounting export (D-026 build note 6) still feeds whatever MTD tool Mark lands on. It narrowly amends D-026 to allow cost data in-platform for operational visibility while formal tax accounting stays external. Prompt Ben to ratify as D-039 before this beta is more than a beta.

---

## Cross-cutting constraints

1. **Field app is a first-class client (D-003/D-012/D-014):** business logic server-side; new operational endpoints (invoices, jobs, expenses, P&L) go under `/api/v1/*` with a matching `.ts` contract interface, so the field app inherits them instead of forcing a retrofit.
2. **Server-authoritative figures (single source of truth):** invoice line items and the revenue side of P&L derive from `shared/config/pricing.js` `quote()` + the job row, never a client figure or the assistant's free text. No VAT (Mark not registered; `_ex_vat` names are legacy, net = gross).
3. **RLS on every new table** (enabled, no policies; service-role writes). pgTAP test + inline post-apply verification for every migration (db-migration-verification).
4. **Dormant behind a credentials flag** (the house pattern): each external-service feature reports "not configured" and changes nothing when its key is unset.
5. **Spend/auth guards:** admin endpoints gate on `requireAdmin` (fails closed). The operator assistant (LLM = spend) additionally gets the origin-allowlist + per-IP rate limit via the shared-guards refactor, plus a capped round/`max_uses` bound (guard-the-spend-paths, lock-at-the-chokepoint).
6. **AI-surface discipline** for the operator assistant: descriptive not prescriptive, read-only tools, input minimisation, human-gated for anything outbound, spend fails closed.
7. **No deploy.** Local commits on the held batch; the non-`[skip ci]` tip rule from the 2026-09-10 handover still applies at the eventual push.

---

## Build order & checklist

Ordered by what is decided and what unblocks the rest. Each beta is its own small commit(s) with tests, staged with a checkpoint-log entry below.

### Beta 1 — Jobs status dashboard  (safe, no external dep) — [x]
- **Files:** `admin.html` (add a status filter axis: outstanding vs completed vs cancelled, alongside the existing date filters; fix `updateStats` to derive revenue from job data and respect status; status badges on cards). Optionally `server/netlify/functions/bookings.js` (accept a `status` query param for server-side filtering; the field app will want this).
- **Tests:** `admin-html-syntax.test.js` (guards the edit); `bookings.js` tests if the endpoint changes.
- **Out of scope:** job-photo storage; the dead `enquiry`/`in_progress` statuses (field app); a full `/api/v1/jobs` endpoint (note as follow-up).

### Beta 2 — Invoicing (D-026)  (the anchor; dormant behind `STRIPE_SECRET_KEY`) — [ ]
- **Migration** `20260910HHMMSS_invoices_provider.sql`: extend `invoices` with `provider text not null default 'stripe'`, `provider_invoice_id text`, `number text`, `payment_url text`; extend `invoice_status` with `void`, `uncollectible`; keep RLS (already enabled). Inline post-apply verification + pgTAP test.
- **Adapter** `server/netlify/functions/invoiceProvider.js`: `createDraftInvoice()`, `sendInvoice()`, `getInvoiceStatus()`; Stripe first; `INVOICE_PROVIDER` selects (default `stripe`); keys server-side only; `isInvoicingConfigured()` gate.
- **Endpoint** `server/netlify/functions/invoices.js` at `/api/v1/invoices` (netlify.toml redirect): `requireAdmin`; create-draft (find-or-create Stripe customer by email, line items from `pricing.js` + job, deposit credit per Decision A, insert local `invoices` row), review/adjust amount, send, status-reflect. Idempotent (skip if `provider_invoice_id` set); fail-closed.
- **Webhook** extend `stripe-webhook.js`: map `invoice.finalized|paid|payment_failed|voided` → `invoice_status` (constant-time signature verify; compare-and-set).
- **Admin UI** `admin.html`: an invoice panel per completed job (create/review/adjust/send/status).
- **Contract** `shared/contract/invoice.ts` + `index.ts` re-export.
- **Accounting export:** minimal invoices+payments CSV/JSON (generic, no tool coupling).
- **Tests:** `invoice-provider.test.js`, `invoices.test.js`, extend `stripe-webhook.test.js`; `admin-html-syntax` for the UI.
- **Note:** shared-guards refactor deferred to Beta 4; admin gate + idempotency + fail-closed is the defence here.

### Beta 3 — Expenditure + light operational P&L  (pending Decision B / D-039) — [ ]
- **Decision first:** draft D-039 in `DECISIONS.md`; prompt Ben.
- **Migration** `expenses` table: `id, created_at, updated_at, incurred_on date, category (enum: fuel|materials|equipment|insurance|software|other), description, amount numeric(10,2) >0, job_id uuid null references jobs(id) on delete set null, notes`. RLS enabled. pgTAP + verification.
- **Endpoint** `/api/v1/expenses` (`requireAdmin`, CRUD) + `/api/v1/pnl` (period revenue from invoices/jobs − expenses).
- **Admin UI:** expense entry + a P&L summary panel.
- **Contract** types.
- **Tests:** endpoint + pure aggregation.

### Beta 4 — Operator assistant (Mark-only)  (last; pending guardrail decision / D-040) — [ ]
- **Decision first:** draft D-040 (the structural bound for a read-across-the-business operator AI surface, modelled on D-020); prompt Ben.
- **Prerequisite refactor:** extract the origin-allowlist + per-IP `rateLimit` from `chat.js` into a shared server lib (`shared/contract/README.md:42-44`); behaviour-preserving, locked by `hardening.test.js`/`origins.test.js`.
- **Endpoint** `/api/v1/operator-chat` (`requireAdmin` + shared guards + capped rounds/`max_uses`): reuses `runAssistantTurn`; a distinct operator system prompt; **read-only** tools (query jobs / outstanding invoices / revenue / expenses / P&L); descriptive output; never sends anything outbound itself.
- **Admin UI:** an operator-assistant panel.
- **Contract** types.
- **Tests:** loop reuse, tool routing, gate/spend-cap, fail-closed.

---

## Out of scope (phase 1)
Job-photo storage (bucket not stood up); field-app UI; live Stripe money (go-live gate: domain cutover + noindex removal); formal MTD accounting/filing (stays external, D-026); PECR-gated marketing (Phase 4); full deposit/balance reconciliation beyond crediting the paid deposit (Phase 3); calendar clash-check (parked, D-033).

---

## Checkpoint log (append one entry per commit, staged with it)

_Unit opened 2026-09-10._

- **Beta 1 — jobs status dashboard** (this commit). `admin.html` only. Added Outstanding / Completed / Cancelled status filters keyed off the real `jobs.status` (new pure `jobStatusCategory(b)` helper), a `.status-cancelled` badge, status-accurate card labels for booked / in_progress / cancelled, and excluded cancelled jobs from the Upcoming / This Week / Revenue stats. Legacy Blobs rows (no `job_status`) match only the date filters, by design. **Deviation:** kept the existing revenue display-string parse (a numeric revenue field is deferred to the P&L slice, `TODO(backend-phase1/pnl)` planted in `admin.html`); did not add a `/api/v1/jobs` endpoint (follow-up for the field app). **Verify:** `node --test` green incl. the `admin-html-syntax` guard; full dashboard behaviour is login-gated, so Ben confirms live.
