# D-027 provisional booking + email-accept — build plan

Status: DRAFT, awaiting Ben's sign-off. Design source: the cross-agent review
`agent-exchange/REVIEW_d027-3pm-provisional_2026-09-01.md` (Claude hub + GPT + Gemini,
converged 2026-09-01). This plan turns that converged design into a commit sequence.
Branch: `feat/d027-per-day-hours`. Nothing merges until the whole slice is green.

## What we are building

A late-finishing job (finish past the auto-confirm line) is TAKEN and HOLDS its slot,
but is marked provisional and routed to Mark for a one-click **accept/decline from the
notification email**. Under the line, bookings auto-confirm exactly as today. This is
what makes D-027's soft close safe: without it the branch auto-confirms a 1pm seven-hour
job finishing at 8pm with no operator approval (`chat.js:812-814,845` — no finish cap).

## New dependencies

**None.** Reuses `crypto` (built-in, the constant-time `safeEqual` at `bookings.js:8-16`),
Resend (already wired in `chat.js`), Supabase, `requireAdmin` (`adminAuth.js:54`), and the
existing Astro/Netlify-functions/`netlify.toml` redirect patterns.

## Decided (Ben, 2026-09-01)

**Auto-confirm line = 15:00 finish; advertised public close = 3pm.** A job finishing at or
before 3pm auto-confirms; a job finishing after 3pm holds provisionally and needs Mark's
accept. The advertised (JSON-LD) close moves to 3pm as well (`jsonld_close_job_hours` 3 → 2,
giving 1pm + 2h = 15:00), so the advertised close and the auto-confirm line COINCIDE at 3pm —
no split-brain, since a job finishing past the advertised close is exactly the one that needs
Mark. Last START stays 1pm (unchanged). The two remain SEPARATE constants with a coherence
test. Wants a DECISIONS.md D-027 addendum.

Open confirmation (does not block Phase 1): "not accepting any new booking past 1pm without
Mark" is read as the finish-based rule above (finish after 3pm → Mark), so a 1pm booking of
1–2h still auto-confirms. Confirm before Phase 2 if instead EVERY 1pm start must need Mark.

## Migration (Ben applies; jobs table is empty, zero data risk)

New file `supabase/migrations/<ts>_jobs_confirmation_state.sql`:
- `create type confirmation_state as enum ('auto_confirmed','awaiting_operator','operator_confirmed','operator_declined');`
- `alter table jobs add column confirmation_state confirmation_state not null default 'auto_confirmed';`
  (set explicitly at insert; default keeps existing/again-run rows valid)
- `alter table jobs add column operator_decided_at timestamptz;`
- Token columns: `operator_action_token_hash text`, `operator_action_token_expires_at timestamptz`,
  `operator_action_token_used_at timestamptz`. Store only the SHA-256 hash, never the plaintext.
- Audit logging of the accept/decline customer notice (reuses the `messages` table +
  `message_status` draft/sent/failed for claim-then-send durability): `alter type message_kind
  add value 'provisional_confirmed'; ... 'provisional_declined';`. NB `ALTER TYPE ... ADD VALUE`
  cannot run in the same transaction that then uses it, and Postgres runs each `add value`
  outside the migration's implicit tx — apply, then the app uses the values on later calls.
  **This audit logging is the one deferrable part** — if we want a leaner first migration, the
  notification can be best-effort with admin-resend recovery and no `messages` row.
- Post-apply verification query (catalog-direct, db-migration-verification) shipped in the file.

## File list (by phase)

**Phase 1 — deploy-gate fixes (independent, valuable alone)**
- `server/netlify/functions/bookingsStore.js` — commit the DONE `start_minute` work (currently
  uncommitted); then make `availabilityFromJobs` minute-precise (return booked minute-ranges,
  not floored hours) so a 12:30 job blocks 12:30–13:30, fixing the F2 gap GPT found.
- `server/netlify/functions/chat.js` — `checkAvailability` collision check becomes minute-aware
  to match. Correct the wrong "occupancy stays hour-quantised by design" comments here and at
  the `bookingsStore.js` line my step-1 pass added.

**Phase 2 — config**
- `shared/config/tradingHours.js` — `auto_confirm_by = "15:00"` constant + `autoConfirmByMinutes()`
  accessor; change `jsonld_close_job_hours` 3 → 2 so the advertised (JSON-LD) close is 3pm; a
  coherence test asserts `auto_confirm_by <= public close` (they coincide at 15:00). Check
  `site/src/pages/contact.astro` / `hoursLines` for any hard-coded close to keep the copy honest.

**Phase 3 — write path**
- `server/netlify/functions/bookingsStore.js` — `bookingToJobRow` computes `confirmation_state`
  (auto_confirmed when finish ≤ line, else awaiting_operator) and generates the action token
  (store the hash) PRE-insert; `jobRowToAdminRecord` + `fetchBookingsFromJobs` surface the new
  columns.
- `server/netlify/functions/chat.js` — `handleBooking` provisional branch: customer message,
  return `{provisional:true}`, operator email carries the accept/decline link, customer email
  reflects "held, Mark will confirm" vs "confirmed".
- `site/src/pages/book.astro` — render the provisional vs confirmed outcome (it currently
  hard-says "Booking Confirmed / secured" and ignores the payload, `book.astro:414-465`).
- Prompt (`chat.js`) — steer larger jobs to the earliest free start.

**Phase 4 — action path (new)**
- `server/netlify/functions/bookingAction.js` — GET returns the read-only confirm page context;
  POST does the constant-time token check + atomic compare-and-set transition
  (`WHERE confirmation_state='awaiting_operator'`, 0 rows → 409); decline sets
  `job_status='cancelled'` + `operator_declined` and claims-then-sends the customer email.
- `netlify.toml` — redirect `/api/booking-action` → the function (pattern at `:27-48`).
- `site/src/pages/confirm.astro` (or similar) — read-only page, token in the URL FRAGMENT,
  Accept/Decline POST buttons, no customer PII before token verification, no-referrer.

**Phase 5 — admin fallback**
- `admin.html` — show `confirmation_state` + `operator_decided_at`; fallback Accept/Decline/resend
  controls for `awaiting_operator` jobs, gated by `requireAdmin`. (The email is the normal route;
  this is the recovery path for a lost/spam-filtered action email — `chat.js:1202-1207` proves the
  email can fail while the booking still persists.)

**Phase 6 — tests, docs, verify**
- Tests (see below); `supabase/tests/*` pgTAP updates; DECISIONS.md D-027 addendum; NEXT_SESSION.

## Test list

- `test/bookings-store.test.js` — confirmation_state computed from finish vs line; token hash
  stored not plaintext; admin record surfaces the new fields.
- `test/trading-hours.test.js` — `auto_confirm_by` value; the coherence invariant
  (auto-confirm line within [earliest finish from last_start, public close]); minute-precise
  availability (a 12:30 job blocks the 13:00 offer).
- `test/bookings-chat.test.js` — handleBooking: under-line auto-confirms; over-line returns
  provisional + booked hold; the availability→confirm seam no longer offers an unbookable :30 slot.
- New `test/booking-action.test.js` — token verify (constant-time, wrong/expired/used → reject);
  CAS transition (double-accept → 409; accept-then-decline → 409); decline releases + notifies;
  GET never mutates.
- `test/chat-client-parity.test.js` — the client renders the provisional outcome the server sends.
- `test/admin-html-syntax.test.js` (if it exists) — admin renders with the new controls.
- pgTAP: drop the stale `jobs_trading_hours` assertion; add confirmation_state + minute cases;
  enable one real `:30` integration insert (`ICC_SUPABASE_IT=1`).

## Out of scope / deferred (flagged, not silently dropped)

- Saturday `weekend_premium` figure (`TODO(D-027/saturday-premium)`) — Mark, unchanged.
- D-028 travel bands — separate slice.
- Auto-expiry of an un-actioned provisional hold — only if Mark defines an expiry rule
  (both seats agreed: do not invent one). `TODO(D-027/provisional-expiry)` if we stub it.

## Verification before merge (one-real-ride)

Full `node --test` + `npm run build --prefix site`; apply the migration + run its verification
query; then a REAL end-to-end: one auto-confirm booking, one provisional booking → the actual
email → click the real link → the page → POST accept, and a decline → customer email + slot
freed. The seams the unit tests mock.

## Commit sequence

Small commits, each with its tests, on `feat/d027-per-day-hours`. Roughly one per file-group
above (P1 availability, P2 config, P3a write-path, P3b customer-facing, P4 endpoint+page,
P5 admin, P6 tests/docs). A checkpoint note per commit (checkpoint-log). Migration applied by
Ben between P2 and P3. Nothing merges to main until P6 is green and the real ride passes.

## Progress (checkpoint log)

- **Phase 1 — DONE, green (245 tests, 242 pass / 3 skip).** No site changes, no build needed.
  - `f7e2877` — persist `start_minute` (0/30) + render half-hour starts in the admin record.
  - `615ec7a` — minute-precise availability: `availabilityFromJobs` returns `[start,end)` ranges,
    `checkAvailability` overlaps offered starts against them (mirrors the DB `span_minutes`
    exclusion). Fixes the F2 regression (a 12:30 job no longer lets 13:00 be offered then
    rejected at confirm). Regression tests added. Corrected the two false "hour-quantised"
    comments, including the one my Phase-1a commit introduced.
- **Phase 2 — DONE, green (246 tests; site builds 23 pages).**
  - `211461a` — `auto_confirm_by="15:00"` + `autoConfirmByMinutes()` + coherence test;
    `jsonld_close_job_hours` 3→2 (advertised JSON-LD close now 3pm). `contact.astro` states no
    close, so no copy change.
- **Migration APPLIED + VERIFIED (2026-09-01):**
  `supabase/migrations/20260901200000_jobs_confirmation_state.sql`. Applied via the new
  `scripts/db-push.sh` (session pooler; direct host is IPv6-only, project unlinked). Verified
  from the live catalog: the 5 `jobs` columns present with the right types/defaults, the
  `confirmation_state` enum's 4 labels, and both `provisional_*` `message_kind` values.
  Phase 3 is unblocked.
- **1pm rule — CONFIRMED (Ben, 2026-09-01):** finish-based. A job finishing at/before 15:00
  auto-confirms (so a 1pm 1–2h job auto-confirms); only a finish after 15:00 routes to Mark.
- **Phase 3a-i — DONE, green (249 tests).** `ef1bf24` — store layer: `bookingToJobRow` carries
  `confirmation_state` + token hash/expiry from opts; insert threads them; admin read-back surfaces
  them. Defaults keep everything `auto_confirmed`, so no behaviour change yet.
- **Phase 3a-ii — DONE, green (252 tests).** `1c9dd07` — `handleBooking` computes provisional
  (finish > 15:00, Postgres only), generates the token (plaintext → Mark's email link, SHA-256
  hash + end-of-booking-day expiry → DB), the OPERATOR email flags it + links to the confirm page
  (token in the URL fragment), and the payload carries `provisional`. On-time bookings unchanged.
- **Phase 3b — DONE, green (255 tests; builds 23 pages).** `64734bc` — customer email (Booking
  Received / "Mark will confirm the time" for provisional; confirmed wording for on-time),
  `book.astro` renders the held-not-confirmed outcome from `provisional` (parity-guarded), Mark's
  PDF gets a PROVISIONAL banner. Copy approved by Ben. **Phase 3 complete.**
- **Phase 4 — DONE, green (274 tests, 271 pass / 3 skip; site builds 24 pages). NOT yet committed.**
  - `server/netlify/functions/bookingAction.js` — `/api/booking-action`, POST-only (405 otherwise).
    Actions `view`/`accept`/`decline`. Token auth is CONSTANT-TIME (`tokenMatches`: SHA-256 +
    `crypto.timingSafeEqual` against the stored hash); a job UUID alone gets 404 with no PII. Accept →
    `operator_confirmed` (slot kept); decline → `operator_declined` + `status='cancelled'` (hold
    released). Idempotent + monotonic via an atomic CAS (`WHERE confirmation_state='awaiting_operator'
    AND token unused`; 0 rows → 409), so double-accept and accept-then-decline change nothing. Claim-
    then-send: the winning CAS is the claim, so the customer is emailed at most once; a send failure
    logs a `messages` row `status='failed'` (admin-resend recovery, Phase 5), never a second message.
    `view` returns the summary only after the token verifies.
  - `netlify.toml` — `/api/booking-action` → the function.
  - `site/src/pages/booking-action.astro` — standalone read-only page (NOT BaseLayout), noindex +
    no-referrer, token read from the URL FRAGMENT and sent only in the POST body; static structure
    filled via textContent (injection-safe). Excluded from the sitemap (`site/astro.config.mjs` filter;
    verified: 23 locs, booking-action absent).
  - `test/booking-action.test.js` — 19 tests: token auth (wrong/short/non-hex/expired/used → reject),
    the CAS (double-accept → 409; accept-then-decline → 409, monotonic), decline releases + notifies,
    claim-then-send failure logs 'failed' while the decision stands, `view` gates PII, GET → 405.
  - Refactor (P4a, behaviour-preserving): the per-IP limiter moved to `rateLimit.js` (+ `blobStore.js`)
    so this endpoint shares ONE limiter, not a divergent copy; `chat.js` imports them and re-exports
    `rateLimit` (test/hardening.test.js unchanged, still green). The endpoint gets a per-IP cap
    (`rl:bookaction`, 60/hr, matching the availability cap) as defence-in-depth; the single-use
    token is the PRIMARY control (Ben's call, 2026-09-02).
  - OPEN: the accept/decline customer email COPY is flagged pending Ben's sign-off (comment in
    bookingAction.js), mirroring the Phase 3b copy approval.
- **Phase 5 — NEXT:** admin (`admin.html buildCard`) — display `confirmation_state` + `operator_decided_at`;
  fallback Accept/Decline/resend for `awaiting_operator` jobs, gated by `requireAdmin`.
- **Phase 6:** pgTAP (drop the stale `jobs_trading_hours` assertion; add confirmation_state + minute
  cases; enable one real `:30` insert), full suite + build, one-real-ride, then merge. (The DECISIONS.md
  D-027 addendum + LESSONS L-024 already landed — commit 5b0fe9f.)
