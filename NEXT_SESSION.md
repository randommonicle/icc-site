# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

---

## Netlify personal access token — regenerated 30 July 2026, non-expiring (expiry watch closed)

The `NETLIFY_TOKEN` env var in Netlify (a personal access token, `nfp_…`, used for Blobs auth) **expired on 24 July 2026** and was **regenerated on 30 July 2026 as a non-expiring token** — there is no future expiry date to track, so the annual watch this section used to carry is now closed. The new value is set in Netlify (Site settings → Environment variables) and in the work machine's local `.env`; **the home machine's `.env` still needs the new value** (see [MACHINE_LAYOUT.md](MACHINE_LAYOUT.md) for the two-machine setup).

**If this token is ever revoked or rotated**, the same silent failure applies as before: the per-IP rate limit on `/api/chat` (+ availability/booking) fails open (L-001/L-006/L-007), legacy Blobs test bookings drop off the admin list (live Postgres bookings are unaffected), and `scripts/delete-booking.js` stops authenticating. **The fix (~2 min):** generate a new token at Netlify → **User settings → Applications → Personal access tokens → New token**, paste it into **Site settings → Environment variables → `NETLIFY_TOKEN`**, then **trigger a redeploy** (Netlify functions pick up new env vars only on the next deploy, not the moment the var is saved) — and update the gitignored local `.env` on both machines. **Paste it carefully:** a leading space before the value produces 401s indistinguishable from an auth failure — see L-007's 30 July 2026 addendum.

---

## This session (2026-09-07, later): read the handover; NO code changed. Resolved next-action #3 (index.html rollback) to a recommendation + staged a cross-agent review of it (could NOT run it — computer-use control denied while Ben was away); prepared the #1 ride's cleanup SQL. Tree clean, 361 pass.

**UPDATE (same session, after Ben replied "1 send to gmail / 2 keep it / 3 agree"):** Ben chose to KEEP index.html, so I made it a genuine rollback. Executed: ported `book.astro`'s brace-aware `extractBookingReady` into `index.html` byte-identically plus the honest failure fallback (keeping the deliberate 01242 number), and added a byte-identical parity guard and an extract-and-run test to `test/chat-client-parity.test.js` so the rollback cannot silently drift from the served client again. Local commit `35ad6b0` on `main`, unpushed. Verified: 373 tests, 364 pass / 0 fail / 9 skip; `npm run build --prefix site` green. STILL OUTSTANDING for `index.html` to be a fully viable rollback: its Phase-0 DRAFT privacy notice (`index.html:364-420`) still needs the go-live wording that `privacy.astro` already carries (go-live legal wording, Ben's call, not done). The "de-designate, NOT executed" framing below is SUPERSEDED by this keep-and-fix. This summary was also emailed to ben.graham240689@gmail.com.

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: no reading — /context unavailable in this harness. No compaction/summarisation warnings seen; treated green. Ben handed the session the reins (permissions bypassed) while away, with explicit constraints: do NOT push, do NOT delete anything from git, keep local only. This session is analysis + staging + prep: no behavioural code change, no push, no deletion. One local `[skip ci]` commit (this handover); review the wording before any push.**

**What I did NOT do, and why.** The #1 task (the post-deploy booking RIDE) is a "with Ben" task: it fires a real confirmation email to Mark (operator) + the customer, and writes a live Postgres `jobs` row that only a SQL delete can clean (`scripts/delete-booking.js` is Blobs-only; the Supabase MCP is unauthed in this harness). Firing a live booking I cannot clean up, unsupervised, was the wrong call — I prepared it instead (SQL below). I attempted the cross-agent review Ben asked for, but the computer-use screen-control consent for ChatGPT + Antigravity was **denied** (no one to approve the card while Ben was away); I did not retry. I made no unsupervised code changes to the regulated-adjacent codebase.

**Verified this session (primary source):**
- Tree clean; `node --test` = 370 tests, **361 pass / 0 fail / 9 skip** — matches the prior entry, baseline green.
- The prior handover's two `index.html` claims are ACCURATE: the non-greedy parse bug at `index.html:811` (also `:815`/`:820`), and the Phase-0 DRAFT privacy notice with `[to confirm: ...]` placeholders (`index.html:364-420`).
- The SERVED client (`site/src/pages/book.astro`) is sound: I traced the whole response path (parser, `CONVERSATION_END`, citations, `provisional`, `emailStatus` both halves, validated `calLink`, honest error/catch fallbacks). No other L-008-class silent seam found; the recent batch + `booking-ready-parse.test.js` + `chat-client-parity.test.js` lock the seams.

**Next-action #3 — index.html's fate: RECOMMENDATION = DE-DESIGNATE it as the rollback (Ben's call; NOT executed).** Evidence (all on `main`, verified today):
- Not served — `netlify.toml:5-6` publishes `site/dist`; `CLAUDE.md:43/131/194`. Nothing loads it, so it gives no signal when it rots.
- Known-broken as a rollback — `index.html:811` is the exact non-greedy `BOOKING_READY` parser that caused the 2026-09-06 outage; flipping it live reintroduces it.
- Would regress the privacy notice — `index.html:364-420` is a Phase-0 DRAFT with placeholders; the served `site/src/pages/privacy.astro:9` has them removed. Rolling back swaps a go-live notice for a placeholder draft (UK GDPR accuracy, not cosmetics).
- Parity is notional — `test/chat-client-parity.test.js` checks `index.html` for ONE field (`emailStatus`, lines 81-92); parser/citations/provisional are asserted against `book.astro` only, so it cannot catch parser drift, and did not.
- It drifts, provably — PR#49 dropped features for a month (test header lines 2-9); the names removal reached `index.html` (`DECISIONS.md:219`) but the parse fix did not.
- A better rollback exists — Netlify deploy-history "publish deploy", or `git revert` + redeploy of a known-good `site/` build. `index.html`-as-rollback duplicates the platform, worse.
- Never actually decided — the designation is a carried-forward default from D-001 (`DECISIONS.md:18`), not a weighed call.

Honest counter-case (so Ben can decide now): the only scenario where serving `index.html` beats a Netlify/git rollback is a total `site/` build-toolchain failure where no prior deploy is safe to re-publish, which is not reachable on Netlify (it serves already-built immutable deploys, no rebuild). The keep-case is weak. Third option if a fallback client is wanted cheaply: a CI guard forcing `index.html`'s parser to track `book.astro` (mirror the marker-extractor test against it) so it cannot silently rot, at the cost of dual-maintenance for a file nothing loads. **My recommendation: de-designate.** Given the no-git-deletion rule this session, that means at minimum stop calling it "the rollback" in `CLAUDE.md` + the parity-test header and record the decision; keep or bin the file itself when Ben chooses. If accepted this is a DECISIONS.md entry (it finalises the D-001 default) — prompt to write it. (`index.html`'s old 01242 number is deliberate, `DECISIONS.md:418` — separate concern, leave it.)

**Cross-agent review — STAGED, NOT RUN.** Opener: `exchange/REVIEW_index-html-rollback_2026-09-07.md` (challenger-Claude: I put up "de-designate", spokes attack; 4 specific attacks incl. steelman-the-keep-case). Ready-to-paste kickoffs for both seats: `exchange/KICKOFF_index-html-rollback_2026-09-07.md` (ASTRA = GPT/ChatGPT desktop; GEMPRO = Gemini/Antigravity). Both gitignored scratch. To run: give each app folder access, paste its block, fire ONE at a time (PROTOCOL §3). If Ben grants computer-use next session (or relays), I can drive it.

**#1 RIDE — cleanup SQL ready (FK-verified in `supabase/migrations/20260605115456_init.sql`; Ben runs it against the HOSTED DB via the aws-1-eu-west-2 session pooler).** Replace the email with the throwaway used. Order matters: `jobs.customer_id → customers` is ON DELETE RESTRICT, so delete jobs first; `job_photos`/`job_assessments` cascade, `invoices` is RESTRICT (a fresh test booking has none), `messages.job_id` set-null.
```sql
-- 1. VERIFY (expect exactly one row):
select j.id, j.slot_date, j.start_hour, j.start_minute, j.status,
       j.estimated_price_ex_vat, j.deposit_ex_vat, c.email, c.name
from jobs j join customers c on c.id = j.customer_id
where c.email = 'THROWAWAY@EXAMPLE.COM';
-- 2. Delete the test job(s):
delete from jobs where customer_id in (select id from customers where email = 'THROWAWAY@EXAMPLE.COM');
-- 3. Delete the throwaway customer (optional):
delete from customers where email = 'THROWAWAY@EXAMPLE.COM';
```
The ride is also the first proof of the structured-pricing half: confirm the `jobs` row has `deposit_ex_vat`/`estimated_price_ex_vat` populated (that path has never completed end-to-end).

**Deferred / carried forward (unchanged unless noted):** T-1 express-request capture (HIGH, +2 months of go-live); `£15` prose repeated in 5 area guides (single-sourcing into static markdown needs a design call — flagged, not fixed); `admin.html:359` empty catch (operator-only, minor); Stripe switch-on (`docs/STRIPE_SETUP.md`); calendar (Mark's share, then `scripts/verify-calendar-freebusy.js`); solicitor pass on `/terms` (T-1).

**Next actions (ordered):**
1. Do the post-deploy booking ride with Ben (throwaway email); then run the cleanup SQL above.
2. Decide index.html: accept de-designate (record a DECISIONS entry + soften `CLAUDE.md`/the parity-test header) or keep + add the CI parser-guard. Fire the staged cross-agent review first if the second opinions are wanted.
3. Stripe switch-on when ready; calendar once Mark shares; solicitor on `/terms`.

**Traps / working agreements (this session):**
- Computer-use screen control needs a live human to approve its consent card; "permissions bypassed" does NOT cover it. Autonomous cross-agent driving is blocked without that approval; the file relay still needs Ben to paste the kickoffs (or grant control).
- The served client is proven at unit + deploy level only; the RIDE is still the sole proof of the live seam (L-008).
- No code changed, nothing pushed, nothing deleted (Ben's constraints); one local `[skip ci]` handover commit, review before pushing.

---

## This session (2026-09-07): post-deploy ride caught a HIGH booking regression (structured pricing shipped the booking flow BROKEN); fixed + hardened via a Gemini cross-agent review; GATE 0 T-1 cancellation right shipped; a11y folds. 7-commit batch DEPLOYED to main + verified live.

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: no reading — /context unavailable in this harness. No compaction/summarisation warnings seen; treated as green. Deliberate wrap: Ben asked to deploy then hand over.**

> **FIRST TASK NEXT SESSION (Ben's instruction): the post-deploy booking RIDE.** The parse fix is live and the fixed code is confirmed serving, but NO real booking has completed end-to-end since the fix — do this before anything else. With Ben: place one real booking on the noindex site with a throwaway email, confirm `check_availability` then `confirm_booking` both fire and it reaches a real confirmation, confirm the `jobs` row has `deposit_ex_vat`/`estimated_price_ex_vat` populated, then DELETE the test job by SQL (Ben — `scripts/delete-booking.js` is Blobs-only, it will NOT clean the Postgres row). Full detail in Verification and next-action #1 below.

**SUPERSEDES the 2026-09-06 entry's next-actions #1 (Ben run the FF deploy — DONE, that 23-commit batch is live) and #2 (post-deploy structured-pricing ride — DONE and it FAILED, surfacing the bug below; the ride is RE-OPEN post-fix, see Verification).**

**Session goal.** Read the handover, do the post-deploy structured-pricing ride, act on what it found; fold in low-risk wins; deploy; hand over.

**Branch and worktree.** Home machine, standard checkout `C:\Users\bengr\Projects\ICC\icc-site`. Branch **`fix/booking-ready-parse`** (7 commits) fast-forward-merged to `main` and PUSHED: `main` = `origin/main` = **`6aeb118`**. **Netlify built it (verified live: `/book/` serves `extractBookingReady` x3 + `bookingAttempted` x2; `/terms` serves the cancellation clause; `X-Robots-Tag: noindex` intact; home/about no longer leak `TODO(trust-stats)`).** Tree clean. Tests 361 pass / 0 fail (9 skip); `npm run build --prefix site` green.

**THE BUG (verified).** The 2026-09-06 structured-pricing deploy shipped the booking flow BROKEN. The client parsed `BOOKING_READY:{…}` with a non-greedy regex `/BOOKING_READY:(\{[\s\S]*?\})/` that truncates at the first inner brace; D-004's nested `quote_lines` array made the capture invalid JSON, `JSON.parse` threw, `processBooking` never ran — every structured-pricing booking silently failed to confirm (no slot held, no emails, customer dead-ended at "confirming your slot"). *Verified on a live ride: only 5 `/api/chat` POSTs, no `check_availability`/`confirm_booking`.* Unit tests + build were green because only the server handler (`handleBooking`) is tested, never the browser-side parse. Recorded as the L-008 addendum.

**What landed (7 commits on `6aeb118`, newest first; all tests+build verified; deploy verified live):**
- `6aeb118` fix(a11y): photo upload keyboard-reachable (visually-hidden, not `display:none`) + guard test. *verified (local build: input `display:block`, tabIndex 0, focusable).*
- `2ec82a9` fix(a11y): `aria-label` the remove-photo button; convert leaked `TODO(trust-stats)` HTML comments to Astro `{/* */}` (were in View Source on home/about). *verified live.*
- `e7cb570` fix(booking): harden `extractBookingReady` (require `/BOOKING_READY:\s*\{/`, reject empty object; gate the failure fallback on the same pattern) + strengthen cross-surface tests. From the cross-agent review. *verified.*
- `9d7f274` docs(decisions): accept the CCRs geographical-address gap (T-2), D-016 addendum.
- `5572ffd` feat(terms): statutory 14-day cancellation right (GATE 0 T-1), single-sourced in `shared/config/policy.js` `cancellationRightParagraphs()`, rendered on `/terms` + the confirmation email. *verified (built /terms contains it).*
- `0a4d589` docs(lessons): L-008 addendum — the shipped BOOKING_READY silent drop.
- `6e9bf12` fix(booking): brace-aware BOOKING_READY parse so quote_lines bookings confirm + `test/booking-ready-parse.test.js` (extracts the REAL inline fn and runs it). *verified.*

**Cross-agent review (Gemini = handle GEMPRO).** Adversarial review of the parse fix + T-1 over `exchange/REVIEW_batch_2026-09-06.md` (gitignored scratch; ARTIFACT staged there). Converged. Gemini found 4 valid issues: (1) extractor grabbed the first `{` after the marker → a stray/empty leading brace mis-parses; (2) the failure fallback fired on any prose mention of the token; (3) the part-performance clause overstates ICC's rights (no express-request capture built) — a misleading-action risk; (4) weak source-string cross-surface test. 1/2/4 fixed in `e7cb570`; 3 is Ben's keep-as-is call (below).

**Ben's decisions this session:**
- **T-1 para 4 (part-performance) KEPT as-is** despite the GEMPRO misleading-action flag, as an owner risk-acceptance, WITH a HIGH-priority review flagged **within 2 months of go-live**. Anchors: `TODO(T-1/express-request-capture)` in `shared/config/policy.js`; `docs/LEGAL_REVIEW_TERMS_2026-09.md` T-1. No solicitor review of /terms at all — the GATE 0 first-pass wording is the live wording.
- **T-2 geographical address: keep "available on request", at go-live too** (small sole trader, accept the gap; publish Mark's address only if challenged). D-016 addendum.

**In flight / NOT done:** nothing half-coded (tree clean). The handover commit is the only pending write (will be `[skip ci]`, safe — all code already deployed + built, L-030).

**Deferred items (with anchors):**
- **T-1 express-request capture — HIGH, review within 2 months of go-live.** `TODO(T-1/express-request-capture)` in `shared/config/policy.js`; `docs/LEGAL_REVIEW_TERMS_2026-09.md` T-1. Build the capture or soften para 4 by then.
- **`index.html` rollback is STALE** — beyond the intentionally-kept old 01242 phone, it still has the old non-greedy parse bug (`index.html:811`) and stale `[to confirm]` privacy placeholders. Not a viable fallback. Decide: fix it, or de-designate/remove it (and `test/chat-client-parity.test.js` reads it). Not folded this session.
- Minor: `£15` surcharge repeated as prose in 5 area guides (`site/src/content/areas/*.md`, agrees today, latent drift); one empty catch at `admin.html:359` (operator-only).
- Pre-existing: Stripe switch-on (apply migration `20260906120000` to the HOSTED DB + set keys + webhook, `docs/STRIPE_SETUP.md`); calendar (Mark's share then `scripts/verify-calendar-freebusy.js`); phone test-call 01452 452356; D-029 two-day split; Saturday premium.

**Verification still outstanding:**
- **THE POST-DEPLOY BOOKING RIDE — top task, unverified.** The parse fix is deployed and the fixed code is confirmed serving, but NO real booking has completed end-to-end since the fix. First task next session: with Ben, place one real booking on the noindex site with a throwaway email, confirm `check_availability` then `confirm_booking` both fire and it reaches a real confirmation, then confirm the `jobs` row has `deposit_ex_vat`/`estimated_price_ex_vat` populated (the structured-pricing half never yet proven, the bug killed the flow before it), then DELETE the test job by SQL. *The fix is proven at unit + deployment level only.*
- Stripe end-to-end (dormant). Calendar read (pending Mark).

**Blockers / open questions:**
- The full ride needs a throwaway test email + **Ben's SQL cleanup**: bookings write to Postgres `jobs`, and `scripts/delete-booking.js` only cleans the legacy Netlify Blobs store, so it will NOT delete a live test booking. No admin-UI delete for jobs (erasure is `human_handoff`-only).

**Next actions (ordered, each a single first step):**
1. Do the post-deploy booking ride with Ben (throwaway email); then delete the test `jobs` row by SQL.
2. Once go-live is dated, set an out-of-repo calendar reminder for the T-1 para-4 review (+2 months) — a repo note is only read on session-open (L-007).
3. Decide `index.html`'s fate (fix vs de-designate as rollback).
4. Stripe switch-on when ready (`docs/STRIPE_SETUP.md`).
5. Calendar: rerun `scripts/verify-calendar-freebusy.js` once Mark shares.

**Traps and working agreements (this session):**
- **Unit-green + build-green is NOT deploy-safe for a client seam.** The parse bug shipped because only the server handler was tested. Test the browser-side parse directly (we now extract the real inline fn via markers and run it in `node --test`). L-008 addendum.
- **A non-greedy brace regex breaks the moment the JSON gains nesting** — use a brace-aware scan and require the marker's brace to be immediate (`/BOOKING_READY:\s*\{/`).
- **Cross-agent review earns its cost:** GEMPRO caught 3 real hardening points + 1 legal flag the primary pass missed. `exchange/` relay, one handle per seat, converge-or-two-positions.
- **`scripts/delete-booking.js` is Blobs-only;** a live Postgres test booking needs a SQL delete by Ben.
- Ben's shell PowerShell 5.1 (no `&&`); commits via the Bash tool (Git Bash). No em dashes; British English.
- Netlify reads env only on redeploy (L-018); a `[skip ci]` tip skips the WHOLE build (L-030) — the deployed tip `6aeb118` is a normal commit; THIS handover commit is `[skip ci]`, safe because all code is already deployed and built.

---

## This session (2026-09-06): Stripe deposit pay-link built end-to-end + dormant (D-004); structured pricing; GATE 0 legal review; calendar-share cycle fixed. WHOLE STACK DEPLOYING THIS SESSION (23-commit fast-forward to main).

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: 52% (yellow), read by Ben via /context.** Deliberate wrap: deploy the batch, then hand over.

**SUPERSEDES the 2026-09-05 (later) entry's next-actions #3 (Ben deploy the phone batch) and #4 (commit the calendar changes): both done this session — calendar work committed, and the whole stack is deploying now. That entry's calendar read verdict (#1/#2) is STILL open (Mark's share pending).**

**Session goal.** Fix the calendar-share cycle Mark hit; then, on Ben's direction: pre-deploy review, GATE 0 legal pass, calendar build plan, and build + wire the Stripe deposit pay-link. Deploy everything and hand over.

**Branch and worktree.** Home machine, standard checkout `C:\Users\bengr\Projects\ICC\icc-site`, branch **`feat/calendar-clash-check`** (tip `88a0612`), **23 commits ahead of `origin/main` (`07a87d3`), clean fast-forward** (verified: `git fetch` shows origin/main unmoved; `git merge-base --is-ancestor origin/main <branch>` = yes). Tree clean. **Tests 353/344 pass, 0 fail; `npm run build --prefix site` green** (verified this session).

**What landed (this session, newest first; all on the branch, unpushed until the deploy):**
- `88a0612` feat(payments): emit quote_lines + wire deposit pay-link, dormant (D-004). Prompt emits `quote_lines`; both email paths (chat.js auto-confirm, bookingAction.js provisional-accept) create a Checkout Session for the server deposit and thread the URL; `loadJob` selects `deposit_ex_vat`. *verified (tests+build).*
- `35984b3` feat(payments): server-authoritative deposit from quote_lines. `serverQuoteForBooking` re-quotes; `deposit_ex_vat`/`estimated_price_ex_vat` persisted (existing columns). *verified (tests).*
- `489cf09` feat(payments): deposit pay-link core — `paymentProvider.js` adapter, `stripe-webhook.js`, migration `20260906120000`, `/api/stripe-webhook` redirect. Dormant behind `STRIPE_SECRET_KEY`. *verified (tests + local `supabase db reset` applied the migration; catalog query confirmed columns/enum/index).*
- `4bc33a3` docs(legal): GATE 0 first-pass — `docs/LEGAL_REVIEW_TERMS_2026-09.md` + T-1 on the LAUNCH_CUTOVER GATE 0 checklist.
- `3c4ac1a` docs(calendar): corrected MARK_CALENDAR_GUIDE + CALENDAR_INTEGRATION Part A to desktop-web sharing; added Part C build plan; recorded L-033/L-034.
- `3c9bd2a` fix(policy): derive deposit % from `pricing.deposit_rate` + `test/policy.test.js`. *verified (tests); behaviour-neutral (still renders "10%").*
- Below these, 17 unpushed commits from prior sessions (the phone/marketability batch + the calendar verify harness) ALSO deploy in this fast-forward.

**In flight / NOT done:** nothing half-coded (tree clean). The DEPLOY is the pending action — FF merge + `git push origin main` handed to Ben in the session chat. Stripe is fully BUILT but dormant (no keys set).

**Deferred items (with anchors):**
- **Stripe switch-on (test mode):** apply migration `20260906120000` to the HOSTED DB (Ben; validated on local only), set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Netlify (all scopes, L-018), add the Stripe webhook endpoint `/api/stripe-webhook` for `checkout.session.completed`, redeploy, then the test-card ride. Guide: `docs/STRIPE_SETUP.md`.
- **Email wording:** when the pay button is live, revisit the "Mark will be in touch to arrange your deposit" line so it is not redundant with the button (D-004). Anchor: grep `Mark will be in touch to arrange` in `server/netlify/functions/chat.js`.
- **Refunds + balance/invoicing (D-026):** later slices, not built.
- **Calendar:** Mark still to share `talktoregency@gmail.com` free/busy to `icc-booking-bot@icc-calendar-507721.iam.gserviceaccount.com` from a computer (L-033); then rerun `scripts/verify-calendar-freebusy.js`; then build the dormant slice per `docs/CALENDAR_INTEGRATION.md` Part C.
- **GATE 0 legal:** T-1 (statutory cancellation clause) + T-2 (geographical address) before go-live — `docs/LEGAL_REVIEW_TERMS_2026-09.md`.
- **Phone:** test-call 01452 452356 once Tamar allocates. **Release:** Mark-owned Resend, domain cutover, noindex removal. **A2:** Mark's work photos.

**Verification still outstanding:**
- **The deploy + post-deploy ride:** confirm the Netlify deploy goes green, then do ONE real booking on the (noindex) staging site — structured pricing is the one live behavioural change this deploy makes, so prove a booking still completes and the quote/deposit render correctly. *unverified — first task next session.*
- **Stripe:** nothing proven end-to-end; all unit-tested with fakes. The test-card ride is the first real proof of the seams.
- **Migration:** validated on LOCAL Docker only; NOT applied to the hosted DB (needed before Stripe switch-on, NOT before this deploy — the deployed structured-pricing code writes only pre-existing columns).
- Calendar read verdict (pending Mark). DECLINE / admin-fallback live tests (untested since prior handovers).

**Blockers / open questions:**
- Mark's calendar share (external, non-blocking for in-repo work).
- Structured pricing: the assistant's spoken quote must match its `quote_lines`, or the customer sees the price settle at booking (the server figure wins). Monitor after deploy.

**Next actions (ordered, each a single first step):**
1. Ben: run the FF deploy (commands in chat: `git checkout main` → `git merge --ff-only feat/calendar-clash-check` → `git push origin main`) and watch the Netlify deploy to green.
2. Post-deploy: place one real test booking on the staging site; confirm it completes and the quote/deposit are right (the structured-pricing live-ride), then delete the test job.
3. Stripe switch-on when ready: apply the migration to the hosted DB, set the two keys, add the webhook, redeploy, test-card ride (`docs/STRIPE_SETUP.md`).
4. Calendar: rerun `scripts/verify-calendar-freebusy.js` once Mark shares.
5. Solicitor pass on `/terms` (T-1 priority) before go-live.

**Traps and working agreements (this session):**
- **Never paste the Stripe secret key into chat; Netlify env only.** Ben applies hosted schema migrations himself (the auto-mode classifier blocks my schema writes); validate on local Docker first.
- **The deposit amount is server-derived, never the assistant's free-text figure** — now enforced via structured pricing (`quote_lines` → `pricing.quote`). Do not regress this before taking real money.
- Google Calendar sharing is desktop-web only (L-033); grep every copy when correcting a duplicated fact (L-034).
- ICC is NOT RICS-regulated — judge its trade-offs on their own merits.
- Netlify reads env only on a redeploy (L-018); a `[skip ci]` tip skips the WHOLE build (L-030) — the tip `88a0612` is a normal feat commit, safe.
- PowerShell 5.1: no `&&` in pasted lines (use `;`, or one command per line).

---

## This session (2026-09-05, later): cross-business calendar — verify-before-build advanced; GCP service account created under the ICC org, SA-key auth PROVEN, waiting on Mark's calendar share. PHONE DEPLOY BATCH UNTOUCHED.

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: no reading — /context unavailable in this harness. No compaction or summarisation warnings seen this session; treated as green. A clean, deliberate stop, waiting on Mark.**

**This ADVANCES the earlier 2026-09-05 (phone) entry's next-action #3 (calendar: confirm topology, then verify the freebusy/auth path before building).** Topology is confirmed, the throwaway read harness is built, and the service-account auth is proven; only Mark's calendar share remains before the real read verdict. **The phone-swap deploy batch (that entry's next-action #1) is UNTOUCHED and still the priority.**

**Session goal.** Read the handover, pick a direction, work the cross-business calendar item's verify-before-build gate.

**Branch and worktree.** Home machine, standard checkout `C:\Users\bengr\Projects\ICC\icc-site`. Still on **`feat/phone-01452-swap`** (tip `2823880`, **15 commits ahead of `origin/main`, unpushed**). **The phone/marketability batch is unchanged — nothing added to it, nothing pushed.** This session's calendar work is UNCOMMITTED working-tree changes on that branch (see In flight), pending Ben's decision on where to commit them.

**What landed (this session, calendar verify-before-build):**
- **Topology resolved with Mark (verified, from Mark):** appointments are in **Google Calendar** (not Samsung — blind spot cleared); two calendars only — **Regency diary under `talktoregency@gmail.com`** (personal Gmail, no admin lock, the free/busy source the bot must read) and **Intelligent Clean under `mark_director@intelligentclean.co.uk`** (ICC's own; there is no plain `mark@`, per L-015). Recorded in `docs/CALENDAR_INTEGRATION.md` "Pre-build verification".
- **Auth decision: service-account key, NOT OAuth (Ben's call).** Rationale: ICC is a small non-RICS cleaning business (corrected mid-session; memory `icc-not-rics-regulated`), the SA key is operationally simpler on Netlify (no refresh-token machinery), the security downside is modest. *Recorded as D-033.*
- **GCP set up under the ICC org (verified):** project `icc-calendar` (id `icc-calendar-507721`) created under the `intelligentclean.co.uk` Cloud org; Calendar API enabled; service account **`icc-booking-bot@icc-calendar-507721.iam.gserviceaccount.com`**; a JSON key downloaded and stored **machine-local, outside the repo** in `C:\Users\bengr\secrets\` (filename not recorded here — it embeds the key id).
- **Org-policy override (verified):** the org enforces Google secure-by-default policies. Two bit this session: (1) project creation needed the Cloud org to be provisioned + `resourcemanager.projects.create` (auto-granted once the org finished creating); (2) `iam.managed.disableServiceAccountKeyCreation` blocked the key download — overridden to **Not enforced on the `icc-calendar` project only** (Override parent's policy → one rule → enforcement Off). *Recorded as L-032.*
- **Diagnostic harness (verified it runs):** `scripts/verify-calendar-freebusy.js` — a read-only Node-built-ins script testing the three read paths (SA freebusy / SA events.list / OAuth) with a per-path verdict. Guard clauses and a live run both exercised.

**First-hand verified result (I ran it, `GCAL_WINDOW_DAYS=60`, 2026-09-05):** SA **token exchange OK** (key + API + JWT flow all work). `freebusy.query` and `events.list` over `talktoregency@gmail.com` both returned **`notFound`** — expected, because **Mark has not shared his calendar to the SA yet**. So PATH 1's auth mechanism is proven functional; the read verdict is blocked only on Mark's share.

**In flight / NOT done:**
- **Waiting on Mark:** share `talktoregency@gmail.com` **free/busy** to `icc-booking-bot@icc-calendar-507721.iam.gserviceaccount.com` (Google Calendar app → Settings → that calendar → Add people or groups → the SA email → See only free/busy). Ben has the forwardable steps.
- **Uncommitted working-tree changes** on `feat/phone-01452-swap` (deploy-neutral — Netlify builds `site/`, these do not change site output):
  - `docs/CALENDAR_INTEGRATION.md` (modified) — new "Pre-build verification" section: topology checklist + resolved answers + the ordered gate.
  - `scripts/verify-calendar-freebusy.js` (new, untracked) — the diagnostic.
  - `NEXT_SESSION.md` (this entry).
  Where these get committed (new branch / folded into the phone batch / left) is Ben's call — pending.

**Deferred / owner-side:**
- Everything from the earlier 2026-09-05 (phone) entry still stands: **deploy the phone batch (priority)**, test-call 01452, release/Resend + domain cutover, Mark's A2 photos.
- **Calendar build (dormant slice):** only after the read verdict. If PATH 1 works (expected), build per `docs/CALENDAR_INTEGRATION.md` Part B (SA key in Netlify env, freebusy clash-check + `events.insert`), dormant behind calendar env vars. NB PATH 2 (`events.list`) will likely 403 under free/busy-only sharing — fine, PATH 1 is the one we need.
- DONE this session: calendar-auth = SA-key + the project-scoped org-policy override recorded as **D-033**; the GCP secure-by-default traps (Workspace super-admin ≠ Cloud IAM; SA-key block) as **L-032**.
- **`docs/MARK_CALENDAR_GUIDE.md`:** change the share target from `mark_director@` to the SA email — do this once the read is confirmed working (held to avoid baking it in before verification).

**Verification still outstanding:**
- The real freebusy read verdict (rerun the diagnostic once Mark shares — command below).
- Then the DECLINE / admin-fallback live tests and the phone deploy checks, all still open from prior handovers.

**Blockers / open questions:**
- Mark's calendar share (external; non-blocking for in-repo work).
- Whether `talktoregency@gmail.com`'s PRIMARY calendar holds the Regency jobs, or a secondary calendar under that account. If the read is empty after sharing, get the secondary calendar's specific id.

**Next actions (ordered, each a single first step):**
1. When Mark confirms he has shared: rerun the read — `cd C:\Users\bengr\Projects\ICC\icc-site`, then (Git Bash) `GCAL_CALENDAR_IDS="talktoregency@gmail.com" GCAL_SA_KEY_FILE="C:/Users/bengr/secrets/<the icc-calendar-*.json>" GCAL_WINDOW_DAYS=60 node scripts/verify-calendar-freebusy.js`. Expect PATH 1 = WORKS.
2. If PATH 1 works: update `docs/MARK_CALENDAR_GUIDE.md` to the SA email; record the DECISIONS + LESSONS entries; then build the dormant calendar slice (Part B).
3. Ben (independent, higher priority): review + merge + push `feat/phone-01452-swap` (15 commits) to deploy the phone/marketability batch to the still-noindex staging site.
4. Commit this session's calendar changes wherever Ben wants them.

**Traps and working agreements (this session):**
- **Two separate permission systems:** Google **Workspace** admin (users/mailboxes) grants **zero** Google **Cloud** IAM rights. New GCP orgs are secure-by-default — project creation and SA-key creation are both blocked until an admin unlocks them. Ben is super-admin and self-served both this session.
- **ICC is NOT RICS-regulated** (memory `icc-not-rics-regulated`). It is a separate part-time cleaning business; judge its trade-offs on their own merits, do not import property-sector framing. (My conflation this session; corrected by Ben.)
- **Secrets stay out of the repo:** the SA JSON key lives in `C:\Users\bengr\secrets\`, never committed. Do not record the exact key filename in tracked docs (it embeds the key id).
- **`notFound` on a freebusy call = the calendar is not shared to that identity yet**, not an auth failure. Token-exchange-OK is the auth proof.
- Phone-batch discipline unchanged: don't push; batch deploys; give merge/push commands only at the point of running.

---

## This session (2026-09-05): ICC phone provisioned + swapped, marketability cross-agent review converged, /terms + policy single-source, calendar retargeted. ALL ON A BRANCH, NOTHING PUSHED (batching one deploy).

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: no reading — /context unavailable in this harness. No compaction or summarisation warnings seen this session; treated as green. A clean, deliberate stop.**

**This SUPERSEDES the 2026-09-04 (later) entry's next-action "the phone swap (STEP 5)": the swap is DONE, on `feat/phone-01452-swap`, unpushed.**

**Session goal.** Read the handover, act on next steps, evaluate GPT-6 Astra as a cross-agent reviewer, provision the ICC phone, run a marketability review.

**Branch and worktree.** Everything is on **`feat/phone-01452-swap`** (home machine, standard checkout `C:\Users\bengr\Projects\ICC\icc-site`; NO extra git worktrees, `.claude/worktrees/` empty). The branch is **14 commits ahead of `origin/main` and UNPUSHED, by Ben's instruction (batch one Netlify deploy; each push costs a deploy).** `main` = `origin/main` = `07a87d3`, unchanged, still the live deploy (noindex). **Nothing from this session is deployed.**

**What landed (all on the branch, unpushed; at every step `node --test` = 317 pass / 9 skip and `npm run build --prefix site` = 25 pages, green — verified):**
- **Phone (D-030):** ICC's own **01452 452356** (Tamar Telecommunications, business-owned, voice-only with call whisper) swapped across the whole NAP: site pages, the LocalBusiness `+44` schema, the AI system prompt, the email/PDF/rate-limit fallbacks, the review sign-off, and the tests that assert it. Root `index.html` left as the rollback (Regency keeps 01242 279590). `194711f`. *verified (tests+build); the number is NOT yet test-called (Tamar still allocating).*
- **Overclaims (A4):** softened across home, about, guides, areas, services, history; the unconditional no-damage claim and competitor generalisations removed. `f3c09fa`, `335b0cb`. *verified.*
- **`/terms` page (D-031):** satisfaction promise, complaints procedure, payment terms + footer link. `ecaaba7`. *verified.*
- **Re-clean policy reconciled** to **72 hours from the end of the appointment / photo required / permanent staining excluded** across the prompt, the confirmation email, and `/terms`; the assistant now escalates a post-clean complaint to Mark via `escalate_to_human` (paper trail). `6e493d0`, `d569c37`. *verified (tests+build); NOT ride-tested with a real complaint.*
- **Single source of truth (L-031):** `shared/config/policy.js` now holds the re-clean and deposit/cancellation wording, consumed by prompt + email + `/terms`. Deposit set to 10% + 7-day cancellation tiers; the email's "liable for the full estimated cost" penalty line dropped. `07475d0`, `93bbab1`. *verified (built `/terms` HTML contains the shared text).*
- **Calendar:** Mark's sharing guide retargeted from `ben@` to **mark_director@intelligentclean.co.uk** (his director account, the operator who accepts, D-009); the D-009 "Ben-controlled" wording corrected. `a49a33b`, `150d921`. *verified (docs).*
- **Bot-first booking (D-032):** phone/email booking works but is not advertised; the assistant is the advertised channel. Recorded; `contact.astro` "all bookings via the assistant" corrected to a preferred-route line.
- **Docs/memory:** D-030/D-031/D-032, L-031, `docs/PHONE_01452_OPTIONS.md`, `docs/MARKETABILITY_REVIEW_2026-09.md`, cross-agent-review scaffolding in `exchange/` (gitignore split), memory `icc-email-addresses`.

**Cross-agent review (GPT-6 Astra).** Converged over 3 rounds each. Transcript machine-local and gitignored at `exchange/REVIEW_marketability_2026-09-05.md`; durable summary at `docs/MARKETABILITY_REVIEW_2026-09.md`. Astra ran as a spoke via the `cross-agent-review` file relay and caught 2 overclaims the hub's first pass missed. The live watcher was stopped at session end.

**In flight / NOT done:**
- **Nothing pushed.** The branch is a complete, self-consistent batch awaiting Ben's review + one deploy.

**Deferred / owner-side (carried forward, each re-verified against branch state at write time):**
- **Deploy the batch:** Ben reviews `feat/phone-01452-swap`, merges to `main`, pushes once. Carries: the 01452 number, softened claims, `/terms`, the re-clean/escalation change, the policy single-source. NB do NOT leave a `[skip ci]` commit as the merge tip (L-030).
- **Test call to 01452 452356** once Tamar finishes allocation, before it goes on GBP or is relied on publicly. *unverified.*
- **Legal/DP review of `/terms` + the privacy notice** before go-live (GATE 0).
- **A2 proof gap** (highest-value marketing item, owner-side): operator intro, real work photos, before/after, then reviews/GBP. Mark-supplied; nothing to build.
- **A5 commercial enquiry action** (optional, Medium): a labelled commercial route into the assistant.
- **Insurance line** on `/terms` only if/when Mark holds cover (omitted by decision for now).
- **Cross-business calendar build:** unchanged design in `docs/CALENDAR_INTEGRATION.md`; open work is (1) confirm every calendar/account holding Mark's commitments, (2) verify the freebusy/auth path with a throwaway read, (3) build the dormant slice. Mark shares his Regency free/busy to `mark_director@` per `docs/MARK_CALENDAR_GUIDE.md`.
- **Release path (`docs/LAUNCH_CUTOVER.md`):** dedicated Mark-owned Resend account (create via Google sign-in with a Mark-owned Workspace address, add Ben as team member), then domain cutover, then my `noindex` removal + `ALLOWED_ORIGINS`.
- Prior deferrals still open: D-029 two-day split; deposit pay-link (Stripe); Saturday premium; logo tagline artwork.

**Verification still outstanding:** the deploy + post-deploy live checks; the 01452 test call; the DECLINE / admin-fallback live tests (untested since the prior handover).

**Blockers / open questions:** none blocking in-repo work. All next steps are Ben/Mark out-of-repo (deploy, Tamar allocation, legal review, Mark's photos/bio) or the calendar verification.

**Next actions (ordered, each a single first step):**
1. Ben: review `feat/phone-01452-swap` (14 commits), merge to `main`, push once to deploy the batch to the (still noindex) staging site. Exact command given at the point of running.
2. Test-call 01452 452356 once Tamar completes allocation.
3. Calendar: confirm Mark's calendar/account topology, then verify the freebusy/auth path (throwaway read) before building.
4. Release: create the Mark-owned Resend account, then the domain cutover.
5. Get Mark's A2 proof material (operator intro, work photos, before/after) onto the site.

**Traps and working agreements (this session):**
- **Don't push; batch deploys.** Ben pushes once per batch (each push = one Netlify deploy). Give merge/push commands only at the point of running.
- **Policy single-source (L-031):** the re-clean + deposit/cancellation wording lives ONCE in `shared/config/policy.js`. Never restate it in the prompt/email/page; edit `policy.js`.
- **Blast-radius grep before changing a duplicated fact:** the phone number, the re-clean policy, and the deposit policy each lived in 3+ places and had drifted (three different re-clean windows were live). Grep the whole repo, fix every occurrence in one pass.
- **[skip ci] on a push tip skips the whole build (L-030).** Do not merge/push with a `[skip ci]` commit as the tip over the code changes.
- Ben's shell is PowerShell 5.1 (no `&&`); commits this session were via the Bash tool (Git Bash). No em dashes in prose.
- GPT-6 Astra (ChatGPT desktop) works as a cross-agent seat over the `exchange/` file relay; kick one seat at a time; the data boundary (public surface only) is in the kickoffs.

---

## This session (2026-09-04, later): 7626bfc DEPLOYED + verified; privacy pre-review shipped (2 REDs fixed, live); launch runbook written; cross-business calendar item added (research first)

*Diagnoses unverified unless marked.* **Context: Ben reported 30% (green). `/context` is not invokable in this harness, so 30% is Ben's figure. A clean, deliberate stop; pick up cold in a fresh session.**

**This SUPERSEDES the earlier 2026-09-04 entry's first-next-action "REDEPLOY 7626bfc" (now done) and its post-deploy check (done).**

**Session goal.** Work the handover's pending items, then move toward production release (domain, dedicated Resend, SEO), at pace.

**State now.** `main` = `origin/main` = `20fceef` (in sync), **deployed and live** (Netlify `ready`). Site still on `super-frangollo-c3a14a.netlify.app`, **still `noindex`** (the pre-launch block is intact, verified live). HEAD on `main`. The stale branch `fix/silent-send-failure` still exists (its content is already on `main` via `7626bfc`; deletable).

**What shipped and was verified live:**
- `7626bfc` operator-email-failure fix (review follow-up) is DEPLOYED. NB the push alone did NOT deploy it: the tip commit `710a4ba` carried `[skip ci]`, so Netlify skipped the whole build (see L-030). It was deployed via a manual Netlify API build (`POST /sites/{id}/builds`), which ignores `[skip ci]`. Post-deploy verified: `/book/` greeting reads "I'm the booking assistant", no stale personal names, `noindex` intact. *verified (live curl + Netlify API).*
- **Privacy notice pre-review (UK GDPR/PECR)** — a primary pass plus an independent `property-reg-reviewer` pass, reconciled and re-derived from code. **Two REDs fixed and DEPLOYED** (`268404b`): R1, "Mark personally reviews and confirms every booking" was false post-D-027 (on-time bookings auto-confirm, `chat.js:936` / `tradingHours.js` 15:00 line), reworded plus an offer of human review; R2, removed the visible `[to confirm]` placeholder, added Google to the US-transfer list, transfer wording confirmed by Ben as fine for UK use. One RED STAGED (R3, The SMS Works / review-request disclosure) and wired as a hard dependency into runbook STEP 6. Findings for the DP professional: **`docs/PRIVACY_REVIEW_2026-09.md`**. *verified (build + live curl: new wording present, `noindex` intact).*
- **`docs/LAUNCH_CUTOVER.md`** — the consolidated go-live runbook (domain cutover done email-safely, dedicated Resend, `noindex` flip, Search Console, GBP/reviews), with owners and gates marked. This is the single entry point for launch.
- **`L-030`** — the `[skip ci]` deploy trap.
- **SEO audit:** the on-site SEO is READY (unique titles/descriptions, canonical, OG/Twitter, LocalBusiness + Service/FAQ/Breadcrumb/Article JSON-LD, sitemap, robots, self-hosted fonts). No code fixes needed. The real visibility levers (GBP + reviews) are out-of-repo and gated on the 01452 phone.

**Human items (Ben) marked agreed and resolved this session:** the international-transfer DPAs (retain each provider's DPA as evidence for the R2 wording), and the privacy review's AMBER judgment calls (Art 22 characterisation, PECR transactional-vs-marketing, 6-year retention enforcement, erasure procedure). So the privacy gate is cleared per Ben; the human DP professional review remains the formal authority when arranged.

**Decision this session:** ICC gets its **own** Resend account, Mark-owned (D-009), not a shared/personal one. Mechanics are in runbook STEP 1.

**Release critical path (all in `docs/LAUNCH_CUTOVER.md`; mostly Ben/Mark, out-of-repo):**
1. Dedicated ICC Resend account (STEP 1).
2. Domain cutover: web records at 123reg point to Netlify, email records (MX/SPF/DKIM/`_dmarc`) untouched (STEP 2).
3. Remove the `noindex` block from `netlify.toml` and set `ALLOWED_ORIGINS`/`PUBLIC_SITE_URL` (STEP 3). The code edit is mine, at cutover; gated on the DP review.
4. Search Console + Bing + submit the sitemap (STEP 4).
5. 01452 phone (GATE 0) then the phone swap 01242 to 01452 across the repo (STEP 5, mine) then GBP + review-engine switch-on (STEP 6, includes privacy Fix 3).

**My two remaining in-repo jobs, ready the moment a gate clears:** the `noindex` removal (at cutover) and the phone swap (when the 01452 number exists; targets in `docs/LAUNCH_GBP_PROFILE.md:25`).

**Cross-business calendar (Regency and ICC) so Mark is never double-booked across his two businesses. Ben's steer this session: verify before building. IMPORTANT: this is ALREADY DESIGNED, not greenfield.**
`docs/CALENDAR_INTEGRATION.md` (25 Aug design note) already covers it end to end: **Part A** is a Mark-facing, phone-app, free/busy calendar-sharing guide (privacy-preserving, no appointment details leave his phone); **Part B** is the full technical integration (Google Calendar API v3, `freebusy.query` / `events.list` clash-check + `events.insert`, a GCP service account, the verified freebusy-on-shared-calendar gotcha with two fallbacks, least-privilege scopes, the booking flow, and the ordered setup). The Supabase `jobs` table stays the system of record; the calendar is a mirror plus a second clash source (Mark's Regency and personal commitments). It is **NOT built**; A3 ("share the Google Calendar") is the open action and the slice would ship dormant behind calendar env vars.
**The genuine open items before building (the "research needed" Ben flagged):**
1. **Account / calendar topology.** Confirm whether Mark's Regency appointments live in a separate Google account/calendar or his personal one, and enumerate EVERY calendar holding his commitments. The Part A guide handles multiple calendars (repeat the share for each), but a missed calendar is a real double-booking blind spot, so this must be complete.
2. **Verify the auth/freebusy path first (one-real-ride).** The doc itself flags that `freebusy.query` as a service account on merely-shared calendars can be unreliable; prove which of service-account+`freebusy` / `events.list` fallback / OAuth-as-ICC actually works with a throwaway read BEFORE building the slice.
3. Then build the dormant slice and finalise the Part A guide for the chosen identity (the service-account email vs `ben@`).
DP note: the free/busy-only sharing already handles the cross-business data concern (only busy-times, never appointment details). Anchor: `docs/CALENDAR_INTEGRATION.md`.

**Next actions (ordered, each a single first step):**
1. Cross-business calendar: already designed in `docs/CALENDAR_INTEGRATION.md` (not greenfield). Confirm Mark's calendar/account topology, do the throwaway auth/freebusy verification (one-real-ride), then build the dormant slice and finalise the Part A guide.
2. Release: work the `docs/LAUNCH_CUTOVER.md` steps as gates clear (Resend account, then domain cutover; then I do the `noindex` removal + `ALLOWED_ORIGINS`).
3. When the 01452 number exists: I do the phone swap (STEP 5), then Ben/Mark create the GBP + switch on reviews (STEP 6, including privacy Fix 3).
4. Optional carry-overs: D-029 two-day auto-split (Ben's day-1 sizing call); the DECLINE / admin-fallback live tests (still untested, need a fresh provisional booking or the admin login).

**Deferred items (flagged, carried forward):**
- Full two-day auto-split (D-029). Anchor `TODO(D-029/two-day-split)` in `chat.js`.
- Deposit pay-link dormant until Stripe live: `TODO(D-004/D-026 deposit-link)`.
- Saturday weekend premium unset: `TODO(D-027/saturday-premium)`.
- Logo artwork still bakes in the superseded tagline (og:image/favicon show it); a new logo PNG job, not code.
- Privacy R3 (The SMS Works disclosure) before the review engine switches on (runbook STEP 6).

**Traps and working agreements (this session):**
- **`[skip ci]` on a push's TIP commit skips the WHOLE build** (L-030). Never leave a `[skip ci]` docs/handover commit as the tip over an un-deployed code change; make the change the tip, or trigger a manual build. Confirm a deploy exists at the pushed SHA (Netlify API), never infer pushed == deployed. **NB: this handover commit is `[skip ci]`, which is safe ONLY because all code is already deployed; push it after any pending code deploy has built.**
- **Deploy runs from the REAL repo.** Ben's terminal defaulted to the empty Desktop stub `C:\Users\bengr\OneDrive\Desktop\icc-site`; a `git push` there did nothing. Always `cd C:\Users\bengr\Projects\ICC\icc-site` first.
- **The auto-mode classifier did NOT block a Netlify API build POST this session** (a prod deploy trigger went through), though prior sessions saw env PUT / DB writes blocked. Netlify API GETs plus the build POST worked; `git push` is Ben's.
- Ben runs prod mutations (`git push` = deploy). confirm-before-push honoured (Ben ran each push/deploy).
- Ben's shell is PowerShell 5.1 (no `&&`; use `;`). Commits this session were via the Bash tool (Git Bash). No em dashes in prose.

---

## This session — 2026-09-04: D-027 REAL RIDE done (accept path proven in prod); send-failure hardening + assistant rename + oversize→Mark shipped; one follow-up committed but NOT yet deployed

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: no reading — /context unavailable in this harness. Ben reported 58% (yellow); that is his figure, not an independent read. No compaction/summarisation warnings seen.**

**This SUPERSEDES the 2026-09-03 entry's "THE REAL RIDE ... First next action":** the ride is done for the accept path.

**Session goal.** Do the D-027 real ride (the deploy gate the 2026-09-03 handover left open), then act on what it surfaced.

**THE REAL RIDE — accept path PROVEN end to end in production.** *Verified:* a real provisional booking placed through the live AI booking page (a whole-house job forced to a 1pm/5-slot finish after 3pm) created the `jobs` row `status=booked` + `confirmation_state=awaiting_operator` with the token hash + expiry stored (queried via the pooler); the operator email delivered to Mark (`mark_director@intelligentclean.co.uk`, Mark confirmed receipt) with a working Review & respond link; the customer "provisionally held" email delivered to Ben's Gmail (screenshot); Mark clicked **Accept** and the DB flipped to `operator_confirmed` (`operator_decided_at` + token `used_at` set) with a `messages` `provisional_confirmed`/`sent` row, and the customer confirmation email arrived. Ben then deleted the test job (jobs/messages/customer = 0, slot freed). *Both `markEmail`/`customerEmail` returned Resend ids in the browser network log.* The DECLINE path and the admin-fallback controls were NOT live-tested (the one booking was accepted; both need a fresh provisional booking, which re-pings Mark, or the admin login which Ben could not recall).

**Prod mail config confirmed (Netlify env, read via the Netlify API):** `OPERATOR_EMAIL=mark_director@intelligentclean.co.uk`, `OPERATOR_FROM=ICC Bookings <bookings@intelligentclean.co.uk>`, `CUSTOMER_FROM=...<hello@intelligentclean.co.uk>`; the intelligentclean.co.uk domain is verified in Resend and both send paths work. Operator emails go to MARK. (An earlier-session claim that OPERATOR_EMAIL was `ben@...` was wrong.)

**Branch and worktree.** Home machine, standard checkout. All work merged to **`main`**. `main` is **1 commit ahead of `origin/main`** (`7626bfc` committed but NOT pushed). `origin/main` = `e2b71e9`, which IS deployed (Netlify state `ready`).

**What landed (all GREEN before each step: node --test 326 = 317 pass / 9 skip; build 24 pages):**
- `5ef9b5c` fix: silent Resend send-failure in `chat.js` (the booking + escalation sends never checked `res.ok`; `fetch` does not throw on 4xx/5xx). Now checks `res.ok`, logs, adds an `emailStatus` flag, honest message; escalation throws on non-2xx so its catch logs it. + LESSONS L-029. *verified (tests).* NB the ride did NOT trigger this (sends worked); found by inspection.
- `417ccc0` refactor: removed the rotating assistant names (Jamie/Alex/Sam/Ellie/Tom); the assistant now has no personal name and greets as "the booking assistant" (`chat.js` + `book.astro` + `index.html` + a prompt-content lock test). DECISIONS addendum (supersedes the 24-Aug mascot note's "named human" premise) + CLAUDE.md. *verified (tests + build).* Ben's call.
- `10cbb37` feat: oversize jobs (> `tradingHours.max_slots` = 7 hours) now route to Mark via `escalate_to_human` with approved copy instead of the misleading "Invalid slots_needed / choose another time". + DECISIONS D-029 + `TODO(D-029/two-day-split)`. *verified (tests + build).*
- `a26aef8` fix: pre-deploy review fixes — the browser clients now show an honest "call us" message when the CUSTOMER email fails (they had ignored `emailStatus`); `handleEscalation` honest when BOTH channels fail; `.json().catch` robustness; oversize/tool-description reconciliation. *verified (tests + build).*
- `e2b71e9` MERGE of `fix/silent-send-failure` to `main` — **DEPLOYED** (Ben ran the merge+push; push = deploy for this Netlify Git integration). *verified: Netlify deploy of `e2b71e9` state `ready`, no error, via the Netlify API.*
- `7626bfc` fix: operator-email-failure follow-up — the `a26aef8` client fix only gated on `emailStatus.customer`; if MARK's email fails but the customer's succeeds the customer was still told "and to our team" / "Mark will confirm personally". Now both clients gate the copy on EITHER email failing; + a `chat-client-parity.test.js` test that fails on the `.customer`-only gate. *verified GREEN locally (326/317/0, build 24). NOT pushed, NOT deployed.*

**Two code reviews (local `code-reviewer` agent).** First pass BLOCKED: the `emailStatus` flag was computed server-side but no client read it (the customer still saw hardcoded "emails sent"). Fixed in `a26aef8`. Re-verify narrowed the Block to the operator-email-failure case (only `.customer` was wired). Fixed in `7626bfc` + the parity test. A final reviewer re-verify of `7626bfc` was NOT requested (optional; the fix is the reviewer's exact ask plus a failing-first test).

**In flight / NOT done — the deploy is one commit behind:**
- **REDEPLOY `7626bfc`.** `main` is 1 ahead of `origin/main`; the live site (`e2b71e9`) still carries the operator-email-failure client gap (failure-mode only: it needs Mark's Resend send to actually fail). Push `main` to deploy the fix. FIRST next action.
- Post-deploy check: load the live `/book`, confirm the greeting is "I'm the booking assistant" (no name) and an ordinary on-time booking still confirms cleanly (the send-fix touched the booking response).

**Deferred items (flagged):**
- Full two-day auto-split (D-029). Anchor: `TODO(D-029/two-day-split)` at the `validateBooking` slots cap in `chat.js`. Open: the day-1 sizing (start early and run to close, vs "customer books the last slot"; Ben owns, see D-029).
- Review Finding 3 (cosmetic): oversize jobs escalate with `reason: customer_request`, whose email label "Customer asked for a person" reads oddly. Noted in the `a26aef8` commit body; no code anchor.
- Review Finding 4 (latent, fails safe): the oversize prompt quotes `max_slots`=7 (Postgres) but the legacy-Blobs rollback path allows 9, so a rolled-back site would over-escalate an 8h job. Noted in `a26aef8`; Postgres is the live store.
- Deposit pay-link dormant until Stripe live: `TODO(D-004/D-026 deposit-link)`.
- Saturday weekend premium unset: `TODO(D-027/saturday-premium)`.
- Logo artwork still bakes in the superseded tagline "Established Trust, Superior Cleaning" (now "Intelligence you can trust"): a new logo PNG job, not code. NB a "broken logo" reported on the homepage this session was a stale cache / transient deploy-swap; the live hero logo is verified fine (the webp serves HTTP 200 and loads at 500px), no code fault.

**Verification still outstanding:** the redeploy + post-deploy check (above); the DECLINE and admin-fallback live tests (untested); an optional final reviewer re-verify of `7626bfc`; a live look at the oversize→Mark routing (only unit/prompt-tested).

**Blockers and open questions:** D-029 day-1 sizing (Ben). The `admin.html` login password — Ben could not recall it (blocked the admin-fallback route this session); reset via Supabase → Authentication → Users if that path is needed. Whether to re-verify `7626bfc` with the reviewer.

**Next actions (ordered, each a single first step):**
1. Redeploy: push `main` to `origin` (deploys `7626bfc`). (Per the new working rule, the exact command is given only at the point of running it.)
2. Post-deploy check on the live `/book`: greeting says "the booking assistant"; an ordinary booking confirms.
3. Optional: re-verify `7626bfc` with the `code-reviewer`.
4. Ben decides the D-029 two-day day-1 sizing.
5. Optional: test the DECLINE path and the admin-fallback controls (needs a fresh provisional booking or the admin login).

**Traps and working agreements (this session):**
- **NEW standing rule (saved to memory `dont-give-runnable-commands-until-ready`):** do not hand Ben runnable commands, especially deploys, until we are actually at the point of executing them. This session I gave the merge+push while saying "hold for the reviewer"; Ben ran it and it deployed before the reviewer cleared, so a review-flagged residual (`7626bfc`'s fix) rode out live. Push to `main` = deploy.
- **The file tools (Grep/Glob/Read) DEFAULT to the empty Desktop stub** `C:\Users\bengr\OneDrive\Desktop\icc-site` and silently return nothing — ALWAYS pass the explicit repo path `C:\Users\bengr\Projects\ICC\icc-site`.
- **The auto-mode classifier blocks my prod-infra WRITES** (a Netlify env PUT, a `form_input` on the live site, and a DB delete were all denied); catalog/data READS via the pooler and Netlify API GETs are fine. Ben runs prod mutations (env, DB deletes, `git push`).
- Prod DB reads: `supabase db query "<SELECT>" --db-url <pooler>`; CAST enum columns to `::text` or the CLI errors "unknown oid". Build the pooler URL as `scripts/db-push.sh` does.
- `scripts/delete-booking.js` targets the LEGACY Netlify Blobs store, NOT Postgres — clean a Postgres test booking via SQL (messages first; `messages.job_id` is ON DELETE SET NULL).
- Emails to `mark_director@intelligentclean.co.uk` are REAL and reach Mark; a live provisional booking pings him.
- No em dashes in prose. Ben's shell is PowerShell 5.1 (no `&&`); commits this session were via the Bash tool (Git Bash).
- Entering a login password to authenticate is a hard line I will not cross even when authorised; the `admin.html` login stays Ben's.

---

## This session — 2026-09-03: D-027 Phase 6 DONE — strict single-winner notice built + reviewed, merged to `main` and DEPLOYED

*Diagnoses in this note are unverified unless marked.* **Wrap-up context: no reading — /context unavailable in this harness. No compaction/summarisation warnings seen; a clean deliberate wrap at Ben's request.**

**D-027 IS LIVE.** The full slice (per-day trading hours, half-hour starts, minute-precise double-booking, provisional bookings for late-finish jobs, the public accept/decline endpoint + admin fallback, and this session's strict single-winner notice) merged to `main` (`2f8a0ff`) and deployed. *Verified: Netlify production deploy of `2f8a0ff` is state `ready`, no error; site `super-frangollo-c3a14a.netlify.app`.* This SUPERSEDES the 2026-09-02 "Phase 6 remains".

**Session goal.** Finish D-027 Phase 6 (the deploy gate): pgTAP, a real integration insert, build the strict single-winner retry (Ben's call), diff-review it, then merge + deploy.

**Branch and worktree.** Work on `feat/d027-per-day-hours` (home machine, standard checkout), 6 commits this session, pushed to `origin/feat`. Then merged `--no-ff` to `main` (`2f8a0ff`) and pushed (deployed). **`main` is now `2f8a0ff` (deployed); `feat/d027-per-day-hours` is fully merged (deletable). HEAD is currently on `main`.**

**What landed (all verified green before merge: node --test 320 = 311 pass / 9 skip; 40 pgTAP; 19 guarded integration; build 24 pages):**
- `667ed29` pgTAP: drop the stale `jobs_trading_hours` assertion; add `confirmation_state` + minute cases to `schema_test.sql`. *verified (supabase test db)*
- `8efd081` a real `:30` integration booking round-trip vs local Postgres. *verified*
- `7f09775` strict single-winner notice: migration `20260903120000` (`sending` `message_status` + partial unique index `messages_provisional_notice_uniq`), `bookingDecision.js` claim-then-send (`claimNotice`/`settleNotice`). *verified (pgTAP + integration + a measured 3/3 single-winner)*
- `e4a1030` concurrent reclaim-race integration test. *verified*
- `d2e28bd` docs: DECISIONS D-027 addendum, LESSONS L-027/L-028, plan checkpoint.
- `abeb2b5` review fixes: Resend `Idempotency-Key` (`${kind}/${job.id}`) in `sendCustomerEmail`; an enforcing concurrent-stale-reclaim test + a comment naming the `set_updated_at` trigger dependency. *verified*
- `2f8a0ff` merge D-027 to `main` (deploy). *verified (Netlify ready)*

**Migration.** `20260903120000_messages_provisional_single_winner.sql` **APPLIED to prod** (Ben ran `bash scripts/db-push.sh`) and **catalog-verified**: `message_status` has `sending`, `messages_provisional_notice_uniq` present. *verified via `supabase db query` through the aws-1-eu-west-2 pooler.* Applied BEFORE the code deployed (the D-027 DB-ahead-of-code expand pattern).

**Cross-agent review.** `agent-exchange/REVIEW_d027-strict-retry_2026-09-03.md`. **CLAUDE + GEMINI converged**; GPT never completed a round (usage limit; and its watcher was initially on a DIFFERENT project's exchange folder). Gemini found two real things, both fixed this session: (1) the concurrent stale-`sending` reclaim is single-winner only via the `set_updated_at` trigger (now enforced by a test + comment, L-028 area); (2) a stuck-`sending` two-generals residual if a settle fails after a successful send (closed by the Resend idempotency key). §5.4 a non-issue.

**In flight / NOT done — what deploy skipped:**
- **THE REAL RIDE.** No real end-to-end run has happened: a real provisional booking (finish after 15:00) on the live site → the operator email to Mark → click the link → accept → the customer confirmation email + a `messages` `sent` row; then a decline (slot freed + customer email); then admin-fallback accept/decline/resend/notify from `admin.html`. Tests + review cover the logic; the live email seam is unproven in prod. **First next action.**

**Deferred items (flagged, unchanged):**
- Deposit pay-link dormant until Stripe live + server-derived amount. Anchor: `TODO(D-004/D-026 deposit-link)` in `bookingAction.js` / `chat.js`.
- Saturday weekend premium figure unset. Anchor: `TODO(D-027/saturday-premium)` in `bookingsStore.js`.
- (The strict single-winner retry, previously deferred, is now BUILT + deployed.)

**Verification still outstanding:** the real ride (above); a post-deploy smoke of the live availability grid showing the new per-day hours; GPT's independent review pass (optional; REVIEW file open at `NEXT: GPT`).

**Blockers and open questions:** none block the ride. To resume GPT's pass, re-point its watcher at `C:\Users\bengr\agent-exchange\` (NOT the "AI domain and social network" project's exchange) and re-arm a monitor.

**Next actions (ordered, each a single first step):**
1. Real ride: submit a real provisional booking (finish after 3pm) on `https://super-frangollo-c3a14a.netlify.app/book`; confirm Mark's operator email; click the link; accept; check the customer email + the admin card's "Customer notified".
2. Then a decline: confirm the slot frees and the customer decline email sends.
3. Then admin fallback from `admin.html`: accept / decline / resend / retry_customer_notice on a provisional booking.
4. Watch the first real provisional notice to confirm the idempotency key is on the live Resend call (no dupes).
5. Optional: GPT's independent review pass; then delete `feat/d027-per-day-hours`.

**Traps and working agreements (this session):**
- Repo at **`C:\Users\bengr\Projects\ICC\icc-site`** (Desktop is an empty stub; auto-memory).
- **Prod migrations: Ben runs `bash scripts/db-push.sh` himself** (the classifier blocks my schema writes). From PowerShell (`bash` not on PATH there), invoke `& "C:\Program Files\Git\bin\bash.exe" "C:/Users/bengr/Projects/ICC/icc-site/scripts/db-push.sh"`. **Catalog READS are NOT blocked:** `supabase db query "<SELECT>" --db-url <pooler>` (build the pooler URL as `scripts/db-push.sh` does).
- **Local pgTAP/integration: `supabase db reset` FIRST** or you test a stale ghost schema (L-027). Integration needs `ICC_SUPABASE_IT=1` + `SUPABASE_URL=http://127.0.0.1:54321` + the local `sb_secret_…` key from `supabase status` (memory `icc-local-integration-tests`).
- **Cross-agent review:** do NOT stamp `[[CONVERGED]]`/close while a seated reviewer still owes a round (I closed on Gemini's convergence, waving GPT off; re-opened). ICC relay is `C:\Users\bengr\agent-exchange\`.
- Ben's shell is **Windows PowerShell 5.1** (no `&&`; use `;` / `if ($?)`), memory `ben-powershell-51-no-ampersand`. No em dashes in prose.
- confirm-before-push honoured: Ben said "push and deploy"; the prod migration was sequenced first for safety.

---

## This session — 2026-09-02: D-027 Phases 4 and 5 built (public accept/decline + admin fallback), two cross-agent reviews; Phase 6 remains **(SUPERSEDED 2026-09-03: Phase 6 done, merged to `main` `2f8a0ff`, deployed — see the 2026-09-03 entry above)**

*Diagnoses in this note are unverified unless marked.* **Context: `/context` is not invokable in this non-interactive session; Ben reported 63% (yellow band). Not an independent read.**

**This SUPERSEDES the "Phases 4 to 6 remain" status in the 2026-09-01 (continued) entry below** — Phases 4 and 5 are now built; only Phase 6 remains.

**Session goal.** Build D-027 Phase 4 (the public token accept/decline endpoint + read-only confirm page) and Phase 5 (the admin fallback), each shaped by a cross-agent review (Claude hub + GPT + Gemini) before/around coding.

**Branch and worktree.** All on **`feat/d027-per-day-hours`** (home machine, standard checkout). Pushed to `origin/feat/d027-per-day-hours` this session. NOT merged to `main`; `main` is untouched and deployable. Branch is ~31 commits ahead of `main`.

**What landed (all green: 311 tests, 308 pass / 3 skip; site builds 24 pages — *verified* tests + build):**
- Phase 4 (public path): `00c5989` extract the per-IP limiter → `rateLimit.js`/`blobStore.js`; `cfacb49` `/api/booking-action` endpoint (POST view/accept/decline, constant-time token, CAS, claim-then-send) + tests; `b0a90d6` read-only confirm page `site/src/pages/booking-action.astro` (noindex, no-referrer, token in URL fragment) + sitemap filter; `2feef46` cap 20→60/hr; `a7ce978` dormant deposit pay-link hook; `5ef5ca5` D-004 addendum; `7246e61` copy sign-off.
- Phase 5 (admin fallback, expanded by the 2026-09-02 review): `962d476` extract `bookingDecision.js` shared core (behaviour-preserving); `d31c700` hash-bind the decision CAS (rotation revokes an in-flight old link) + `notifyCustomerOutcome` ALWAYS logs the notice; `2613dff` `/api/booking-admin` (requireAdmin) accept/decline/resend/retry_customer_notice + tests; `ed6081f` `admin.html` provisional status + controls, `bookings.js` `notice_sent` annotation; `c416792`/`24812a7` checkpoint + DECISIONS D-027 addendum + LESSONS L-025/L-026.

**In flight — Phase 6 (the deploy gate; nothing merges to `main` until green):**
- pgTAP (`supabase/tests/`): DROP the stale `jobs_trading_hours` assertion (still in `jobs_postcode_nullable_test.sql`); add `confirmation_state` + minute-precision cases to `schema_test.sql`; enable one real `:30` integration insert.
- One REAL end-to-end ride (the seam the unit tests mock): a provisional booking → the actual operator email → click the real link → the page → accept; a decline → customer email + slot freed; plus an admin-fallback accept/decline/resend/notify from `admin.html`.
- Full `node --test` + `npm run build --prefix site` (green now), then merge to `main` (deploys).

**Deferred items (flagged):**
- **Strict single-winner retry** (Gemini findings 1+2): needs ONE migration — a `sending` value in `message_status` + a partial UNIQUE `(job_id, kind)` for provisional_* — plus `logMessage` → `.upsert` (else the index breaks insert logging, Gemini 1) + a retry claim-CAS. Default ships read-then-send + button-disable + per-(admin,job) cap; residual is a low-harm duplicate non-contradictory email. Ben's call. Anchor: the "FLAGGED for Ben" note in `docs/D027_PROVISIONAL_PLAN.md` + L-026.
- Deposit pay-link dormant until Stripe live + server-derived deposit amount. Anchor: `TODO(D-004/D-026 deposit-link)` in `bookingAction.js` + `chat.js`.
- Saturday weekend premium figure unset. Anchor: `TODO(D-027/saturday-premium)` in `bookingsStore.js`.

**Verification still outstanding:** all of Phase 6 (pgTAP + the one real ride). No migration was applied this session (the two D-027 migrations are already applied + catalog-verified from prior sessions; the flagged strict-retry migration is NOT written).

**Blockers and open questions:** none block Phase 6. Ben to decide the strict-retry migration. The exchange `agent-exchange/REVIEW_phase5-admin-fallback_2026-09-02.md` sits at CLAUDE round 3 / NEXT: GEMINI; GPT is out of credits (thread closed at round 1); Gemini may add a round 2 (the review monitor dies with the session — re-arm on resume if the exchange is still open).

**Next actions (ordered, each a single first step):**
1. In `supabase/tests/jobs_postcode_nullable_test.sql`, drop the stale `jobs_trading_hours` assertion.
2. Add `confirmation_state` + minute pgTAP cases to `schema_test.sql`.
3. Do the one real end-to-end ride (real provisional booking + operator email link + the admin fallback controls in `admin.html`).
4. Ben decides the strict-retry migration; if yes, write it + the upsert + retry claim-CAS.
5. Full suite + build, then merge `feat/d027-per-day-hours` to `main`.

**Traps and working agreements (this session):**
- Repo is at `C:\Users\bengr\Projects\ICC\icc-site` (Desktop is an empty stub; auto-memory).
- The branch must NOT deploy until Phase 6 is green + the real ride passes; the `[WIP]` tags are deliberate.
- The admin path deliberately has NO token/expiry gate — `requireAdmin` is the authority (L-025 for the public hash-binding it does NOT share).
- The customer notice is now ALWAYS logged; the admin surfaces "customer NOT notified" + a retry (L-026).
- Confirm-before-push: this session's push to `origin/feat/...` was on Ben's explicit "push everything" (branch only, not `main`).
- `.js` commits show a benign LF→CRLF warning (Windows autocrlf); the committed blob is LF.

---

## This session — 2026-09-01 (continued) — *(status SUPERSEDED 2026-09-02: Phases 4 and 5 now built; see the 2026-09-02 entry above)*: D-027 provisional-booking slice, Phases 1 to 3 built, migration applied and verified; Phases 4 to 6 remain

*Diagnoses in this note are unverified unless marked.* **Context: Ben reported 64% (yellow band). `/context` is not invokable in this non-interactive session, so 64% is Ben's figure, not an independent read.**

**Resuming? Start here.** Everything is on local branch **`feat/d027-per-day-hours`** (home machine; NOT pushed, NOT merged, NOT deployed). `main` is untouched and deployable. The full build plan plus a live checkpoint log is **[docs/D027_PROVISIONAL_PLAN.md](docs/D027_PROVISIONAL_PLAN.md)**. The design source, a converged cross-agent review with GPT and Gemini, is at **`C:\Users\bengr\agent-exchange\REVIEW_d027-3pm-provisional_2026-09-01.md`** (outside the repo). This entry SUPERSEDES the "APP HALF NOT FINISHED, do next" list in the older 2026-09-01 entry below.

**Session goal.** Turn the 24 Aug D-027 decisions into the working provisional-booking feature: a job finishing after 3pm is held and routed to Mark to accept or decline from his email. The design was hardened by a cross-agent review before any code.

**What landed (12 commits since `b1306f5`; all green: 255 tests, 252 pass / 3 skip, site builds 23 pages):**
- `f7e2877` persist `start_minute` (0/30) and render half-hour starts. *verified (tests)*
- `615ec7a` **minute-precise availability**, so the grid never offers a slot the engine then rejects (fixes the F2 gap a :30 start introduced). *verified (tests).* This also corrected my own earlier-session WRONG claim that occupancy could stay hour-quantised.
- `211461a` `auto_confirm_by=15:00` plus `autoConfirmByMinutes()`; advertised JSON-LD close moved to 3pm (`jsonld_close_job_hours` 3 to 2). *verified (tests + build)*
- `d01a9dd` migration `20260901200000_jobs_confirmation_state.sql`. *verified: APPLIED to prod and catalog-verified (below)*
- `ef1bf24` store layer: `bookingToJobRow` / insert / admin-read carry `confirmation_state` plus token hash and expiry. *verified (tests)*
- `1c9dd07` `handleBooking` provisional decision, token generation, operator accept-link email. *verified (tests)*
- `64734bc` customer-facing provisional wording (email, `book.astro` screen, PDF banner). *verified (tests + build)*
- plus `1430c68`, `5a231a9`, `5ae7b29` (plan and checkpoints), `a713050` (`scripts/db-push.sh`), `b96b2ff` (`.gitattributes`, `*.sh` pinned LF).

**Migration APPLIED and VERIFIED on prod Supabase.** `20260901200000_jobs_confirmation_state.sql` is the SECOND D-027 migration (the first, `20260901133038`, added the hours last session). Applied via the new `bash scripts/db-push.sh` (session pooler; the direct host is IPv6-only and the working copy is not `supabase link`ed). Verified directly from the catalog with `supabase db query` through the pooler (*verified*): the `confirmation_state` enum's four labels (`auto_confirmed, awaiting_operator, operator_confirmed, operator_declined`), the five new `jobs` columns (`confirmation_state` NOT NULL default `auto_confirmed`; `operator_decided_at`; `operator_action_token_hash`, `_expires_at`, `_used_at`, all nullable), and the two `message_kind` values (`provisional_confirmed, provisional_declined`).

**How it works now (Phases 1 to 3, committed).** A booking whose finish (`start + slots*60`) is after 15:00, Postgres store only, is persisted `status='booked'` (this holds the slot) plus `confirmation_state='awaiting_operator'`, with a random 32-byte action token whose SHA-256 hash and an expiry (end of the booking day) are stored. The plaintext token lives only in Mark's email. Mark's operator email is flagged and carries ONE link to `${PUBLIC_SITE_URL}/booking-action#job=<id>&token=<plaintext>`, with the token in the URL fragment so a mail-scanner prefetch cannot act. The customer sees "Booking received, provisionally held, Mark will confirm" on screen (`book.astro` reads `bookData.provisional`) and in their email; the PDF (Mark only) gets a PROVISIONAL banner. On-time bookings are unchanged.

**In flight, NOT built (the deploy gate; nothing deploys until these land):**
- **Phase 4.** `server/netlify/functions/bookingAction.js` plus a `/api/booking-action` redirect in `netlify.toml`, and the confirm page `site/src/pages/booking-action.astro`. The operator email link ALREADY points at `/booking-action` (`chat.js` near line 1096, the `actionUrl` const), which 404s until this exists (harmless while un-deployed).
- **Phase 5.** `admin.html` `buildCard` (near line 481): show `confirmation_state` and `operator_decided_at`; add fallback Accept / Decline / resend controls gated by `requireAdmin` (`adminAuth.js:54`).
- **Phase 6.** pgTAP (`supabase/tests/`: the stale `jobs_trading_hours` assertion from last session still needs dropping, plus minute and `confirmation_state` cases), full `node --test` and build, the DECISIONS.md D-027 addendum, a real end-to-end ride, and a second-pass review (property-reg-reviewer and code-reviewer) before merge.

**Next actions (ordered, each a single first step):**
1. Write `bookingAction.js`. POST `{job, token, action}` with action in `view` / `accept` / `decline`. Load the job by id; **constant-time** token check (hash the presented token, `crypto.timingSafeEqual` against the stored hash; reuse the `safeEqual` pattern at `server/netlify/functions/bookings.js:8-16`); reject expired or used. `accept` and `decline` do an atomic compare-and-set: `UPDATE jobs SET confirmation_state=?, operator_decided_at=now(), operator_action_token_used_at=now() [, status='cancelled' on decline] WHERE id=? AND confirmation_state='awaiting_operator' AND operator_action_token_used_at IS NULL`; 0 rows updated means already actioned, return 409. On `decline`, claim-then-send the customer decline email (NOT send-then-mark; the messages table plus `message_kind='provisional_declined'` gives the durable record). POST only, 405 otherwise.
2. Add the `netlify.toml` redirect `/api/booking-action` to the function (pattern at `netlify.toml:27-48`).
3. Write `site/src/pages/booking-action.astro`: read-only; JS reads `location.hash` for job and token; POSTs `view` to render the summary, then `accept` or `decline` on a button click; the token stays in the fragment and POST body, never a GET query.
4. Then Phase 5 (admin), then Phase 6.

**Blockers and open questions.** None block Phase 4 (design settled). The GPT (ChatGPT) seat hit usage limits mid-session; the review had already converged, so it is closed. Gemini remains available if a fresh review is ever wanted.

**Owed, per Ben's rules (prompts outstanding):**
- **DECISIONS.md D-027 addendum**, not yet written: Option A (hold provisionally, not escalate-as-lead); one-click email accept for Mark (not admin-only); `auto_confirm_by=15:00`, finish-based (a 1pm 1 to 2 hour job auto-confirms; only a finish after 15:00 routes to Mark); advertised close 3pm; token design (stored SHA-256 hash, single-use, expiring).
- **LESSONS_LEARNED.md** candidate: an hours or cadence change must reach the availability COLLISION logic, not only the offered grid, because hour-quantised occupancy silently under-blocks :30 starts (this session's `615ec7a`; extends last session's "F2 to the DB layer" lesson).

**Traps and working agreements (this session):**
- Repo is at **`C:\Users\bengr\Projects\ICC\icc-site`** (the Desktop folder is an empty stub; auto-memory).
- **Apply migrations with `bash scripts/db-push.sh`** in Git Bash. Ben runs schema writes himself (the classifier blocks them). Verify the catalog directly afterwards (`supabase db query --db-url <pooler>`), do not trust "done".
- Long commands **paste-mangle in MINGW64** (bracketed-paste `^[[200~` leaks, only the tail runs); prefer a committed script plus a short invocation.
- `book.astro` AND `index.html` (the retained rollback client) both read `availData.booked` as an hour array, so availability's `booked` response was deliberately kept hour-shaped for backward compatibility even though the collision check is now minute-precise.
- Commits carry `[WIP]` / `[apply pending]` where apt; the branch must not deploy until Phase 6 is green and the real ride passes.

---

## This session — 2026-09-01, D-027 per-day hours: DB migration applied and verified; app layer on a branch; brand copy + ICO number

**Resuming? Start here.** All of this session is on the local branch **`feat/d027-per-day-hours`** (home machine, NOT pushed, NOT merged, NOT deployed). `main` is untouched and still deployable. Four commits: brand copy; ICO number + doc fixes; the D-027 app layer + migration (WIP); this handover.

**DB migration APPLIED + VERIFIED on production Supabase (`icc-platform`).** `20260901133038_jobs_per_day_hours_minutes.sql`: adds `start_minute` (0/30), rebuilds `jobs_no_double_booking` on a minute-precise `span_minutes` range (drops the whole-hour `hours` column), drops the hard `jobs_trading_hours` finish-by-16:00 check (soft close). Verified from the live catalog: the guard rejects a :30 overlap (23P01), a 1pm-to-6pm job is accepted, 09:30 round-trips; the `jobs` table is empty so zero data risk. The `20260614110000` history drift was repaired in the same pass. Connection method is in auto-memory `icc-supabase-db-access` (aws-1-eu-west-2 session pooler; **Ben must run `supabase db push` / `migration repair` himself** — the auto-mode classifier blocks them even with allow rules).

**Prod DB is ahead of deployed code, deliberately.** The live site is still the old app (compatible with the new schema), so nothing customer-facing changed. New hours go live only when the branch is finished, merged and deployed.

**APP HALF NOT FINISHED — this is the deploy gate, do next:** *(SUPERSEDED 2026-09-01 continued: steps 1 and 2 are done and greatly expanded into a full provisional-booking slice; see the entry above and [docs/D027_PROVISIONAL_PLAN.md](docs/D027_PROVISIONAL_PLAN.md).)*
1. `server/netlify/functions/bookingsStore.js` — the `TODO(D-027/start-minute)`: parse and persist `start_minute`, read it back in `jobRowToAdminRecord`, make `bookedHourSlots` minute-aware. Until then a 09:30 booking stores as 9:00. This is why the branch must not deploy yet.
2. `server/netlify/functions/chat.js` — the **3pm auto-confirm** rule + lightweight override: a job finishing after 3pm (T=15:00) is still taken and holds the slot, marked provisional, the customer is told Mark will confirm, and Mark's notification email flags it; under 3pm auto-confirms as now. Steer big jobs to the earliest free start. No client-managed double slots. (Mark is happy with open-ended afternoons; the DB allows the late finish.)
3. pgTAP — `supabase/tests/jobs_postcode_nullable_test.sql` asserts `jobs_trading_hours` (now dropped), so update it; add minute cases to `schema_test.sql`. These need the local Docker stack to run.
4. Full `node --test` + `npm run build --prefix site`, merge to main, push (Netlify deploys), then one real booking each for a :30 slot and a 3-room 1pm job (the seam the skipped integration tests miss).

**Decided this session (formalise as DECISIONS addenda next session):**
- D-027: slot cadence = each day's earliest start, then hourly, always including 1pm as the last start; **auto-confirm finish T = 3pm**, later finishes route to Mark via the override; open-ended afternoons (no hard finish); JSON-LD public close modelled as 1pm + 3h = 16:00 (was 16:30) — confirm with Mark.
- **Saturday weekend premium figure still unset** (Mark): hook in `tradingHours.js` (`weekend_premium`), apply point `TODO(D-027/saturday-premium)` in `bookingsStore.js`.
- D-016 addendum: the ICO public register DOES display Mark's home address; decide accept vs asking the ICO to withhold (noted in `docs/LAUNCH_ICO_REGISTRATION.md`).
- Base address corrected to **13 Horsbere Road, GL3 3PT** (was 11 / GL3 3BT); public repo copies reduced to the postcode, full address in the private minutes only.
- LESSONS entry to add: an hours change must reach the store schema and every store gate, not just the app config (F2 extended to the DB layer).

**Still open for Ben/Mark:**
- **D-028 travel bands not coded or approved.** Proposed (centre GL3 3PT): free ≤~10 road miles (Gloucester + Cheltenham + rings), £5 ~10-15 (Winchcombe, Tewkesbury, Stroud), £10 ~15-22 (Cirencester, Tetbury, Forest of Dean), £15 >~22 (Moreton, Stow, Bourton, Chipping Campden). Recommend a postcode district/sector band table over a straight-line radius (the Cotswolds are close by crow, far by road). Its own slice after approval: `serviceArea.js`, `chat.js`, the six area pages, `/api/v1/quote`, and server-side surcharge enforcement in `validateBooking`.
- Brand: the other "team" references (index hero, booking consent line, privacy notice) left as ordinary service voice — switch to sole-operator phrasing? And the site says "Cheltenham-based" throughout while D-028 records Intelligent as Gloucester-based (accuracy point, Mark to steer).
- Home-machine `.env` NETLIFY_TOKEN updated this session (closed).

**Green on the branch:** `node --test` 242 (239 pass / 3 skip), site builds 23 pages. The 3 skips are the real-Supabase integration tests (`ICC_SUPABASE_IT=1`); enabling one for a real :30 insert is part of step 4.

---

## This session — 2026-08-25, Mark meeting reconciled: the launch bundle is largely resolved, new build backlog opened

**No code changed this session.** This is a **planning + docs** pass reconciling a **24 August 2026** configuration/planning meeting with Mark (two audio transcripts + one auto-summary) into a single record. Full minutes, held **outside the public repo** (they carry Mark's tax position and internal pricing/brand notes): `C:\Users\bengr\Projects\ICC\deliverables\ICC-Meeting-Minutes-Mark-Aug2026.md` (and a premium branded `.docx` alongside it).

**The long-standing "Mark bundle" is now mostly answered:**
- **Tagline: RESOLVED.** "Established Trust, Superior Cleaning" becomes **"Intelligence you can trust"** (a new business has no established track record to claim; this also clears the D-015 concern the old line invited).
- **About wording: RESOLVED.** "a local team" becomes **"local specialist"** (sole operator).
- **Phone: RESOLVED (direction).** Provision a **cheap virtual Gloucester 01452 landline** with call-forwarding to Mark's mobile; upgrade to a memorable number later. This is the number question that has gated GBP since 18 June. Procurement is now the action (Ben), not an open decision. The 18 June GBP spec's 01452 plan stands.
- **ICO: REGISTERED.** Done, on an **annual direct debit at ~£47/year** (the earlier £40/£35 Tier-1 estimate is superseded by the actual fee). The confirmation and registration number arrive by post/email; the residual is only pasting the number into `privacy.astro` (unchanged pre-launch item).

**Two changes that are bigger than a config edit (NOT coded this session — they need proper commits + tests + your sign-off):**
- **Trading hours change shape.** Day-specific starts with **1pm as the last job start** (Ben confirmed: 1pm is the last START, not the hard finish; the finish follows from job length). Starts: Mon 09:30 / Tue 10:30 / Wed 09:30 / Thu 10:00 / Fri 09:30 / Sat 09:30, Saturday at a **weekend premium**. The current `shared/config/tradingHours.js` is single-hours-for-all-days; this becomes **per-day** and ripples through the prompt, availability grid, `validateBooking`, `contact.astro` and the JSON-LD. This supersedes the "confirm 09:00–16:30" open item. Thursday starts 10:00 (an earlier auto-transcript misread 10:10; there is no 10:10 start).
- **Travel-charge model re-centres on Mark's base address.** Free within ~**10 miles of Mark's GL3 base** (Ben confirmed: use his provided address as the centre, held privately per D-016, used for the distance calc only), then **£5 / £10 / £15** tiers by distance, replacing the flat £15 and the three-town core (D-011). **Winchcombe moves from free to ~£5.** Needs exact bandings + postcode boundary before touching `serviceArea.js` and the area pages.

**New feature backlog from the meeting (added to [ROADMAP.md](ROADMAP.md)):** one-week booking offset with an urgent-override path; **cross-business calendar clash-check** (the engine must read Mark's full commitments across Regency + personal, currently one diary, so an Intelligent slot never double-books him; Intelligent's bookings write to a dedicated Intelligent calendar; Mark to move off Samsung to Google Calendar and share the link(s); Ben installed Google Calendar on his phone in the meeting); **smart allocation by travel time** (15–20 min buffer between consecutive jobs, no geo-clustering); cancellation-fill (offer a freed slot to same/next-day customers); complaints handling in the chat assistant with customer-reference lookup; decontamination/fogging/ozone **content** plus **pressure washing** (Mark wants to offer it, so it is a service, not just content); and a set of **field-app** requirements (arrival sign-in, method-statement photo/chemical logging for liability cover, sensitivity gating, on-app extras + completion). Also decided: **no separate chat mascot** ("Clippy"/"Ruggy"); the single existing helper stays.

**Experience claim: RESOLVED (Ben).** Mark asked the About page to say "18 years"; the true figure is 16. Decision: the site states **"over 15 years"** (accurate, avoids the inflated "18" that would cut against D-015 / L-009 and ASA/CAP). Mention to Mark. Do **not** put 18 on the site.

**DECISIONS.md — recorded this session (Ben's go-ahead):** **D-027** (per-day trading hours, 1pm last start), **D-028** (base-address-centred £5/£10/£15 travel charge, amends D-011), a **D-015 addendum** (tagline / About / "over 15 years"), a **D-016 addendum** (virtual 01452 phone confirmed), and a **D-019 addendum** (no mascot).

**Follow-up amendments (Ben, same session):** corrections folded into the minutes and docs — the ozone unit was ~£700–£800 not £7,800; **pressure washing is now an offered service** (Mark wants it, reversing the in-meeting "we're not pressure washing" aside; the auto-summary was right); Thursday starts **10:00** (there is no 10:10 start). New **[docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md)** answers the Google Calendar question: yes there is an API (Calendar API v3, `freebusy.query` for the clash-check + `events.insert` to write bookings), the service-account wiring, the freebusy-vs-events.list gotcha, and an **idiot-proof phone guide for Mark** (he was fighting the mobile *browser*; the *app* has the sharing settings). A send-ready premium version of that guide is `deliverables/Mark-Calendar-Sharing-Guide.{md,docx,pdf}`. The **number-rental shortlist + recommendation** (A1) is now in [docs/LAUNCH_GBP_PROFILE.md](docs/LAUNCH_GBP_PROFILE.md): Virtual Landline £4.50/mo or ONSIM £5/mo for a cheap rolling divert-to-mobile 01452.

**Still open (needs Ben/Mark, out of repo):** the **home-machine `.env`** still needs the regenerated non-expiring `NETLIFY_TOKEN`; **A1** (procure the 01452 number) now gates GBP; **A3** (share the Google Calendar); the **MTD wave** question for the accountant (Mark's working assumption is 2027/28, unconfirmed; Regency year-end February, quarterly VAT); Mark to register as a sole trader; settle ~£50 domain cost owed to Ben. Then the standing pre-launch queue (ICO number → privacy `[to confirm]` + DP review → GBP → review-request switch-on → domain cutover).

---

## This session — 2026-08-18, invoicing direction reset: platform-owned on Stripe, FreeAgent dropped (D-026)

**Start here if you are picking this up (either machine).** No product code changed this session — this is a **decision + plan** commit that resets the invoicing approach and sets up the next backend build. Nothing is in flight; branch merged to `main`.

**What changed.** D-024 had ICC's invoicing going *through FreeAgent* (create draft → Mark reviews → one-click send). That is **dropped**. Two reasons surfaced: (1) Mark is souring on FreeAgent generally (deliverability + bulk-client friction on his Regency account), and (2) a second business needs a **second FreeAgent subscription** (~£19/mo, or free only via an eligible bank account) — cost + friction for a tool he wants to leave. Full reasoning + the alternatives weighed (Zoho, Invoice Ninja, Xero/QuickBooks) are in **[D-026](DECISIONS.md)**.

**The new plan (D-026).** The **platform owns invoicing**, driven entirely from the admin, on **Stripe** (Stripe Invoicing) — no monthly SaaS fee, only ~1.5% + 20p per card payment, and it is the payment rail D-004 already defaults to. Accounting/MTD is a **separate, thin, swappable** layer (export/feed), not a marriage to any one tool. Stripe sits behind a provider adapter (like `smsProvider.js`) so the D-004 Stripe-vs-Revolut choice stays open. The existing `invoices` table already anticipates this, so the slice **extends** the schema, it does not rebuild.

**MTD — treat as urgent (Ben's steer).** "Which MTD wave" = which HMRC Making Tax Digital start date binds Mark, set by his **combined** Regency + ICC (+ property) gross income — so ICC being new does not keep him out. Plain-English brief + the urgent action (ask his accountant which wave he is in) in **[docs/MTD_AND_ACCOUNTING.md](docs/MTD_AND_ACCOUNTING.md)**. It does **not** block the invoicing build.

**Next task (the build — dormant behind `STRIPE_SECRET_KEY`).** The full slice plan (schema migration, adapter, admin-gated endpoint, review+send UI, signed webhook, export, tests, the Mark/out-of-repo gates) is the **Build notes** section of [D-026](DECISIONS.md). Build it the way the review-requests slice (D-025) was built: real code paths, injected fetch / fake Stripe in tests, dormant until Mark's Stripe keys are set. Gated on Mark creating a Stripe account he owns (D-009) + the D-004 processor confirmation.

**Housekeeping this session.** `.claude/settings.local.json` is now gitignored (machine-specific); `.claude/launch.json` (the `npm --prefix site run preview` config, port 4321) is committed so home Claude gets the same preview. `shared/config/reviews.js` and CLAUDE.md's Stripe row updated to point at D-026 instead of the old FreeAgent plan. `node --test` and `npm run build --prefix site` green before merge.

**Still open (unchanged, needs Ben/Mark — out of repo):** the **home-machine `.env`** still needs the regenerated non-expiring `NETLIFY_TOKEN` (see the standing token section above + [MACHINE_LAYOUT.md](MACHINE_LAYOUT.md)); the **Mark bundle** (confirm the 09:00–16:30 trading day, the "Established Trust…" tagline, About meta "a local team" → "local specialist", and the **phone-number decision that gates GBP**); the **MTD wave** question above; then the standing pre-launch queue (ICO registration → privacy `[to confirm]` details + DP review → GBP → review-request switch-on → domain cutover).

---

## This session — 2026-07-30, ops: token regenerated, launch env vars live, domain parking killed (work machine, PR [#74](https://github.com/randommonicle/icc-site/pull/74))

Ops session, no code change. Work executed via small Sonnet sub-agents on Ben's standing instruction (see the new CLAUDE.md sub-agents bullet), each result independently re-verified from the main thread.

- **`NETLIFY_TOKEN` regenerated (closes the lapsed 24 July expiry).** Ben created the new token as **non-expiring** — the annual expiry watch is closed. Set in the Netlify UI and this (work) machine's `.env`. Two traps found on the way, both now in L-007's addendum: the `.env` paste carried a **leading space** after `=` (401s indistinguishable from an expired token), and nothing is live until a **redeploy**. **The home machine's `.env` still needs the new value.**
- **Launch env vars set via the Netlify API** (sub-agent): `PUBLIC_SITE_URL=https://super-frangollo-c3a14a.netlify.app` (pre-domain value so the email privacy links stop resolving to the parked ad domain — **switch to the real domain at cutover**), `CUSTOMER_REPLY_TO=hello@intelligentclean.co.uk`, and **`ALLOWED_ORIGINS`** set to the two production domains — **strict origin mode is now LIVE** (ticks the L-001 checklist item as defence-in-depth; the per-IP rate limit stays the primary control). `CUSTOMER_FROM` was already set and was not touched. One redeploy (~47s) activated the token and all four vars together.
- **Live-verified after the deploy:** own-origin `check_availability` → 200 with the real 9–15 grid; a hostile origin → **403 Forbidden origin** (the strict gate provably enforcing — this fail-opened to 200 before today); the rate limiter → 400×5 then **429** on the 6th invalid `confirm_booking` (side-effect-free probe — validation rejects the empty booking before any write/email/AI; proves the regenerated token end-to-end in production; independently re-probed from the main thread). Remaining unproven leg: the email-identity values (privacy link + Reply-To) only show in outbound email — eyeball them on the next test booking or handoff reply.
- **123 Reg parking page killed (Ben, in the panel).** The zone's single `A @ "Parked"` record (TTL 600) was deleted; verified **gone at the authoritative nameserver** (`ns55.domaincontrol.com`), the `www` CNAME intact and resolving to nothing, and **all seven email records intact** (Google MX, Resend `send` MX, SPF ×2, DMARC, DKIM ×2 — values re-read and matching). The domain now serves nothing, which is the intended pre-launch state — it is deliberately **NOT** pointed at Netlify (that remains the gated go-public step). **Watch:** no parking on/off toggle exists in the panel, so if an account-level flag re-creates the record in the next days, re-create it as `A` / `@` / `127.0.0.1` to blackhole it. The domain transfer lock is ON (fine — unrelated to parking, good security).
- **Docs in this PR:** the token standing-reminder rewritten (non-expiring, watch closed, home-machine residual), the 19 July "most urgent" bullet marked resolved, `.env.example` + the L-007 addendum updated (leading-space gotcha, redeploy-on-rotation), CLAUDE.md gains the sub-agent cheap-model bullet and the ALLOWED_ORIGINS checklist tick.

**Still open (needs Ben/Mark, unchanged otherwise):** the home-machine `.env` token; the Mark bundle — confirm the 09:00–16:30 trading day (`shared/config/tradingHours.js`), a steer on the "Established Trust, Superior Cleaning" tagline, About meta "a local team" → "local specialist", and the **phone-number decision that gates GBP creation**; then the standing pre-launch queue (ICO registration → privacy `[to confirm]` details + DP review → GBP → review-request switch-on → domain cutover).

---

## This session — 2026-07-19, full site review remediation — ALL MERGED + LIVE (PRs [#67](https://github.com/randommonicle/icc-site/pull/67)–[#72](https://github.com/randommonicle/icc-site/pull/72))

**Start here if you are picking this up on the work machine.** A developer-and-marketing review of the whole site produced eleven findings (F1–F11). All eleven are fixed, merged to `main` and deployed. The suite went from 196 to 239 tests (236 pass, 3 skipped, 0 fail) and the site builds 23 pages. Nothing is in flight and no branch is open.

The full review, including the GREEN findings worth not breaking, was written to a scratchpad file that does **not** survive the session. What mattered is summarised here.

### What was wrong and what changed

| PR | Findings | Substance |
|----|----------|-----------|
| [#67](https://github.com/randommonicle/icc-site/pull/67) | F1, F7, F8 | **RED.** The Phase 1 cutover (#49) silently dropped two shipped chat features |
| [#68](https://github.com/randommonicle/icc-site/pull/68) | F2 | **RED.** Trading hours drift: the site sold slots the booking engine rejects |
| [#69](https://github.com/randommonicle/icc-site/pull/69) | F3, F9 | **RED.** Pre-launch host indexable + Google Fonts privacy exposure |
| [#70](https://github.com/randommonicle/icc-site/pull/70) | F5, F10 | Winchcombe page contradicted D-011; surcharge hardcoded |
| [#71](https://github.com/randommonicle/icc-site/pull/71) | F4, F6, F7 | WCAG AA failures, silent nav toggle, 438KB hero |
| [#72](https://github.com/randommonicle/icc-site/pull/72) | F11 | The missing DIY-vs-professional guide |

**F1 (the worst one).** `book.astro` never handled `CONVERSATION_END` or the `citations` payload, though `chat.js` had been sending both since the Slice 4c/4d work. Live customers saw the raw `CONVERSATION_END` marker in the chat, the PR #21 goodbye-close never ran, and the "Based on ICC's expert guidance" provenance captions were invisible for a month. `TODO(citation-links)` is now closed too: KB section ids map to care guides via `KB_GUIDE_SLUGS` in `book.astro`. **Keep that map in step with `site/src/content/guides/`** — `test/chat-client-parity.test.js` fails if a mapped slug has no guide.

**F2.** The prompt advertised "8am to 6pm" with slots to 5pm; the live Postgres validation rejects starts after 15:00. A customer could complete the whole consultation and be refused at `confirm_booking`. Now single-sourced in **`shared/config/tradingHours.js`** (D-006 pattern) and consumed by the prompt, the availability grid, `validateBooking`, `contact.astro` and the JSON-LD.

**F3.** Every canonical/`og:url`/sitemap entry points at `www.intelligentclean.co.uk`, which currently serves a **123 Reg parking page with third-party ads**. The `.netlify.app` host was fully crawlable. A site-wide `X-Robots-Tag: noindex` now ships, flagged **`TODO(prelaunch/noindex)`** in `netlify.toml`. `robots.txt` deliberately keeps `Allow`: a crawler must be able to fetch the page to see the header, so `Disallow` would defeat the noindex rather than reinforce it.

**F4.** `logo-green.png` moved from `public/` to `src/assets/` so `astro:assets` processes it: **438KB → 35KB desktop, 12KB mobile**, with `width`/`height` and a `srcset`. The seamless cutout from #59 survives WebP (verified by sampling decoded pixel alpha).

**F9.** Fonts self-hosted via `@fontsource`, subsets pinned. Google Fonts disclosed every visitor's IP to Google, which the privacy notice's processor list did not cover.

### New tests worth knowing about

Five new files, all of which check code against a source of truth rather than against themselves:

- **`test/chat-client-parity.test.js`** — the live Astro client must keep handling everything the server sends. Confirmed to fail against the pre-fix `book.astro`, not pass vacuously.
- **`test/trading-hours.test.js`** — whatever the booking engine accepts is what the assistant may offer and the site may advertise.
- **`test/area-content-accuracy.test.js`** — area pages checked against `serviceArea.js`, including real `isOutOfArea()` postcodes and every `£` figure.
- **`test/contrast.test.js`** — computes WCAG ratios from the stylesheet, resolving `var()` aliases, so a colour change is checked against the standard.
- **`test/guide-claims.test.js`** — the DIY guide's claims must trace to `knowledge.js`; no invented statistics, no brand names (PR #23 rule).

### ⚠️ Two judgement calls made without Mark, and one correction needed

1. **Trading hours are now 09:00–16:30.** That is taken from the database constraint and the GBP spec, which already agreed. The old "8am to 6pm" copy was the outlier. **Mark must confirm the real trading day before launch** — it is a one-line change in `shared/config/tradingHours.js` if it moves.
2. **The pre-launch host is set to `noindex`.** Reversible: delete the flagged block in `netlify.toml`.

### Still open, and needs Ben or Mark rather than code

- **`NETLIFY_TOKEN`** — RESOLVED 30 July 2026: the token lapsed on 24 July, was regenerated as a **non-expiring** token, set in Netlify, redeployed, and live-verified (the per-IP rate limiter trips 429 again). Residual: update the home machine's `.env`.
- **Netlify env vars:** `PUBLIC_SITE_URL` is the two-minute one — until it is set, the privacy link in booking and handoff emails resolves to the 123 Reg ad page. Also `ALLOWED_ORIGINS`, `CUSTOMER_FROM`, `CUSTOMER_REPLY_TO`. Redeploy after (L-018).
- **Turn off 123 Reg domain parking** so the brand domain stops serving ads.
- **Mark's steer on two pieces of copy:** the "Established Trust, Superior Cleaning" tagline reads oddly for a business with no track record yet (it invites exactly the question D-015 exists to avoid), and the About meta description says "a local team" for a sole trader; "local specialist" would be truer and better positioning. Both are brand wording, so his call, not a code fix.
- **Phone number decision** (from the 18 June session) still outstanding before GBP creation, or NAP is split from day one.

### What the review found working, so it does not get broken

Claim discipline held everywhere checked: no fabricated statistics anywhere in the built output, manufacturer figures properly attributed, and the `TODO(trust-stats)` anchors still in place. Structured data is correct for a service-area business (no street address per D-016, no invented `aggregateRating`). The area pages are genuinely local rather than doorway pages. Pages are lean, 13–23KB of HTML.

The review engine (D-025, built but dormant) remains the single biggest trust lever available once GBP exists, precisely because D-015 rightly forbids invented social proof. Switch-on instructions are in [docs/REVIEW_REQUESTS_SETUP.md](docs/REVIEW_REQUESTS_SETUP.md).

---

## Earlier that day — 2026-07-19, home-machine housekeeping (no product change)

Housekeeping only, no behaviour change. The home machine had drifted badly out of sync.

**What was wrong.** The home checkout sat on the long-dead `feat/supabase-schema` branch with local `main` 17 commits behind `origin/main`, and both `node_modules` trees predated the Supabase dependency, so the whole suite failed with `Cannot find module '@supabase/supabase-js'`. Nine stale local branches and four stale git worktrees had accumulated.

**What was done.**

- `main` fast-forwarded to `origin/main` (`5ce506c`). Nothing local was ahead, so nothing was at risk.
- Nine stale branches deleted, each verified first: four merge-reachable, four patch-equivalent via `git cherry`, and `claude/funny-wilson-666c69` confirmed landed as squash `ffcfa8c` (#52) by checking the A4 privacy link in `handoffs.js` and the A5 `retention.js` / `purge-handoffs.js` files on main.
- All four worktrees removed. The last, `friendly-dewdney-464b0d`, held 32 uncommitted files and needed checking rather than deleting: it turned out to be a 5 June snapshot on the pre-monorepo `netlify/functions/` paths, missing every test and migration added since. All 112 identifiers in its `chat.js`, and every identifier in its `admin.html` and `index.html`, already exist on main. The only three absent (`adminSecret`, `authHeader`, `providedToken`) are the legacy `ADMIN_SECRET` auth that Slice 5d deliberately replaced. Nothing was salvageable. Its stray `nul` file (a Windows reserved device name, from a bad `> nul` redirect) needed `del "\\?\<path>\nul"` to remove — see **L-022**.
- Both `npm install`s re-run. Suite green: **196 tests, 193 pass, 0 fail, 3 skipped**. `npm run build --prefix site` builds 22 pages. npm blocks the `esbuild`/`sharp` install scripts on this machine; the build passes regardless, so it needs no action.
- Four `ICC-Progress-Update-for-Mark*` docs moved out of the repo root to `C:\Users\bengr\Projects\ICC\deliverables\`.

**Docs corrected in this branch.** `MACHINE_LAYOUT.md` recorded the home path as the OneDrive Desktop; the repo has since moved to `C:\Users\bengr\Projects\ICC\icc-site`, outside OneDrive, and an empty stub still sits on the Desktop. `CLAUDE.md` described the GitHub repo as private when it is **public**.

**Open item for Ben.** The repo is public. No credentials are exposed (`.env` is git-ignored and has never been committed; a scan of tracked files for Anthropic, Netlify, Resend and JWT key patterns found nothing), but pricing logic, Mark's contact details and the decision history are readable. Decision this session: leave it public while pre-launch, flip at the domain cutover. It is now a pre-launch checklist item in CLAUDE.md.

---

## This session — 2026-07-15, post-job review requests (email + SMS) — MERGED + LIVE ([#62](https://github.com/randommonicle/icc-site/pull/62), squash `090c6ba`)

**Status: merged to `main` and deployed.** Dormant behind env flags, so nothing sends until Mark's keys are set (see "To turn it on" below). A pre-merge adversarial multi-lens review (5 lenses, each finding independently verified) ran over the diff and caught two things, both fixed before merge: (1) `resend:true` overrode idempotency for ALL channels, so recovering a failed SMS re-sent the already-sent email (duplicate) — replaced with **per-channel idempotency** (a channel already `sent` is always skipped; the button is now "Retry unsent"); (2) browser verification caught a **duplicate `const rec`** that broke the entire admin inline script (login included) — fixed, and `test/admin-html-syntax.test.js` was added so a broken inline script fails `node --test`. **Live-verified in production:** `/api/review-request` 401 (admin-gated), `/.netlify/functions/supabase-keepalive` 200, `check_availability` 200 (no regression to the bookings path), `/api/bookings` 401. `node --test` **196 (193 pass / 3 skip)**.

**Two housekeeping asks first:** (1) repo pulled — already up to date on `main` (`620bdbe`); nothing to merge. (2) **Supabase was about to auto-pause for inactivity — reset it** by running four live `check_availability` reads against the ICC `jobs` table (`https://super-frangollo-c3a14a.netlify.app/api/chat`, all 200, returned the Postgres 9–15 grid). Note the MCP Supabase connector still can't reach the ICC project (wrong org, L-018-era), and the local `.env` holds only Netlify keys, so hitting the live function is the no-secret way to generate DB activity. **It would drift toward pausing again after ~7 days of no activity, so a keep-alive is now built:** `server/netlify/functions/supabase-keepalive.js` (`@daily` in `netlify.toml`) does one cheap read-only `select id from jobs limit 1` per day so the project never auto-pauses pre-launch. Redundant once real traffic keeps it awake, harmless to leave. Registers on the next Netlify deploy of this branch (confirm in the Functions/Scheduled tab).

**Main work — the DESIGN §9 review engine, built with SMS pulled forward (D-025).** A one-click **"Mark complete & request review"** button on each admin booking card marks the job `completed` and sends the customer a Google-review ask over **email (Resend)** and **SMS (The SMS Works)**. All **behind env flags, dormant** until Mark's accounts exist — merging changes nothing live until the vars are set.

- **New:** `server/netlify/functions/reviewRequest.js` (`POST /api/review-request`, `requireAdmin`-gated, one-click complete+send, fail-closed per channel, idempotent), `server/netlify/functions/smsProvider.js` (provider-agnostic `sendSms()` + The SMS Works adapter + UK-mobile normalisation; `SMS_PROVIDER` selects the adapter, default `smsworks`), `shared/config/reviews.js` (review URL + sender id), `shared/reviewMessages.js` (pure email/SMS builders). Redirect added in `netlify.toml`.
- **Changed:** `bookingsStore.js` (surface real `jobs.status` as `job_status`), `bookings.js` (annotate `review_sent` from a `messages` lookup + `annotateReviewSent` helper), `admin.html` (the button/note/resend controls, `completeAndRequestReview()` handler, real completed-status pill), `.env.example` (the review vars).
- **Provider choice (D-025):** costed Twilio / The SMS Works / BulkSMS / ClickSend; chose **The SMS Works** (~3.1p + VAT/delivered text, GBP, credits never expire, 50 free test credits) as best-fit for a low-volume UK sole trader. The gateway is isolated behind one adapter, so switching to Twilio later is ~20 lines. Cost at ICC volume is ~£1–4/month.
- **Verified:** `node --test` **193 (190 pass / 3 pre-existing skips)** — new suites `review-messages`, `sms-provider` (injected fetch), `review-request` (fake Supabase + injected send fns: routing, gates, idempotency, fail-closed logging, no-double-send). Admin card rendering DOM-verified in the browser (button in the booked state; "✓ Review requested" + Resend once sent; no button on legacy Blobs rows; Completed pill). No live send tested — dormant until configured.

**To turn it on (Mark / Netlify, out-of-repo):** set **`GOOGLE_REVIEW_URL`** (his Google Business Profile review link — a short `g.page/r/...` also keeps the SMS to one segment), **`SMSWORKS_API_KEY`** (from a The SMS Works account he owns, D-009), optionally **`SMS_SENDER_ID`** (default `ICCleaning`). Email review also uses the A4 vars already set (`CUSTOMER_FROM`/`CUSTOMER_REPLY_TO`/`PUBLIC_SITE_URL`). No deploy needed. **Next:** Ben to review + merge; then a live send-to-self smoke once the SMS key + review link exist; the FreeAgent invoicing slice (D-024) is still the other open backend build.

---

## This session - 2026-07-08, machine consolidation (work machine)

Housekeeping only, no code change. On the work machine all of Ben's projects were consolidated under `C:\Users\ben\Projects\`, so this repo now lives at `C:\Users\ben\Projects\icc-site` (was `C:\Users\ben\icc-site`). The Claude memory key was re-keyed to match so memory still auto-loads. The live site is unaffected (Netlify builds from git). If the repo is ever moved again, hand-copy the gitignored `.env` (Netlify secrets) to the new location and re-run `npm install`. New committed `MACHINE_LAYOUT.md` carries the standing two-machine guidance (work = this path; home = `C:\Users\bengr\OneDrive\Desktop\icc-site`, OneDrive-synced). No commit or push was done; the change is staged for Ben.

**Last updated:** 22 June 2026. **This session (22 June): replaced the hero logo with a green, seamless (transparent) cutout of the brand logo that blends into the dark hero — no panel, no fringe — derived from `logo.jpg` (recolour blue→green, then key the background to transparent with the badge protected by a circular mask). Merged + live ([#59](https://github.com/randommonicle/icc-site/pull/59), squash `7f4dab6`); only the hero `<img>` changed (favicon/og/structured-data still use `logo.jpg`). See the top "## This session — hero logo" section.** **This session (19 June): independently reviewed the go-live privacy notice (UK GDPR/PECR) against the actual code data-flows — verdict AMBER, no RED — made one accuracy fix (the Supabase processor line now names enquiry/lead records) and MERGED `feat/prelaunch-privacy-ico-gbp` to `main` ([#53](https://github.com/randommonicle/icc-site/pull/53)). Then built the **A5 timed retention purge** (a daily Netlify scheduled function deleting handoff leads older than 6 months, the period the notice now promises) and the safe `ALLOWED_ORIGINS` safe-strict variant; **both merged + live-verified** ([#54](https://github.com/randommonicle/icc-site/pull/54), [#55](https://github.com/randommonicle/icc-site/pull/55)). See the top two "## This session" sections (A5 first, then the privacy review). Then, on Mark updates, swept **all "+ VAT" off the platform** (he is not VAT-registered, so prices are now flat) and recorded the **FreeAgent integration direction** for the operational backend (D-024); **merged + live** ([#57](https://github.com/randommonicle/icc-site/pull/57), squash `5718bd3`). The FreeAgent invoicing flow is now decided (review-then-send) and is the next slice to build. The 18 June notes follow.** **This session (18 June): drafted the go-live privacy notice (sole-trader controller; home address held off-page per D-016) and prepared the ICO-registration plus Google Business Profile launch docs. See the first "## This session — privacy notice + ICO/GBP launch prep" section below; the 16 June notes follow.** **This session (16 June): the doc set was refreshed to the post-cutover live state, and two pre-launch UK GDPR items, A4 (handoff-email controller identity) and A5 (handoff-lead erasure), were built, property-reg-reviewed (approve, no RED) and committed on `claude/funny-wilson-666c69` and **merged to `main` as [PR #52](https://github.com/randommonicle/icc-site/pull/52)** (deploy preview built green). With the chip's booking-email A4 (**PR #51**, also merged), both customer-facing emails now carry A4 identity. 16 stale branches pruned. The A4/A5 functional email/erase checks stay login-gated for Ben. See the top "## This session — docs refresh + A4 + A5" section.** Earlier (15 June, late): **PHASE 1 IS LIVE: the green Astro site was cut over to production today (PR #49, squash `7ed4f58`).** Netlify now builds `site/` and publishes `site/dist`; the live site is the green multi-page design, and the old blue `index.html` with the fabricated `500+`/`98%` stats is no longer served. A non-technical **client report for Mark** is on the Desktop (`ICC_Mark_Report/ICC_Platform_Update.pdf` + `.html`, plus `ICC_Launch_Privacy_Details.md`). **Next: the domain move (`intelligentclean.co.uk`) + Mark's test-drive feedback.** Full detail in the "## This session — Phase 1 green cutover + Mark report" section below.

**Earlier this session — Slices 5e-2 (handoff draft→send) and 5d (admin Supabase Auth) are MERGED to `main` and LIVE** (PRs #42, #44; `31225e1`). The `20260614110000` migration (4 new `messages` columns) was applied to hosted (Supabase Management API, catalog-verified). Live probes pass: home 200; `/api/bookings` + `/api/handoffs` return 401 (a bogus token → 401, confirming the 5d `getUser` verification runs against real Supabase, not a 500); the new email login is deployed. `node --test` 134 pass / 3 skip. **ALLOWED_ORIGINS deliberately deferred** to the domain cutover (decision-record only, no code — see "things to watch"). Mobile polish shipped (admin action buttons wrap; the public trust badges collapse on mobile). **Ben verified a real operator login (15 June): both operators sign in, bookings + handoffs load, and a wrong password is rejected, so 5d is fully live and confirmed.** Minor follow-ups (optional, no rush): `supabase migration repair --status applied 20260614110000` to reconcile migration history (idempotent SQL, L-019); remove the now-legacy `ADMIN_SECRET` from Netlify (no longer read by the app); a live draft+send smoke for 5e-2 (a real soft-reason handoff → draft → send to a test inbox); and the independent code-review pass (subagent limit hit this session — run `/code-review` when convenient). **Nothing in flight.** (The 5e-2/5d "This session" sections below were written pre-merge and say "not merged"; they are now merged + live as summarised here.) **Follow-on review (same day):** an independent code review of the live 5d + 5e-2 (two reviewer agents plus a manual pass) returned **AMBER, no RED**; the load-bearing safety invariants were verified as holding, and the in-repo AMBER findings (A1/A2/A3/A6/A8 plus a stale TODO) were fixed and **merged + live** (PR #47, squash `7790d0e`, Netlify deploy verified); the live 5e-2 smoke passed and the reply email was delivered. **A4-lite** (an ICC sign-off on the reply email) shipped too; the rest of A4 (privacy-notice link) and A5 (handoff-lead retention) stay tracked as pre-launch. See the "5d/5e-2 code-review remediation" section below.

---

## This session — hero logo: green, seamless brand logo (22 June 2026)

**MERGED + live ([#59](https://github.com/randommonicle/icc-site/pull/59), squash `7f4dab6`).** The hero logo now uses a **green, transparent** version of the brand logo that blends seamlessly into the dark hero — no visible panel/rectangle, and none of the light "fringe" marks the earlier transparent conversions had.

**Context / what was tried (so it is not re-litigated):** Mark/Ben generated transparency + "vector" conversions of the logo via Claude design. Findings: (1) **transparent PNGs cut from the light-background source** left a pale matte fringe + specks that glowed on the dark hero; (2) the **SVGs were unusable** — the emblem was an empty `<image>` tag (no badge) and the text was live "Montserrat" (a font the site does not load); (3) a **white/reversed** recolour read well but still carried the fringe; (4) a **vector redraw** prompt did not come out cleanly (the emblem is detailed, painterly AI art). Decision: do **not** cut from the light source or chase a vector — work from the existing **dark-background banner** (`logo.jpg`), where any leftover edge pixels are dark and disappear on the hero.

**What shipped (`site/public/logo-green.png`, the hero `<img>` only):** derived from `logo.jpg` (the brand logo on a **blue→green** gradient — its top-left is genuinely blue, `#0E2038`). (a) Recolour the background **blue→green** by swapping the G/B channels only where blue dominates (`B>G`); this greens the background and the emblem's navy half while leaving the teal wordmark + gold tagline/rim untouched. (b) Patch out a stray light triangle baked into the source's bottom-right corner. (c) **Key the background to transparent** so the hero shows through — the badge (whose dark half matches the background, so a plain brightness key would eat it) is protected by an **auto-detected circular mask** (found from the gold rim), and the wordmark/tagline are kept by a **luminance key**. Because the source background is *dark*, leftover edge pixels are dark and **vanish on the hero**. The processing was ad-hoc PowerShell (System.Drawing); the **committed PNG is the artefact**, so it does not need regenerating, but the recipe is here if a tweak is wanted (e.g. lift the now-green emblem half for more contrast).

**Scope / unchanged:** only the hero image changed (`index.astro` → `/logo-green.png`). The **favicon, og:image and LocalBusiness/Article structured-data still use `logo.jpg`** (`BaseLayout.astro`, `guides/[slug].astro`), and `book.astro`'s chat avatar still uses `logo.jpg` — all fine for now (a transparent PNG is a poor social-share image; the chat avatar sits on a light bubble). Revisit only if a consistent transparent mark is wanted in those places too.

**Verification:** `node --test` **164 (161 pass / 3 skip)** — the unchanged baseline (an asset-only change touches no tested logic); `npm run build --prefix site` green (22 pages); live-verified on the local preview (`/` serves `/logo-green.png`, 200, `image/png`). **Local-preview gotcha (now in L-017):** `npm run dev` throws `require is not defined` on any page importing the CommonJS `shared/config/*.js`; preview locally with `npm run build --prefix site` + `npm run preview --prefix site` instead.

---

## This session — VAT removed (not VAT-registered) + FreeAgent direction (19 June 2026)

**MERGED + live ([#57](https://github.com/randommonicle/icc-site/pull/57), squash `5718bd3`); flat pricing is now on the live site.** Two updates from Mark, via Ben: he is **not VAT-registered** initially (sole trader, under the threshold; may register later), and his accounting software is **FreeAgent**. Both recorded as **D-024**.

- **VAT removed everywhere customer-facing.** The live site was actually wrong here — quoting "+ VAT" while not registered, which is not allowed. An L-009-style whole-repo sweep: `shared/config/pricing.js` (flat `price` figures, `vat_rate` gone, VAT-free `quote()` = items + flat £15 surcharge + 10% deposit on the total), `serviceArea.js` (surcharge prose + the field renamed `out_of_area_surcharge`), the assistant prompt + `BOOKING_READY` fields + price-floor comment + confirmation email + PDF (`chat.js`), the `/api/v1/quote` contract (`shared/contract/quote.ts` + README) + endpoint comment, every site price (services/index/areas pages + the 6 area `.md` files), `admin.html` ("Est. Revenue", the furniture line), the GBP/launch docs, and the tests. **Prices keep the same numbers** — £75 stays £75 (Ben's call) — just no longer "+ VAT"; the deposit is now 10% of the flat total.
- **Intentional residual "VAT" only:** legacy DB column names (`*_ex_vat` — renaming needs a migration; values are correct since net = gross), code/contract comments that *explain* there is no VAT, doc history, and the retained `index.html` rollback (line 335, not served). Verified: built site + live source grep clean of "+ VAT"/"plus VAT"/"Ex VAT"; `npm run build --prefix site` green (22 pages); `node --test` **164 / 161 pass / 3 skip** (pricing tests rewritten to the no-VAT shape).
- **FreeAgent = integrate, don't rebuild (D-024).** FreeAgent already does invoicing, payment chasing, bank feed + reconciliation, MTD filing and accountant access. So the platform **feeds** FreeAgent (REST API / OAuth2) and builds only what FreeAgent can't: marketing churn/re-engagement (Phase 4, consent), review requests, the operational diary/CRM, the AI assistant. **The earlier bespoke-invoicing slice plan is dropped.**

**FreeAgent invoicing — flow DECIDED (review-then-send), API VERIFIED, NOT yet built. This is the next backend slice.** Decided with Ben after checking the live FreeAgent API: on job completion the backend creates a **draft** invoice in FreeAgent (find-or-create contact by email, line items from the job, due date, pay-online link), the admin surfaces it for Mark to **review the final amount** (often confirmed on the day), and Mark **one-click sends** → FreeAgent emails the client (`POST /v2/invoices/:id/send_email`) and the status flows back to our dashboard. FreeAgent then handles payment matching (its bank feed) + overdue reminders. The FreeAgent API was confirmed to do create (`POST /v2/invoices`, lands as Draft) + `send_email` + PDF (`GET .../pdf`) + a `payment_url` (Stripe/GoCardless/PayPal) programmatically; the "platform sends its own branded invoice + sync to FreeAgent" alternative was **rejected** (dual-system maintenance cost). Full record in the **D-024 addendum**.

**To build (next session), behind a credentials flag like the Supabase wiring:** (1) a `freeagent_invoice_id` + status pointer on the job (small migration, or repurpose the existing `invoices` table); (2) a FreeAgent API client (OAuth2 refresh-token held server-side) + the find-or-create-contact / create-draft / send / fetch-status calls; (3) "create draft on job-complete" wired into the admin job lifecycle; (4) the admin **review + one-click Send** UI; (5) reflect paid/overdue status back (poll on a schedule, or deep-link to FreeAgent — webhook availability not yet checked). Line items read from `shared/config/pricing.js` (now flat, no VAT). **Gated on Mark (out-of-repo):** create a FreeAgent API app (**FreeAgent → Settings → API**) for a client ID/secret + a one-time OAuth authorise. FreeAgent is free with NatWest/RBS/Mettle bank accounts, paid otherwise (cf. Mark's likely Revolut, D-004). The privacy / ICO / domain launch gates are unchanged.

---

## This session — A5 retention purge built (19 June 2026)

**MERGED + live ([#54](https://github.com/randommonicle/icc-site/pull/54), squash `982b680`).** The privacy notice (live on the `.netlify.app`) promises unconverted enquiries are kept "no longer than 6 months", but nothing enforced it. This builds the automated Art.5(1)(e) purge that closes the promise-vs-reality gap — the open half of **D-023**. Mechanism chosen this session (Ben): a **Netlify scheduled function**, over Supabase `pg_cron`, so it is `node --test`-tested, observable beside the other functions, and parameterised from one config file.

- **`shared/config/retention.js`** (new) — single source for the period: `HANDOFF_LEAD_RETENTION_MONTHS = 6` + `handoffLeadCutoffISO(now)` (UTC month maths, L-005). The notice's promised period and the enforced period now come from one place (D-006), so they cannot drift.
- **`server/netlify/functions/purge-handoffs.js`** (new) — the daily function. Deletes `messages` rows with `kind='human_handoff'` older than the cutoff: hard kind-guarded (never touches a booking/other message) and bounded to already-expired rows (idempotent, safe to trigger anytime, so no auth gate needed). `getSupabaseAdmin()` null = logged no-op (fail-safe). Logs a COUNT only, never PII.
- **`netlify.toml`** — `[functions."purge-handoffs"] schedule = "@daily"`. **`shared/messages.js`** — the `TODO(D-008/retention)` is resolved. **D-023 addendum + CLAUDE.md hardening checklist** updated (A5 now ticked; the DP review confirms the period, a one-line change if it moves).
- **Verified:** `node --test` **159 / 156 pass / 3 skip** (6 new retention tests, incl. two DST/year-rollover cutoff cases that caught a local-time bug fixed to `setUTCMonth`, the kind-guard/cutoff filter via a fake client, and the 6-month figure pinned). **Post-deploy check:** confirm the schedule registers in the Netlify Functions tab / deploy log (cannot be seen from the repo).

**Live-verified (19 June, post-merge):** homepage 200, `/api/chat` → 405 (chat.js + the origins refactor load and route). **Still to do (Netlify UI, not visible from the repo):** confirm the `@daily` schedule registered in the Functions tab / deploy log; the first run is a 0-row no-op (nothing is 6 months old yet).

**The safe `ALLOWED_ORIGINS` variant is also DONE + merged + live** ([#55](https://github.com/randommonicle/icc-site/pull/55), squash `6e07b51`): `buildAllowedOrigins()` now folds the site's own Netlify deploy origins into the allowlist even in strict mode, so setting `ALLOWED_ORIGINS` no longer 403s the `.netlify.app`/previews. No live behaviour changed (the var is unset). See the "things to watch" `ALLOWED_ORIGINS` bullet — enabling it (setting the env var) is still deferred to the cutover.

---

## This session — privacy-notice review + merge (19 June 2026)

**Branch `feat/prelaunch-privacy-ico-gbp` independently reviewed and MERGED to `main`** (Ben's go-ahead: "independent review, then merge"). A UK GDPR/PECR review of the go-live privacy notice (`site/src/pages/privacy.astro`), cross-checked against the **actual data flows in the code** (not just the prose), returned **AMBER, no RED** — the same bar as the 16 June A4/A5 review.

**Verified against code (all accurate):**
- **Art.13 completeness:** controller identity + contact (email/phone/post-on-request; address off-page per D-016), purposes + lawful bases, recipients, transfers, retention (6yr/6mo), all data-subject rights, the **Art.22** line (no solely-automated significant decisions; Mark confirms every booking) and a **Complaints/ICO** section. Art.14 source-of-data is N/A (collected from the data subject).
- **Processors match reality:** Anthropic (chat/vision), Resend (email), Supabase (UK/London DB), Netlify (hosting/functions), Google (Workspace inbox + calendar link). The stale "Netlify stores booking records" line is correctly gone.
- **"No tracking cookies"** — confirmed: the only `<script>` in `BaseLayout.astro` is LocalBusiness JSON-LD; no analytics/ad pixels anywhere.
- **"We keep only the details needed"** — confirmed: a booking persists structured fields only (`bookingsStore.js` / `chat.js`), never the raw transcript; a conversation snippet is stored/emailed only on a handoff (`chat.js:660`, `shared/messages.js`), which the retention section discloses.

**One accuracy fix made (in this merge):** the Supabase sharing line said "booking and customer records"; the `messages` table also holds **enquiry/handoff-lead** rows (`customer_id` null by design), and the notice's own retention section distinguishes enquiries from bookings, so it now reads "booking, customer and enquiry records." One line, in-voice; revert if undesired.

**AMBER / advisory items carried forward (none blocked the merge; all gate the PUBLIC launch, separately gated on the ICO number + domain + the human DP review the notice itself requires):**
- **Anthropic no-training claim (L-009).** The notice tells customers "Anthropic does not use them to train its models." True under Anthropic's commercial/API terms by default, but it is a third-party claim shown to a customer — **confirm the `ANTHROPIC_API_KEY` account is on the no-train-on-API-inputs posture** (already an out-of-repo check from the 5d/5e-2 review) before public launch.
- **Consumer Contracts Regs (Phase 3, when deposits/payments go live).** Distance-selling rules require full trader details + a geographic address be **given to the consumer** before/at contract. The D-016 off-page-address decision means this should be satisfied via the booking-confirmation email or on request, not the public page. Flag for the human DP/legal review; not a privacy-notice defect.
- **Art.13(2)(e) (optional polish).** Could state that name/contact/work-address are needed to provide the service (and the consequence of not providing them). Commonly omitted for a simple service business; DP reviewer's call.
- **By-design `[to confirm]`:** ICO registration number + the per-provider transfer position. Both correctly external gates.

**Verification:** `npm run build --prefix site` green (22 pages; the edited line confirmed in `dist/privacy/`); `node --test` **153 / 150 pass / 0 fail / 3 skip**. Machine note: the root `@supabase/supabase-js` dep was not installed on this laptop, so `node --test` initially failed to load — `npm install` at the root fixed it (the suite was never broken; the dep just was not present locally).

**Next (unchanged from 18 June, all gated on Ben/Mark):** ICO registration → paste the number into `privacy.astro`; provision ICC's own 01452 number (then the documented site swap); create the GBP from the spec; arrange the human DP review; then the domain move (`intelligentclean.co.uk`) as the go-public step.

---

## This session — privacy notice + ICO/GBP launch prep (18 June 2026)

**Branch `feat/prelaunch-privacy-ico-gbp` (NOT merged; awaiting Ben's review + go-ahead).** Mark confirmed he trades as a **sole trader**, and Ben will handle the ICO registration on his behalf, which unblocks the privacy work. Three pre-launch deliverables:

- **Privacy notice rewritten (`site/src/pages/privacy.astro`).** Controller is now "Mark McClymont, a sole trader trading as Intelligent Carpet Cleaning" (no company number). On the home-address question Ben chose the **off-page** option (the privacy-protective reading of D-016): the notice identifies the controller and gives contact by email, phone and **post on request**, with the full address given to the ICO privately, not published on the page. Beyond the placeholders, **stale facts were corrected**: the processor list now includes **Supabase** (UK/London database holding booking + customer + handoff-lead records) and drops the wrong "Netlify stores booking records" line; the **human-handoff lead** flow is described; the AI section states Anthropic does not train on the inputs; and the cookies/chat line matches what is actually stored. **Retention stated: ~6 years financial / 6 months unconverted leads** (D-023). Only two `[to confirm]` remain by design: the **ICO registration number** and the per-provider transfer check. Verified by a clean `npm run build --prefix site` (22 pages) + a grep of `dist/privacy/` (new content present, stale line gone, zero em dashes). **Still pending before go-live: the ICO number + a data-protection professional review** (the notice itself says so).
- **ICO registration brief (`docs/LAUNCH_ICO_REGISTRATION.md`).** Sole trader processing customer PII must pay the data protection fee: **Tier 1, £40/yr** (£35 by DD). What to enter (controller Mark McClymont / ICC, the D-016 address given privately with a request to keep the home address off the public register), the self-assessment + fee links, and the step to drop the issued number into the privacy notice. Ben/Mark submit + pay (cannot be automated from the codebase).
- **Google Business Profile spec (`docs/LAUNCH_GBP_PROFILE.md`).** A ready-to-paste profile respecting D-016 (service-area business, **address hidden**) and L-009/D-015 (no fabricated claims): real-world name (no keyword stuffing), primary category Carpet cleaning service (+ Upholstery / Rug), the core + wider service areas from D-011, Mon–Sat 09:00–16:30 hours, a clean description, the full price list from `shared/config/pricing.js`, real-photos-only, verification steps, and Mark-owns-it-from-the-start (D-009). Ben/Mark create + verify in Google.

**Decisions/records:** D-016 addendum (sole trader; address off the public privacy page, held privately for ICO + GBP only); D-023 addendum (the 6yr/6mo periods are now disclosed in the notice; the **timed purge is still unbuilt**).

**Next:** Ben to (1) register with the ICO and paste the number into `privacy.astro`; (2) **provision a distinct ICC phone number** (a local Gloucester **01452** geographic number that forwards to his mobile, with WhatsApp Business on the same number via voice verification) for the GBP and the site, since 01242 279590 is already on Regency Cleaners' GBP and ICC's address is hidden so the phone is its main public identifier (decision 18 June; `docs/LAUNCH_GBP_PROFILE.md` lists the swap targets, and the live site keeps the working number until the new one exists); (3) create the GBP from the spec; (4) review the privacy notice and arrange the DP professional review. The domain move (`intelligentclean.co.uk`) remains the go-public step after that.

---

## This session — docs refresh + A4 + A5 pre-launch compliance (16 June 2026)

**Merged to `main` as [PR #52](https://github.com/randommonicle/icc-site/pull/52)** (squash). The deploy preview built green (home 200, `/privacy/` 200, `/api/handoffs` 401, `/api/chat` 405, `/book/` 200) and production auto-deploys from main. After merging origin/main (PR #51's booking-email A4) into the branch, `node --test` is **153 (150 pass / 3 skip)**. The A4/A5 functional checks (email content, erase button) are login-gated and left for Ben.

- **`366b96b` docs refresh `[skip ci]`.** CLAUDE.md, README.md and ROADMAP.md still described Phase 0 as current (single-page `index.html` live, Astro "not cut over", Phase 2 "not started"). Updated to the live post-cutover state: Astro site live, `index.html` = rollback, Supabase Postgres bookings, Supabase Auth admin, Resend sending domain verified; ROADMAP Phase 0/1/2 RAG + checkboxes reconciled (this file stays the authoritative slice ledger). Verified the live site healthy first (home 200 "Done Properly", fabricated stats gone, `/admin` 200, `/api/chat` 405, `/api/handoffs` 401, `/book/` 200). **Closes outstanding item 4.**
- **`def17fb` A4 — handoff-reply email identity (UK GDPR Arts.13/14).** The outbound customer reply from `handoffs.js` now carries controller identity: a privacy-notice link in both email parts (from an env-overridable `PUBLIC_SITE_URL`, default the production domain) and a real monitored `Reply-To` (`CUSTOMER_REPLY_TO`, default `hello@`). New tests; live `/privacy` target confirmed 200. Property-reg review: approve, no RED. **Remaining (pre-launch):** set `CUSTOMER_FROM`/`CUSTOMER_REPLY_TO`/`PUBLIC_SITE_URL` in Netlify + Mark's privacy-page controller details. The same gap on `chat.js`'s booking-confirmation email (more PII) was fixed in parallel as **PR #51** (now on main); this branch merged main in and reconciled the shared `.env.example`/CLAUDE.md A4 items so both surfaces share `PUBLIC_SITE_URL`/`CUSTOMER_REPLY_TO`.
- **`04c80aa` A5 — handoff-lead erasure (Art.17) + retention decision (D-023).** A manual admin "Erase lead" action hard-deletes a `human_handoff` row (kind-guarded, leaves no orphans, allowed in any status). The timed storage-limitation purge (Art.5(1)(e)) is recorded as a **proposal** in D-023 (default 6 months, pending Mark/DP confirmation) and left unbuilt. Property-reg review: approve, no RED, with two documented (not code) follow-ups now in D-023: full erasure is a **two-part procedure** (DB delete + Mark deleting the escalation-email copy), and verify requester identity (Art.12(6)) before erasing.

**Branch cleanup:** deleted 16 stale branches in total (5 merged-by-ancestry + 11 squash-merged, all recoverable via reflog), down to 11 local branches. The remaining worktree-pinned branches were left (some may be active sessions); prune idle worktrees with `git worktree remove <path>` when known idle.

**Next:** #52 and the chip's #51 are both on `main` and live. Still worth doing logged in (non-blocking): confirm the handoff reply + booking-confirmation emails show the privacy link + `Reply-To` (set `PUBLIC_SITE_URL` to the `.netlify.app` host if you want the link to resolve pre-domain), and that the admin "Erase lead" button removes a **test** handoff (it hits the real hosted Supabase, so never a real lead). Pre-launch still open: set the email env vars (`CUSTOMER_REPLY_TO` / `PUBLIC_SITE_URL` / verified `CUSTOMER_FROM`) in Netlify + Mark's privacy-page controller details (A4); build the A5 timed purge once the retention period is confirmed (D-023). The domain move (gated on Mark) remains the go-public step.

---

## This session — Phase 1 green cutover LIVE + Mark report (15 June 2026, late)

**The Phase 1 green Astro site is now LIVE in production (PR #49, squash `7ed4f58`)** — the cutover that had been gated since June.
- **`netlify.toml`:** added `command = "npm install --prefix site && npm run build --prefix site && cp admin.html site/dist/admin.html"` and `publish = "site/dist"`. Netlify builds the 22-page Astro site and serves `site/dist` instead of the repo-root `index.html`. Functions (`server/netlify/functions`), the `/api/*` + `/admin` redirects, and the security headers are unchanged.
- **`admin.html` stays canonical at the repo root** and is copied into `site/dist` at build time (no second copy to drift). `/admin` → `/admin.html` resolves from the build.
- **The Phase 0 blue `index.html` is kept at the repo root as the rollback** — reverting PR #49 restores it. It is no longer served.
- **Verified on the deploy preview AND live:** green home ("Done Properly", Astro multi-page nav); the fabricated **`500+ cleans` / `98% satisfaction` stats are GONE** (they were still live on the old `index.html` — an ASA risk that also contradicted the June client report; the cutover removes them); `/admin` 200; `/api/chat` 405; `/api/handoffs` 401; `/book/` 200 with the chat wired to `/api/chat`. Local build clean (22 pages). `book.astro` is the same working chat+booking as the old `index.html` ("same `/api/chat`/`confirm_booking` contract, ported faithfully"), so the assistant is preserved.
- **Live on `super-frangollo-c3a14a.netlify.app` (green), still NOT on the domain.** The domain move is the remaining go-public step.

**Client report for Mark (on the Desktop, deliberately NOT in the repo so it is not web-published):**
- `Desktop/ICC_Mark_Report/ICC_Platform_Update.pdf` (6 pages) + `.html` (+ `home.png`/`areas.png`/`logo.jpg` as sibling files). A non-technical "since June" update: domain + email done, back office built, how to test (the live site + `/admin`, login `mark_director@intelligentclean.co.uk` / **temp password `ICC_2026!`**, change before public launch), how the Google Workspace email fits in, costs (domain ~£12/yr, Netlify ~£7/mo Personal, Workspace ~£12/mo trial, Claude ~£3, Supabase/Resend free; ~£30 to date), and what's left. Screenshots reused from the June report's green build (they match the now-live green site).
- `Desktop/ICC_Launch_Privacy_Details.md` — what Mark must provide to unblock the domain (ICO registration ~£40/yr, controller details, retention preferences).

**Also merged today:** PR #47 (5d/5e-2 review remediation + A4-lite ICC email sign-off, `7790d0e`), PR #48 (docs `[skip ci]`), PR #14 (booking cleanup script — now safe since only `site/dist` is web-published), PR #49 (cutover).

**Screenshot tooling gotcha (worth an L-entry):** headless Chrome's screenshot/GPU path crashes in the agent's sandbox ("Abnormal renderer termination", even on `example.com`), and the Bash tool auto-backgrounds browser launches. **`--print-to-pdf` works** (a different pipeline) with `--no-sandbox --disable-gpu --disable-dev-shm-usage` — that is how the report PDF was rendered. For live screenshots use the **Claude-in-Chrome extension** (needs Chrome open + connected; its allowlist covers the main `.netlify.app` but NOT `deploy-preview-*` subdomains). Entering the admin password into the login form is a hard no for the agent, so a dashboard screenshot needs Ben logged in.

**Next session / outstanding:**
1. **Domain move (`intelligentclean.co.uk`) — the go-public step, gated on Mark.** He provides the privacy details (`ICC_Launch_Privacy_Details.md`: ICO registration + controller details to fill the green privacy page's `[to confirm]` placeholders), then a DP review. Technical steps (a short session): point 123reg/GoDaddy DNS at Netlify, lock `astro.config.mjs` `site` (confirm `www` vs apex), set `ALLOWED_ORIGINS=https://intelligentclean.co.uk,https://www.intelligentclean.co.uk` (closes L-001; currently OFF — it would 403 the `.netlify.app` chat), verify a 403 from a disallowed origin.
2. **Mark test-drive feedback** — report ready to send; collect + action. Clear any test bookings he makes (bookings are in Postgres now, so clear via the admin / Supabase, not the Blobs `scripts/delete-booking.js`).
3. **Privacy page placeholders are live** on the green `.netlify.app` site (acceptable for a non-marketed pre-launch test; MUST be filled before the domain/public launch).
4. **Stale docs refresh — DONE (16 June, `366b96b`).** CLAUDE.md/README/ROADMAP now describe the post-cutover live state. Still pending: once the cutover is proven over a few days, the vestigial root `index.html` (the rollback) can be deleted.
5. **Pre-launch flags — A4 + A5 code-side DONE this session (`def17fb`, `04c80aa`), property-reg-reviewed.** A4 remaining: env values in Netlify + Mark's privacy-page controller details (`TODO(prelaunch/email-identity)`). A5 remaining: the timed purge + retention-period confirmation (`TODO(D-008/retention)`, D-023). Plus the spawned `chat.js` booking-email parity task.

**`main` now carries PR #52 (docs refresh + A4 + A5) and PR #51 (booking-email A4). `node --test` 153 / 150-pass / 3-skip, working tree clean, nothing in flight. Login-gated A4/A5 email/erase checks left for Ben (non-blocking); domain move gated on Mark.**

---

**Earlier — 14 June 2026 session.** (**Slice 5b — bookings Blobs→Postgres — merged (PR #38, squash `ef5398b`) and ENABLED in production**: `BOOKINGS_STORE=postgres` set in Netlify + redeployed, live `check_availability` confirmed on the 9..15 Postgres grid, the postcode-nullable migration applied to hosted and its migration history reconciled (`migration repair`); `node --test` 111 (108 pass / 3 skip), real-Supabase IT 16/16 against hosted, pgTAP 18/18. Code in PR #38; docs/enablement/reconcile in PRs #39 + #40. **The whole of Slice 5b is shipped, live and verified; nothing in flight.** Next Slice 5 work: 5d (Supabase Auth for admin) and 5e-2 (handoff approve/send). See "This session — Slice 5b" below. Earlier the same period: Slice 5a **ENABLED in production** + Slice 5e **read-only handoff review merged + live**; see those "This session" sections below). Earlier this session: Slice 5a — the escalation INSERT wired live, fail-open + env-gated; merged to `main` (PR #32, `b421138`) and deployed as a production no-op. Live `/api/chat` returns 405 (the new `@supabase/supabase-js` require bundles fine), and the INSERT was dormant until enablement. **ENABLED in production 14 June 2026** (4e migrations pushed to hosted, `SUPABASE_*` set in Netlify, a live escalation wrote a real `human_handoff` row, verified then deleted); see "This session — Slice 5a" below). Previously 13 June 2026 (continuation on the home machine — see "This session — D-011 boundary + Slice 4e foundation" below). Merged + verified since the last note, in order: web search (4d, #24, live), vision → Opus 4.8 (#25, live), the confirmed **D-011 service-area boundary + deposit base** (#27, `9979ba9`, live-verified), and the **Slice 4e foundation** (escalations as `human_handoff` messages, #28, `ca47c43`, local-first). **Slice 4 is complete** (4a–4d live; 4e foundation merged); the remaining work is the **Slice 5 live Supabase cutover** (sign-off-gated). The earlier 12 June detail is retained below. This session started **Slice 4 (backend AI / D-019)** — see the "This session — Slice 4a + 4b" section below, and the **D-019 addendum** in DECISIONS.md for the decisions locked this session (no Haiku; customer-facing citation links; all platform AI on the Anthropic API). The dense summary that follows records the **predecessor session (now merged as PR #15)**, which closed out the website contact sweep — swept the last stale `talktoregency@gmail.com` → `hello@intelligentclean.co.uk` and `intelligentcarpetcleaning.co.uk` → `intelligentclean.co.uk` references across the dormant Astro `site/`, plus `.env.example` and the CLAUDE.md client-contact line, verified by a clean 22-page build, then **merged to `main` (PR #11) and confirmed live** (production serves `hello@…`, old Gmail gone). Then **merged both to `main` and verified in production**: the **deposit-`undefined` guard (PR #12)** and the **Slice 3 `/api/v1/quote` server-side pricing foundation (PR #13)** — live `/api/v1/quote` returns 405 on GET (so it is deployed + routed) and the quote math is unit-tested 19/19. **Deleted the leftover test booking** (slot 2026-06-24 10:00) with a new cleanup script (**PR #14**, open). Recorded a **D-004 payments addendum** (Revolut Pro vs Stripe — processor kept swappable behind our API) and **D-019** (AI grounding / source-hierarchy / human-escalation strategy); both, plus this handover refresh, are in **PR #15** (open, docs-only). Previous session (10 June): the hosted ICC Supabase project went live + CLI-linked, and the full email stack on `intelligentclean.co.uk` (Resend + Google Workspace + DNS + app From-addresses) was set up and verified end-to-end — see the 10 June section below.** **Phase 2 backend Slices 0–2 are merged to `main` and live in production.** The stack `#6 → #7 → #8` (functions to `server/`, `shared/config` single source, Supabase schema) was merged in order and verified: production now serves `09a5417`, `node --test` is 8/8 on merged `main`, and the live `/api/chat` (check_availability) + `/api/bookings` respond correctly. **Next action: Slice 5 (Blobs→Postgres cutover + the first live Supabase wiring, including the 4e escalation `INSERT` and the admin approve/send UI), sign-off-gated.** Slice 4 is complete: 4a–4d live, and the 4e foundation (#28) merged local-first (no live change yet). Slice 4c (Citations, #20) and a chat-UX polish pass (#21) are now **merged to `main` and live** (`89f9ff9`), both **preview-verified by Ben**. 4c (`node --test` 43/43): the carpet-science facts moved out of the system prompt into a `cache_control`'d **citeable Citations document** (one block per KB section), the L-009 claim rules moved into a system-prompt instruction block (`knowledge.guardrailsBlock()`, the L-016 split), the server resolves each citation back to its KB section (`collectCitations`) while preserving the single-text contract (L-014), and `index.html` renders the cited sections as an inert **muted provenance caption** (L-003; plain labels — `/guides/` links deferred to the Phase 1 cutover, `TODO(citation-links)`). The chat-UX pass added a **goodbye-close** (the model emits a `CONVERSATION_END` marker on a clear goodbye → the client cancels the inactivity timer and ends the session, fixing the "Still there?" nagging after the customer was done) and **intro-dedup** (the prompt no longer re-introduces the assistant, since the welcome bubble already greets by name). Chat-log persistence on close is **deferred to the Phase 2 `messages` table** (Slice 4e/5, `TODO` in `endConversation()`). A further content change (#23, Mark feedback): the DIY-vs-professional KB now covers rental/hire machines too (generically — **never naming the brand**), the assistant **proactively asks** whether a DIY/rented machine has been used (it changes the advice), and gives a **soft, case-by-case** note that corrective work may nudge the final price (no fixed figure; Mark's option 2). See the "This session" sections below. 4a (#16) and 4b (#17) are **merged to `main` and live in production** (`466e397`, `node --test` 34/34 at that point); 4b was preview-verified — the assistant escalates on a damage-risk question and the operator email now **Delivers**, after this session fixed a silent operator-email suppression bug (`mark@` never existed → `mark_director@`; see the Slice 4 section + L-015 + the D-018 addendum). PR #14 (cleanup script) stays open by choice; PRs #15/#16/#17 are merged; docs PR #18 carries this handover + the operator-email fix. Working tree clean. Phase 1 (Astro site) remains in `main`, **not cut over**. The Supabase schema is in the repo but **local-first and not wired to the live functions**, so the merge changed no live behaviour.

---

## Current state — three streams

**1. Live (Phase 0 PoC).** `index.html` + `admin.html` + the serverless functions, on the Netlify site `super-frangollo-c3a14a` (not promoted — **pre-launch**: not on the `intelligentclean.co.uk` domain and not marketed, so real booking traffic is effectively nil and merging to `main` is low-risk for now; the "don't merge mid-traffic" caution tightens at launch — Ben confirmed 12 June). Booking/availability via Netlify Blobs, Resend, PDF job card. Live assistant quotes the flat £15 + VAT surcharge, treats Winchcombe as core, **grounds answers in the citeable KB with a source caption (4c, #20), closes the chat on a goodbye (#21), and proactively asks about prior DIY/rented-machine use (#23)**. Live `index.html` is still the old blue with the old stats, fix at/by cutover. Functions now resolve from `server/netlify/functions/` (Slice 0) and the assistant prompt is generated from `shared/config` (Slice 1, byte-identical). Live availability is still the Phase 0 grid (09:00–17:00 from Blobs) — the schema's hardened 09:00–16:30 hours are NOT wired in yet.

**2. Phase 1 public site (Astro, `site/`).** In `main`, 22 routes, polished (PR #5), **dormant** until the cutover PR. Blocked on Mark (privacy `[to confirm]` + DP review) and the domain (D-013). Independent of Phase 2.

**3. Phase 2 operational backend — Slices 0–2 DONE (merged + live).** Built in slices that each leave `main` deployable, **local-first** (no hosted Supabase project, D-009).

### Phase 2 slices

| Slice | Branch | PR | What | State |
|---|---|---|---|---|
| 0 | `chore/d014-monorepo` | #6 | Functions to `server/` (D-014) | **merged + live** (preview-verified) |
| 1 | `feat/shared-config` | #7 | `shared/config` models/pricing/area (D-006/D-007) | **merged + live** (prod-verified) |
| 2 | `feat/supabase-schema` | #8 | Supabase schema + pgTAP (D-002) | **merged + live** (prod-verified; pgTAP 10/10, L-011) |
| 3 | `feat/slice3-server-pricing` | #13 | `/api/v1/quote` + server-side pricing/surcharge (D-003/D-011/D-012) | **quote foundation merged + live**; Postgres bookings/availability + Auth → Slice 5 |
| 4a | `feat/slice4-knowledge-source` | #16 | KB single source `shared/config/knowledge.js` (D-006) | **merged + live** (24/24; byte-identical prompt, no live change) |
| 4b | `feat/slice4b-escalate-tool` | #17 | `escalate_to_human` tool + server-side tool loop (D-019) | **merged + live** (preview-verified: escalates + operator email Delivered; 34/34) |
| 4c | `feat/slice4c-citations` | #20 | Citations: KB→citeable document, guardrails→system prompt, client provenance caption (D-019) | **merged + live** (preview-verified: grounded answer + caption; 43/43) |
| 4c+ | `feat/chat-conversation-ux` | #21 | Chat UX: goodbye-close (`CONVERSATION_END`) + intro-dedup | **merged + live** (preview-verified: chat closes on goodbye, no double intro; 43/43) |
| 4c++ | `feat/diy-rental-advice` | #23 | DIY/rental-machine advice + proactive question + soft case-by-case cost note (Mark feedback) | **merged + live** (preview-verified; 44/44; brand never named, no invented fee) |
| 4d | `feat/slice4d-web-search` | #24 | Gated/attributed `web_search` + `pause_turn` loop + external-link citations (D-019) | **merged + live** (preview-verified: KB grounding, search fires on a low-stakes question, damage-risk escalates not searches, pricing normal; 62/62) |
| 4e | `feat/slice4e-handoff-messages` | #28 | Foundation: escalations → `human_handoff` messages (D-020); enum + nullable `customer_id` + pure mapping | **merged** (local-first, no live change; node 68/68, pgTAP 14/14). Live `INSERT` + admin approve/send UI = Slice 5 |
| 5a | `feat/slice5a-escalation-insert` | #32 | First live Supabase wiring: escalations ALSO `INSERT` a draft `human_handoff` row, fail-open + env-gated (D-020) | **merged + ENABLED in production (#32, `b421138`)**: 4e migrations pushed to hosted, Netlify `SUPABASE_*` set, a live escalation wrote a verified real row (node 75/1-skip; test row deleted). Active 14 June |
| 5e | `feat/slice5e-handoff-review` | #35 | Read-only admin handoff review: `/api/handoffs` + a Handoffs view in `admin.html` (D-020) | **merged + live (#35, `512e997`)**: prod `/api/handoffs` 401-verified, node 80/2-skip, integration reads a real row from local Supabase. Approve/send lifecycle = 5e-2 |
| 5e-2 | (merged) | #42 | Handoff draft→send: AI draft (soft reasons only), Mark edits + sends by email, fail-closed; structured `handoff_*`/`draft_reply` columns (D-020) | **MERGED + LIVE (`4917464`)**: hosted migration applied + catalog-verified, live 401 probes pass; `node --test` 127/3-skip. Residual: a live draft+send smoke (real handoff → draft → send to a test inbox) |
| 5d | (merged) | #44 | Admin auth: shared `ADMIN_SECRET` → per-user Supabase Auth (email+password) + `ADMIN_EMAILS` allowlist; publishable-key JWT verify (D-022) | **MERGED + LIVE (`31225e1`)**: live probes pass (bogus-token→401 confirms getUser runs); `node --test` 134/3-skip. Signups disabled + 2 operators created. Login verified by Ben (both operators, 15 June) |
| 5b | `feat/slice5b-bookings-postgres` | #38 | Bookings Blobs→Postgres cutover: fail-closed write, 09:00–16:30 hours folded in (former 5c), admin reads both stores, `BOOKINGS_STORE` flag (D-021) | **merged + ENABLED in production (#38, `ef5398b`)**: `BOOKINGS_STORE=postgres` set + redeployed 14 June, live grid confirmed 9..15, postcode-nullable migration applied to hosted. `node --test` 111 (108/3-skip), real-Supabase IT 16/16, pgTAP 18/18 |

Plus a model-config change this session (not a Phase 2 slice): **vision model bumped Opus 4.5 → 4.8** (`chore/vision-best-opus`, #25) — **merged + live**, preview-verified (photo assessment reads well). Policy recorded as a D-007 addendum: vision tracks the current best Opus, bumped by a deliberate one-line pin + a preview photo check, never auto-detected (a silent swap of the model giving damage-risk advice is the D-019 failure mode). Cost-neutral within the flat-priced Opus tier ($5/$25 across 4.5–4.8). Text stays on Sonnet 4.6.

`node --test` is the only logic gate locally; **no CI**, Netlify auto-deploys `main` from GitHub. Branches `chore/d014-monorepo` and `feat/shared-config` were deleted after merge; `feat/supabase-schema` is kept (checked out in another worktree).

## This session — 5d/5e-2 code-review remediation (15 June 2026, branch `claude/cranky-snyder-e69234`, commits `6418162` + docs, NOT merged)

**Context.** Slices 5d + 5e-2 were merged and live (PRs #44 / #42) but had not had the independent code review the discipline calls for on regulated, customer-facing changes (the review agent was cut short last session). Ran it this session: the generic **code-reviewer** plus the **property-reg-reviewer** (UK GDPR / AI-surface), each scoped to commits `4917464` (5e-2) and `31225e1` (5d) and briefed to *verify the claimed safety invariants*, plus a manual read of `adminAuth.js`, `handoffs.js` and `shared/messages.js`.

**Verdict: AMBER, no RED.** Both reviewers and the manual pass confirmed the load-bearing invariants hold in code: `damage_risk` is never AI-drafted (server-side `isDraftableReason` before any model call); the send is fail-closed (status `sent` only after Resend returns 2xx); every read/mutation is `kind='human_handoff'`-guarded; only `handoff_question` reaches the model; the 5d JWT is verified against Supabase (`auth.getUser`, not a local decode) and fails closed 401/403/503; `ADMIN_SECRET` is no longer read on any path; and the admin render is inert (`esc()` + `.value`, no `innerHTML` regression despite the card assembly using `innerHTML`).

**Fixed in-repo (commit `6418162`, `node --test` 138 / 3-skip):**
- **A2** the send-mark is now conditional (`status<>'sent'`, affected-row count), so a concurrent send is detected (409) rather than silently double-recorded. Residual double-email window documented (full fix is a `'sending'` status, which needs a migration); see **L-021**.
- **A3** the GET/POST outer catches no longer return `e.message` to the client (kept in `console.log`).
- **A8** a manually-typed reply over 50k chars is rejected before store/send.
- **A1** the `escalate_to_human` `question` description now forbids customer PII (name/contact have dedicated fields); input minimisation (GDPR Art.5(1)(c)); one-time L-002 cache re-warm at deploy; see **L-020**.
- **A6** the handoffs test fake now honours the id/kind/neq filters, pinning the kind-guard (a foreign id loads as 404); plus tests for the reply cap and the concurrent-send race.
- **L3** removed the stale `TODO(slice5e-2/approve-send)` comment in `admin.html`.

**Tracked as pre-launch (not coded this session, Ben's call):**
- **A4** the outbound customer email has no controller identification, privacy-notice link or real `Reply-To` (the `from` defaults to the Resend sandbox). Flag `TODO(prelaunch/email-identity)` in `handoffs.js`; checklist item added to CLAUDE.md; couples with the L-004 Resend-domain work.
- **A5** handoff-lead rows (`customer_id` null) hold contact/question/transcript PII with no retention or erasure. Flag `TODO(D-008/retention)` in `shared/messages.js`; folds into the deferred D-008 storage-limitation work.
- **Confirm out-of-repo:** `ADMIN_EMAILS` and a verified `CUSTOMER_FROM` are actually set in Netlify (otherwise the in-code fallbacks run); and the `ANTHROPIC_API_KEY` account is on Anthropic's no-train-on-API-inputs posture.

**Docs:** added **L-020** (input minimisation must be enforced, not asserted) and **L-021** (fail-closed vs never-double-send trade-off); A4 added to the CLAUDE.md hardening checklist; the two TODO flags planted. **MERGED + LIVE: PR #47, squash `7790d0e`** (review code + tests, L-020/L-021, the two TODO flags, the no-dash draft voice, and **A4-lite**: an ICC sign-off on the reply email via `buildHandoffEmail`). Netlify deploy verified (homepage 200, `/api/chat` 405, `/api/handoffs` 401); the live signature send was confirmed by Ben. `node --test` 140/3-skip.

**Live smoke (15 June): PASSED and delivered.** A real `out_of_scope` handoff was drafted by Claude and sent to a test inbox: Resend accepted it, and Ben confirmed the email arrived from `hello@intelligentclean.co.uk` (so the L-004 accepted-vs-delivered gap is closed for this path). The row went `status='sent'` with `sent_at` stamped; a `damage_risk` handoff correctly refused to draft (400, no model call, no email); both test rows were deleted from hosted Supabase (safe-smokes). The 5e-2 draft→send lifecycle is now verified end to end against real Anthropic + Resend + hosted Supabase.

**Voice fix (em dash).** The first smoke draft used an em dash. Cause: the draft generator had its own system prompt that never inherited the chat assistant's no-dash rule (`chat.js:73`). The prompt is now hoisted to `draftSystemPrompt()` with the same standard-British-English / no-dash rule and a pinning test; re-verified live (the same gift-vouchers draft now scans clean, zero dashes). The live chat assistant already had the rule, so only the draft surface needed it.

## This session — Slice 5d: admin auth via Supabase Auth (15 June 2026, branch `feat/slice5d-supabase-auth` stacked on 5e-2, committed `59f4050`, NOT merged)

**Outcome: 5d is built, tested and committed (`59f4050`, stacked on the 5e-2 branch); NOT merged, NOT preview-verified.** The admin dashboard moves off the shared `ADMIN_SECRET` Bearer onto **per-user Supabase Auth** (email + password) — the shared identity model the field app reuses (D-012). Full design in **D-022**.

**Ben did the Supabase setup this session:** public sign-ups **disabled**; the two operator users created (`mark_director@`, `ben@`); the publishable key + URL provided (now embedded in `admin.html` + `adminAuth.js`, public by design).

**What changed:**
- New `server/netlify/functions/adminAuth.js` — `requireAdmin(event)` verifies the session JWT (`auth.getUser` via a publishable-key client) and checks the `ADMIN_EMAILS` allowlist (default: the two operators). Fails closed (401 no-token/invalid, 403 not-allowlisted, 503 unconfigured). Injectable client → unit-tested with fakes, no network.
- `bookings.js` + `handoffs.js` — swap `safeEqual(ADMIN_SECRET)` for `requireAdmin(event)`. `safeEqual` kept as a tested utility. `ADMIN_SECRET` is now **unused by the app** (legacy; `.env.example` updated, removable from Netlify once 5d is live).
- `admin.html` — email + password sign-in via the Supabase Auth REST password grant; the `access_token` becomes the Bearer the functions verify. Logout clears both fields.
- `.env.example` — `ADMIN_EMAILS` + `SUPABASE_PUBLISHABLE_KEY` documented (both optional, code defaults); `ADMIN_SECRET` marked legacy.

**Verified:** `node --test` **134 pass / 3 skip** (new `test/admin-auth.test.js`; the handoffs handler auth tests updated to the new gate). **NOT done — before merge:** deploy-preview verification — sign in as **each** operator (bookings + handoffs load), a wrong password is rejected, and a non-allowlisted token gets 403. Hard swap (no dual-auth); rollback is a revert. **Needs in Netlify:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already set from 5a/5b); `ADMIN_EMAILS` optional (defaults cover Mark + Ben). **Stacking:** 5d sits on top of 5e-2 — merge 5e-2 first, or rebase 5d onto `main`.

## This session — Slice 5e-2: handoff draft → send reply lifecycle (15 June 2026, branch `feat/slice5e2-handoff-reply`, committed `ba85fc6`, NOT merged)

**Outcome: 5e-2 is built, tested and committed on its branch (`ba85fc6`); NOT merged, NOT yet preview-verified.** The read-only 5e handoff queue now has a lifecycle in the admin: Mark can have a reply **drafted** by Claude (soft reasons only), edit it, **send** it to the customer by email, or **mark it handled**. Customer-facing AI surface + outbound customer email, built to the AI-surface discipline.

**Decisions taken (Ben, this session):** `ALLOWED_ORIGINS` **deferred** to the domain cutover (decision-record, no code — see "things to watch"); admin login = **email + password** (for 5d); 5e-2 = the **full draft+send**, not status-triage.

**Load-bearing safety properties:**
- **Structural damage_risk gate (D-020).** New nullable columns `messages.handoff_reason / customer_contact / handoff_question / draft_reply` (migration `20260614110000`); `escalationToMessageDraft` populates the first three so the gate reads a real value, never a parsed label. `isDraftableReason()` allows **only** `out_of_scope` + `no_citable_source`; `damage_risk`, `customer_request` and any null/legacy reason are **never** auto-drafted (the model is not called). Mark may still type and send a reply himself.
- **Input minimisation.** The draft generator (`draftReplyForHandoff`, Sonnet) is sent **only** `handoff_question` — never the name/contact/transcript in `body` — grounded in `knowledgeBlock()` + bound by `guardrailsBlock()` (L-009), and may decline and defer to Mark.
- **Human gate + fail-closed send.** Draft and send are separate POST actions; the model never sends. Send requires a real email (`extractEmail` from `customer_contact`) and marks the row `sent` **only after** Resend accepts it (L-008/L-004). Every update is hard-guarded to `kind='human_handoff'`. Admin output inert (L-003): draft set via `.value`, never `innerHTML`.

**Files:** `supabase/migrations/20260614110000_messages_handoff_reply.sql` + pgTAP `supabase/tests/messages_handoff_reply_test.sql`; `shared/messages.js` (structured fields + `isDraftableReason`/`extractEmail`); `server/netlify/functions/handoffs.js` (GET extended + POST `draft`/`send`/`handle`); `admin.html`. Tests `test/messages.test.js` + `test/handoffs.test.js`. No new dependency.

**Verified:** `node --test` **127 pass / 3 skip** (the 3 skips are the guarded real-Supabase IT). Tests pin the two safety invariants (damage_risk never drafted with the model uncalled; a send failure never marks `sent`) and PII minimisation (only the question reaches the model). **NOT yet done (before merge):** (1) the independent code-review agent was **cut short by a session limit** — re-run it; (2) **deploy-preview verification** of the live AI draft + a real send to a test inbox + `damage_risk` showing no draft button (L-012 needs a fresh commit to force the preview); (3) the real-Supabase IT at home (`ICC_SUPABASE_IT=1`, `db reset` applies the new migration); (4) `supabase test db` for the new pgTAP file.

**Enablement ordering (when merging/enabling):** apply the `20260614110000` migration to **hosted BEFORE** the code deploys (the live 5a insert now writes the new columns; it is fail-open so nothing customer-facing breaks if the migration is late, but handoffs would not log until it lands). This checkout/main `.env` has `SUPABASE_DB_PASSWORD` and is `supabase link`ed, so `supabase db push` works directly (no Management-API workaround needed this time).

## This session — Slice 5b: bookings Blobs→Postgres cutover (branch `feat/slice5b-bookings-postgres`, built local, NOT merged)

**Outcome: "the big one" is merged (PR #38, squash `ef5398b`) AND ENABLED in production (14 June 2026).** Bookings now write to hosted Supabase `jobs`, availability derives from it on the 9..15 grid, and the admin reads both stores. Built across 7 commits on `feat/slice5b-bookings-postgres`. This is the only slice that changes live customer-facing booking behaviour, so it is additive + env-gated + a production no-op on merge, exactly like 5a, with one deliberate inversion (the write is fail-CLOSED). Full design + rationale in **DECISIONS.md D-021**.

**What it does (when `BOOKINGS_STORE=postgres`):** `confirm_booking` upserts a `customers` row (by email) + inserts a `jobs` row (`status='booked'`); `check_availability` derives from the committed jobs; double-booking is the DB exclusion constraint, not the read-then-write; the hardened 09:00–16:30 trading hours apply (folds in the former Slice 5c); and the admin dashboard reads **both** stores so legacy Blobs bookings stay visible. D-011's out-of-area flag is now derived + persisted server-side at booking.

**The three load-bearing properties (D-021):**
- **Fail-CLOSED write** (the inverse of 5a's fail-open): persist BEFORE any PDF/email; `23P01`→409, any other write failure→502 with **no email** (a "confirmed" email with no row is L-008). No Blobs fallback. The client already shows its phone fallback on error, so no `index.html` change.
- **Env-gated, merge-is-a-no-op:** one helper `bookingsStoreIsPostgres()` (`BOOKINGS_STORE === "postgres"`) drives store + grid + validation bounds together. Unset = byte-identical Blobs (the Blobs block is kept verbatim in the `else`). **Needs its own flag** because 5a already set `SUPABASE_*` in prod — bookings must not flip on at those creds.
- **Hours folded in under the same flag:** `validateBooking(b, {latestStartHour,latestEndHour,maxSlots})` defaults to Blobs (17/18/9), called with 15/16/7 under Postgres, so a too-late/too-long slot is a clean 400, never a DB `23514` at insert.

**Other calls (D-021):** no SQL RPC (two calls; a rare orphan customer is benign, deduped by unique email); no backfill (fresh start, admin merges both); ex-VAT/deposit numerics left **null** with `price_display` authoritative (`TODO(slice5x/structured-pricing)`); `jobs.postcode` made nullable (own migration); photos deferred (`TODO(slice5x/photos)` — Mark still gets the photo by email).

**Files:** new `server/netlify/functions/bookingsStore.js` (pure mappers + 3 async DB calls); `supabase/migrations/20260614100000_jobs_postcode_nullable.sql` + `supabase/tests/jobs_postcode_nullable_test.sql`; `chat.js` (flag, threaded `supabase`, parameterised `validateBooking`, fail-closed `handleBooking`, Postgres `checkAvailability`, new exports); `bookings.js` (dual-store read + pure `mergeBookings`); tests `test/bookings-store.test.js` (+ guarded real-Supabase IT), `test/bookings-chat.test.js`, `test/bookings-admin.test.js`. Docs: D-021, this note, CLAUDE.md infra table.

**Verified:** `node --test` **111 (108 pass / 3 skip** — the 3 skips are the guarded IT tests). Against **real local Supabase** (Docker, D-010): the `[integration]` test runs `insertBooking → availabilityFromJobs → fetchBookingsFromJobs` + an overlap-rejected case, **16/16** (`ICC_SUPABASE_IT=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local> node --test test/bookings-store.test.js`). `supabase test db` **18/18** (incl. the postcode-nullable check). Plus, against **hosted** Supabase (D-010, the 5a-style verification): the booking IT ran 16/16 (insert → availability → read-back → overlap-rejected → cleanup, no emails), and the live deployed `check_availability` returned the 9..15 Postgres grid.

**Enablement — DONE in production (14 June 2026):**
1. Postcode-nullable migration applied to hosted via the **Supabase Management API** (`POST /v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN`), because `db push`/`migration repair` need the DB password (not in `.env`). Verified by catalog read: `jobs.postcode is_nullable=YES`, both invariants intact. The `ALTER ... DROP NOT NULL` is idempotent (see L-019). **Hosted migration history reconciled (14 June):** once the DB password was added to `.env`, `supabase link` + `migration repair --status applied 20260614100000` recorded it, so `migration list` now shows all four migrations Local + Remote and a future `db push` is clean.
2. Blobs holds only 4 **past** test bookings (no real future bookings) — confirmed via the admin API.
3. `BOOKINGS_STORE=postgres` set in Netlify (POST `/env`, no `scopes`, L-018) and a production build triggered.
4. Live verified: deploy `ef5398b` ready, `check_availability` returns the 9..15 grid (Postgres active). **A full live `confirm_booking` was deliberately NOT run to avoid an operator email to Mark; the hosted write path is covered by the IT, and the first real booking is the true end-to-end (fail-closed if anything is off). Rollback = unset `BOOKINGS_STORE` + redeploy.**

**Deferred (anchors planted):** `TODO(slice5x/photos)` + `TODO(slice5x/structured-pricing)` in `bookingsStore.js`; `TODO(slice5d/supabase-auth)` (bookings.js) still open. The old `TODO(slice5b/...)` and `TODO(slice5c/hours)` anchors in `chat.js` are now implemented and removed.

## This session — Slice 5e: read-only handoff review (14 June 2026, branch `feat/slice5e-handoff-review`, #35, merged + live)

**Outcome: 5e (read-only) is merged to `main` (`512e997`, #35) and live in production.** The `human_handoff` rows that 5a writes are now visible to Mark in the admin dashboard, not only emailed.

- **New `server/netlify/functions/handoffs.js`** — admin-gated `GET /api/handoffs` returning `human_handoff` rows from Supabase (newest first) via the 5a service-role client, same Bearer gate as bookings (imports `safeEqual` from `bookings.js`; no duplication, `bookings.js` untouched). Exports `fetchHandoffs(supabase)`; returns `{handoffs, total, configured}` with `configured:false` when the Supabase env is unset (graceful degrade).
- **`netlify.toml`** — `/api/handoffs` redirect. **`admin.html`** — a Handoffs section (`handoffsGrid`) rendering each row through `esc()` (L-003, the existing `buildCard` pattern), wired into `login()` and Refresh (`loadBookings()` now also calls `loadHandoffs()`).
- **Read-only in v1.** The draft→approved→sent lifecycle is **5e-2** (`TODO(slice5e-2/approve-send)` in `admin.html`), and an answer is never auto-drafted for `damage_risk` (D-020).
- **Verified:** `node --test` 80 pass / 2 skip; the integration test inserts a `human_handoff` row into local Supabase and `fetchHandoffs` reads it back, then deletes it; the admin inline script parses (`node --check`); production `/api/handoffs` returns **401** without a token (redirect routes + function loads + auth-gates). **Manual check passed (14 June):** Ben confirmed the Handoffs section renders on the deployed admin (empty state, no rows yet). The live `ADMIN_SECRET` was reset this session and now matches the local `.env`.

## This session — Slice 5a: the escalation INSERT wired live (14 June 2026, branch `feat/slice5a-escalation-insert`)

**Outcome: Slice 5a is merged to `main` (PR #32, `b421138`) and deployed as a production no-op.** Live `/api/chat` returns 405, confirming the new `@supabase/supabase-js` require bundles; the `human_handoff` INSERT was dormant until enablement. **Now ENABLED in production (14 June):** the 4e migrations were pushed to hosted, `SUPABASE_*` were set in Netlify, and a live damage-risk escalation against production wrote a real `human_handoff` row to hosted Supabase (verified, then deleted). Real escalations now log a row AND email Mark. This is the **first live wiring of the hosted Supabase backend** and the lowest-risk sub-slice of the Slice 5 cutover. The `escalate_to_human` handoff (4b/4e) now ALSO writes a draft `human_handoff` row to the Supabase `messages` table, in addition to emailing Mark.

**Design — additive, fail-open, env-gated (so the merge is a production no-op until enabled):**
- New `server/netlify/functions/supabaseClient.js` — `getSupabaseAdmin()` returns a singleton service-role client when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are both set, else **null** (the fail-open signal).
- `chat.js` creates the client once per request and threads it through the existing `onTool` closure → `handleTool` → `handleEscalation` (a 4th optional param, so the 4b/4d tests pass unchanged). In `handleEscalation`, after the email, it builds `escalationToMessageDraft(input, context)` (the 4e pure builder) and `supabase.from("messages").insert(draft)` inside try/catch — a Supabase outage, RLS/constraint reject, or missing creds is logged and swallowed, never blocking the customer reply. The email stays the guaranteed path (L-004). `runAssistantTurn` is untouched.
- `@supabase/supabase-js` added to the **root** `package.json` (like `@netlify/blobs`/`pdfkit`), **not** the deferred npm-workspaces restructure — that does not belong on a live-behaviour slice (D-014 addendum stays deferred).

**Verified against REAL local Supabase (Docker), not just fakes.** `node --test` = **75 pass + 1 skip** (the integration test self-skips without `ICC_SUPABASE_IT=1`). With the local stack up (`supabase start` + `db reset` applied all migrations incl. the two 4e ones) and `ICC_SUPABASE_IT=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local secret>`, the guarded integration test inserted a real `human_handoff` row with a **null `customer_id`** (the `messages_customer_or_handoff` constraint permitted it), read it back, and deleted it (safe-smokes). 8/8 on that file. The local stack is left running (`npx supabase stop` to shut it down).

**Hosted Supabase state (checked this session via the CLI, L-013):** the hosted ICC project `icc-platform` (ref `qzcfgpfvzpynnjgriqqn`, ICC org `byanmzeomiwnkvhtmsus`, London) exists and the account-wide CLI sees it. It is **not linked in this checkout and there is no local `.env`**, so the hosted instance was not written to. The two 13 June 4e migrations are **probably not pushed to hosted yet** (dated after the 10 June SQL-Editor load, verified locally only) — confirm before enabling.

**To ENABLE in production (the sign-off moment, deliberately separate from the merge):**
1. Push the 4e migrations to hosted: `supabase link --project-ref qzcfgpfvzpynnjgriqqn` then `supabase db push` (or apply the two `20260613*` migrations via the SQL Editor + `migration repair`).
2. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Netlify (Site settings → Environment variables; service-role key from the dashboard → Settings → API). Use a full-object `PUT` scoped to `?site_id=` if the Personal-account API 403s on a shared edit (L-015 aside).
3. Trigger an escalation on a deploy preview and confirm a `human_handoff` row lands in the hosted `messages` table AND the operator email still **Delivers**.

**Env setup this session.** Created `.env` in the **main checkout** (`C:\Users\bengr\OneDrive\Desktop\icc-site\.env`, git-ignored) with placeholders + where-to-get-each-key notes; `.env.example` now documents `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Ben to fill the real secrets.

**Deferred (anchors planted):** `TODO(slice5b/bookings-postgres)` (chat.js booking write), `TODO(slice5c/hours)` (chat.js availability grid), `TODO(slice5d/supabase-auth)` (bookings.js admin auth), `TODO(slice5e/handoff-ui)` (admin.html). 5b is the genuinely risky one (live bookings) and wants its own session. Minor doc follow-up: the CLAUDE.md infra table still says Supabase "not yet stood up" (stale since 10 June) — refresh when convenient. *(Update: 5b + 5c are now BUILT — see "This session — Slice 5b" above; the `TODO(slice5b/...)`/`TODO(slice5c/hours)` anchors are implemented and removed, and the CLAUDE.md infra table is refreshed.)*

## This session — D-011 boundary + Slice 4e foundation (13 June 2026, #27/#28, merged)

Continuation on the home machine (Supabase verifiable here, unlike the work machine).

**D-011 service-area boundary + deposit base (#27, `9979ba9`, merged + live-verified).** Mark confirmed the boundary: core = Cheltenham, Gloucester and Winchcombe plus ~5 miles around each; everywhere else gets the £15 + VAT surcharge. Encoded in `shared/config/serviceArea.js`: fully-core GL50–53 / GL1–4 districts, and Winchcombe at the **GL54 5 sector**, so the far Cotswolds (Bourton GL54 2, Stow GL54 1, Northleach GL54 3) now correctly carry the surcharge. This fixed a real under-charging bug: the old whole-GL54-core list quoted those jobs with no travel charge. `isOutOfArea` checks district then sector; the live `serviceAreaBlock()` prompt now states the 5-mile rule and names the far-GL54 trap. Deposit base confirmed as 10% of the inc-VAT total (comment-only; the maths already did this). **Verified live on production** via a direct `/api/chat` probe: Bourton gets the surcharge, Winchcombe does not. `node --test` 63/63.

**Slice 4e foundation (#28, `ca47c43`, merged, local-first, no live change).** Escalations become `human_handoff` rows in the `messages` table (D-020). Two migrations: add the `human_handoff` enum value; make `messages.customer_id` nullable with a check that only a handoff may omit the customer (the constraint compares `kind::text`, so it never depends on the new enum value being committed in the same transaction). `shared/messages.js` `escalationToMessageDraft()` builds the draft row (reason, contact, question, transcript; no AI-drafted answer, and never for `damage_risk`). `chat.js` is untouched — it still emails Mark and does not touch Supabase. Verified at home: `node --test` 68/68, `supabase db reset` clean, `supabase test db` 14/14 pgTAP. The live wiring (service-role `INSERT`) + admin approve/send UI are **Slice 5**; a `TODO(slice5/D-020)` flag marks the spot in `handleEscalation`.

**Astro price cards → single source (D-006).** Wired the home (`index.astro`) and services (`services.astro`) price cards to render the £ figures from `shared/config/pricing.js` via `priceOf(code)`, so they no longer drift from the assistant/server quote (this closes the "figures copied verbatim from chat.js" note that was in `services.astro`). The hand-written labels (m², commas) stay; only the figures are wired. `astro.config.mjs` gained `vite.build.commonjsOptions.include` for `shared/config` so Rollup transforms the CJS source (project `.js` is treated as ESM otherwise, the "default is not exported" gotcha; see L-017). Verified by a clean 22-page `npm run build --prefix site`; the built HTML shows the correct figures (75/95/115/… and the £15 surcharge). The dormant Astro site is still **not cut over** (D-013/privacy gates unchanged).

## This session — vision model → Opus 4.8 (12 June 2026, #25, merged + live)

After Slice 4d, bumped the **vision** model in `shared/config/models.js` from `claude-opus-4-5` to `claude-opus-4-8` (one line), and recorded the standing policy as a **D-007 addendum**: image analysis always uses the **current best Opus**. Why it is worth it: high-resolution image understanding arrived with Opus 4.7 and is exactly what photo-based carpet assessment needs; the Opus tier is flat-priced ($5/$25 per MTok across 4.5–4.8), so "always the best Opus" is cost-neutral within the tier. The request shape in `chat.js` uses none of the params that 400 on 4.7/4.8 (no `temperature`/`top_p`/`top_k`, no `budget_tokens`, no prefills), so it was a clean swap. **Mechanism is a deliberate pin, not auto-detection** — a silent swap of the model giving damage-risk advice is the D-019 failure mode, so each bump is one line + a deploy-preview photo check. Text stays on Sonnet 4.6 (already current). Watch item (noted in `models.js` + D-007): Opus 4.8 defaults `effort=high` on the API; if a photo turn's latency/cost creeps up, set `effort` lower on the vision call. **Preview-verified by Ben (photo assessment reads well), squash-merged as `afad2fb`.** While here, the 4d `web_search_20250305` version rationale was reworded (chat.js comment, DECISIONS 4d addendum, the websearch test name) to rest on the durable "no dynamic-filtering latency in a live chat" reason rather than "Opus 4.5 doesn't support 20260209", so it stays correct now vision is 4.8.

## This session — Slice 4d gated/attributed web_search (12 June 2026, #24, merged + live)

**Outcome: Slice 4d is merged to `main` and live in production (`9f6f636`), preview-verified by Ben (`node --test` 62/62, up from 44).** This is D-019's low-stakes lane: the Anthropic-hosted `web_search` server tool, triple-gated, with attributed external citations. **Preview verification (all passed):** web search enabled at org level in the Anthropic Console; a KB question answered from the knowledge base with the "Based on ICC's expert guidance" caption; a low-stakes local question ("where can I dispose of an old carpet") searched and showed the "Looked up on the web" links; a damage-risk question escalated and did NOT search; an ordinary pricing question answered normally. Production confirmed live (homepage 200, the new `renderCitations` "Looked up on the web" code present in the deployed `index.html`).

**What changed:**
- **`server/netlify/functions/chat.js`.** New module constant `WEB_SEARCH_TOOL` — version **`web_search_20250305`** (deliberately NOT the newer `web_search_20260209`: its dynamic-filtering code-execution rounds add customer-visible latency our capped low-stakes lookups don't need — the load-bearing reason; see the D-019 addendum), `max_uses: 3` (spend cap; $10/1,000 searches, worst case bounded by the 30 msgs/hr/IP limit), `user_location` Cheltenham/Gloucestershire/GB. New `TOOLS = [ESCALATION_TOOL, WEB_SEARCH_TOOL]` constant keeps the tools array byte-stable (one-time L-002 cache re-warm at deploy, like 4b). A new **WEB SEARCH (RARE, LOW-STAKES ONLY)** prompt block (after WHEN TO HAND OVER; the L-016 principle — gating rules bind only from the prompt) confines searching to practical, no-property-risk gaps (e.g. local carpet disposal), forbids it for cleaning/treatment/aftercare/drying/fibre questions (KB-or-escalate; damage-risk escalates FIRST), and forbids searching to dodge an escalation. `runAssistantTurn` now handles **`stop_reason: "pause_turn"`** (append the assistant content verbatim, re-call, no tool_result — the API resumes its server-tool loop), sharing the existing `maxRounds` bound. `withSingleTextBlock` inserts a `\n\n` where a dropped non-text block sat, so "I'll look that up." never glues onto the answer (deliberate contract change; the 4b test in `test/escalation.test.js` updated to pin the new contract). `collectCitations` now also maps `web_search_result_location` citations to `{id:null, title, url}` (http/https-only server-side, deduped by url, hostname fallback for a missing title); KB entries keep the exact 4c `{id,title}` shape. `callModel` logs `usage.server_tool_use.web_search_requests` whenever a turn searched (cost visibility in the function log).
- **`index.html`.** `renderCitations` now renders two lanes in the muted provenance caption: KB labels exactly as before, plus a "Looked up on the web:" line of real external links for url-bearing entries — `createElement("a")` + `setAttribute`, href re-checked against `^https?://`, `target="_blank"` + `rel="noopener noreferrer"`, never `innerHTML` (L-003). This delivers the attributed-external-links half of the 11 June D-019 citations decision (the KB-side guide links still wait for the Phase 1 cutover, `TODO(citation-links)`).
- **Tests.** New `test/websearch.test.js` (18 tests): tool shape (version/cap/location pinned), TOOLS order, the prompt gating strings (never-for-treatment, damage-risk-first, never-to-dodge-escalation, block sits after the hand-over block), `pause_turn` continuation (verbatim assistant append, no tool_result, bounded at maxRounds, coexists with a custom tool round), the text-collapse separator rules, and web-citation mapping (shape, dedupe, `javascript:`/`ftp:` urls dropped, hostname fallback, KB+web side-by-side). `node --test` **62/62**.
- **Docs.** D-019 addendum (the 4d build + the 20250305-version decision + ops notes); CLAUDE.md chat-flow deep-dive updated.

**Ops note carried forward:** web search must stay **enabled at organisation level** in the Anthropic Console (Settings → Privacy) for the account behind `ANTHROPIC_API_KEY`, or the tool errors. It was enabled this session. Remaining 4d-adjacent follow-up: **4e** moves the escalation handoff (and, with it, a place for a draft→approve→send web/answer review) to the Supabase `messages` table.

## This session — Slice 4c Citations (12 June 2026)

**Outcome: Slice 4c (Citations, #20) is merged to `main` and live (`89f9ff9`), preview-verified by Ben (`node --test` 43/43). A follow-on chat-UX pass (#21) is also merged + live — see the "Slice 4c follow-on" note at the end of this section.** The D-019 Citations grounding. Approach chosen by Ben at the fork: **full restructure**, not additive (recorded in the D-019 addendum in DECISIONS.md).

**What changed:**
- **`shared/config/knowledge.js` (the L-016 split).** The factual `knowledgeSections` now feed `knowledgeDocument()` — a Claude **citeable custom-content document**, one `{type:"text"}` content block per section (so a citation's block index maps straight back to the section). The **L-009 claim rules** were lifted out of the section prose into a new `guardrailsBlock()` that stays in the **system prompt** as absolute, override-everything instructions (machine is the EMV 401; never "WoolSafe approved"; figures are the manufacturer's own; no decibel figure; no "exothermic draws dirt"; no "kills 99.9%"), plus the grounding/escalation directive. The reason this is a *split and not a move* is **L-016**: a rule in a citeable document is quotable but not binding — only a system instruction constrains the model. `knowledgeBlock()` is kept (for the Phase 1 site/tests) but is **no longer in the assistant prompt**.
- **`server/netlify/functions/chat.js`.** System prompt now renders `guardrailsBlock()` where `knowledgeBlock()` used to be (**16,035 → 12,389 chars**, no duplication). `withKnowledgeDocument(messages)` prepends the citeable document to the **first user turn** on every `callModel` call (so `messages[0]` stays byte-stable across the 4b tool round → L-002 cache holds; one-time re-warm like 4b). `collectCitations(data)` resolves each cited content-block index back to its KB section and returns a deduped `{id,title}` list; the handler returns that alongside the single collapsed text block (`withSingleTextBlock` unchanged → L-014 intact). Both new fns exported for tests.
- **`index.html`.** `appendMessage(role,text,citations)` + new `renderCitations(bub,citations)` draw an inert "Based on ICC's expert guidance: …" footer built from DOM text nodes only (never `innerHTML` → L-003). `sendMessage` reads `d.citations` and passes it on the bot replies. **Plain labels for now**; a `TODO(citation-links)` marks where care-guide links go at the Phase 1 cutover (the guide URLs don't exist until the site is cut over).
- **Tests.** `test/knowledge.test.js` rewritten for the restructure (guardrails in the prompt, facts NOT; document round-trips one block per section; every L-009 rule present in `guardrailsBlock()` and absent from the citeable facts). New `test/citations.test.js` drives `withKnowledgeDocument` (string + image first turns, no mutation, empty-list no-op) and `collectCitations` (index→section mapping, dedupe, empty, document-title fallback). `escalation.test.js` unchanged and still green. **`node --test` 43/43.**
- **Docs.** D-019 addendum (the full-restructure decision + verification boundary); **L-016** (guardrail-in-prompt-not-document, + the doc-on-first-turn caching note); CLAUDE.md rule #5 and the chat-flow deep-dive updated.

**Verification status — IMPORTANT.** Unit-verified only (43/43 + assembled-prompt/document-shape inspection). The **live** behaviour was *not* verified: there is no `ANTHROPIC_API_KEY` on the build machine (the local `.env` holds only the Netlify creds), so I could not make a real Anthropic call, and the static preview has no `/api/chat` backend. **Before merge, verify on a Netlify deploy preview** (L-012 needs a fresh commit to force the preview): (1) the request shape (document + `citations.enabled` + `tools:[ESCALATION_TOOL]`) is accepted; (2) a knowledge question (e.g. "is your method safe for a wool rug?") comes back **with** the source-label footer; (3) the L-014 single-text contract still holds (ordinary replies + the `BOOKING_READY` flow are intact); (4) escalation (4b) still fires. Then squash-merge as usual.

**Slice 4c follow-on — chat-UX (PR #21, merged + live; preview-verified).** Two fixes Ben caught while testing 4c. **Citation restyle (landed on #20):** the cited sections were bold and read as dead links (the `/guides/` pages don't exist until the Phase 1 cutover), so they now render as a muted, non-bold **provenance caption** (`renderCitations`); real links + a "Read more" land at the cutover (`TODO(citation-links)`). **Goodbye-close (#21):** the inactivity timer fired "Still there?" every 3 min even after the customer had said goodbye — there was no end-of-conversation detection. The model now emits a `CONVERSATION_END` marker on a clear closing signal (strict prompt instruction); the client strips it, cancels the inactivity timer, and ends the session (a `conversationClosed` guard stops the trailing re-enable in `sendMessage`). **Intro-dedup (#21):** the welcome bubble already greets by name, so the prompt no longer tells the model to reintroduce itself (it was saying "Hi, I'm X" twice). #21 branched off `main` and was merged into `main`-with-4c with a trivial `sendMessage` merge-resolution (citations payload + `CONVERSATION_END` handling now coexist). **Chat-log persistence on close is deferred to the Phase 2 `messages` table** (Slice 4e/5; `TODO` in `endConversation()`) — full-transcript storage belongs there with consent + retention (D-008), and escalations already email Mark. `node --test` 43/43.

**Slice 4c follow-on 2 — DIY/rental-machine advice (PR #23, merged + live; Mark feedback).** Mark flagged that a large share of corrective jobs are DIY/rental-machine damage (including machines hired from supermarkets/DIY stores), **but the brand must never be named**. Changes: the `diy_vs_professional` KB section broadened from a generic "hire machines" to explicitly cover home DIY *and* rental/hire machines, with ICC's corrective experience stated qualitatively (no fabricated %); a new "PRIOR DIY OR RENTED-MACHINE CLEANING" prompt block makes the assistant **proactively ask** whether a DIY/rented machine has been used (it changes the advice + expectations), refer to them only generically, and — Mark's **option 2** on cost — give the normal estimate plus a **soft, case-by-case** note that correcting heavy over-wetting/residue may nudge the final price, **never inventing a figure** (no `pricing.js` change; Mark confirms on the day). `test/knowledge.test.js` gained a guard that the KB covers rented/hire machines and **never names the brand**. `node --test` 44/44.

**Remaining Slice 4:** **4d** gated/attributed `web_search` (low-stakes only, never damage-risk; renders as attributed external citations — `collectCitations` already falls back to `document_title` for non-KB sources); **4e** move the escalation handoff to the Supabase `messages` table (draft→approve→send, couples with the Slice 5 cutover). Site-side of D-006 (feed the Astro guides + the citation **links** from `knowledge.js`) couples with the Phase 1 cutover.

## This session — Slice 4a + 4b (11 June 2026)

**Outcome: 4a (#16) and 4b (#17) are merged to `main` and live in production, and a silent operator-email bug found during 4b's verification was fixed.** Started **Slice 4 (backend AI / D-019)**, the D-019 grounding/escalation work, as two stacked PRs off `main`, both green on `node --test`.

**Merge + preview verification.** #16 (4a) merged first (byte-identical, safe). #17 (4b) is a live-path change, so it was verified on a Netlify **deploy preview** before merge — L-012 held, a fresh commit was needed to force the preview. A damage-risk question ("antique silk rug, what chemical should I scrub it with?") made the assistant **escalate**: it handed to Mark, refused the damaging advice, and asked for contact details — while an ordinary pricing question still returned a normal **single-text-block** reply (the L-014 `withSingleTextBlock` contract holds). #17 was then **squash-merged** (dropping the two throwaway preview-trigger commits); production serves `466e397`, `node --test` 34/34, prod `/api/chat` GET → 405.

**Operator-email bug found + fixed (L-015, D-018 addendum).** The escalation email reached Resend but showed **Suppressed**, not Delivered: `OPERATOR_EMAIL` was `mark@intelligentclean.co.uk`, a mailbox that **never existed** — Mark's real address is `mark_director@intelligentclean.co.uk`. The 10 June TEST-booking operator email to `mark@` had hard-bounced ("recipient not found") and Resend account-level-**suppressed** it, silently dropping every operator email since (booking notifications included; only the *customer* leg had ever been checked). Fix: corrected `OPERATOR_EMAIL` to `mark_director@` in Netlify (a full-object `PUT` scoped to `?site_id=` — the site is on a *Personal* account, so shared/`PATCH` edits 403'd), removed `mark@` from Resend's suppression list, re-ran the escalation on a fresh preview → **Delivered**. Then merged #17.

**4a — KB single source (PR #16, merged + live).** New `shared/config/knowledge.js` holds the carpet-science / method / products / stain knowledge as structured section objects (`id`/`title`/`text`) with `knowledgeBlock()` / `timeEstimatesBlock()` renderers + an L-009 `guardrails` object, aligned to `docs/TEXATHERM_KNOWLEDGE_BRIEF.md`. `chat.js` generates those two prompt sections from it (the DEPOSIT/RE-CLEAN policy lines stay inline) and now exports `STATIC_SYSTEM_PROMPT` for the test. **Byte-identical proof:** the assembled prompt is 16035 chars before *and* after, verified against `git HEAD` — the L-002 cache prefix is unchanged, so **nothing live changed**. Ends the triple-drift (prompt / brief / Astro guides) that caused L-009. `test/knowledge.test.js` pins parity + the L-009 guardrails (EMV 401 present, EMV 409 absent, no decibel figure, WoolSafe/exothermic prohibitions retained). `node --test` 24/24.

**4b — `escalate_to_human` tool + server-side tool loop (PR #17, merged + live; preview-verified).** The D-019 safety exit. A module-constant `ESCALATION_TOOL` whose description names *when* to call it (out-of-KB, damage-risk, uncitable, customer-request; damage-risk escalates **first**, never a guess). `runAssistantTurn` runs a bounded loop (resolve `tool_use` → `tool_result` → re-call, capped). `withSingleTextBlock` collapses the final message to one text block so the browser's `content[0].text` + `BOOKING_READY` flow stay intact (see L-014). `handleEscalation`/`sendEscalationEmail` log the lead and email Mark (escHtml-safe, fail-open per L-004). A "WHEN TO HAND OVER" prompt block reinforces the triggers. **This changed the live chat call** (`tools:[ESCALATION_TOOL]` + the prompt block → a one-time L-002 cache re-warm); the live behaviour (model actually escalating + email delivery) was verified on a **deploy preview** (L-012/L-004), not from unit tests — see the merge + verification note at the top of this section. `test/escalation.test.js` drives the loop with a faked model. `node --test` 34/34.

**Decisions locked (DECISIONS.md D-019 addendum):** **no Haiku** anywhere in the AI path (the dropped optional verify pass — grounding + the escalate tool + a bounded remit are the guards); **Citations shown to customers as safe links** (KB→ICC guide pages once the Phase 1 site is live, web-search→attributed external; L-003-safe renderer in 4c); **all platform AI stays on the Anthropic API** — a £20 Claude.ai subscription authenticates a human in the app and cannot be called from server code (an optional Pro sub is only Mark's personal assistant).

**Remaining Slice 4:** **4c** Citations grounding + the safe citation-link renderer in `index.html`; **4d** gated/attributed `web_search` (low-stakes only, never damage-risk); **4e** move the escalation handoff to the Supabase `messages` table (draft→approve→send) — couples with the Slice 5 Postgres cutover. The site-side of D-006 (feed the Astro guides from `knowledge.js`) couples with the Phase 1 cutover.

## Earlier on 11 June 2026 — PRs #11–#15 (predecessor session)

**Astro site contact sweep (this branch `chore/contact-email-and-handover`, follow-up to PR #11).** Swept the two remaining stale strings across the dormant Phase 1 site and config: `talktoregency@gmail.com` → `hello@intelligentclean.co.uk` and `intelligentcarpetcleaning.co.uk` → `intelligentclean.co.uk`. Files: `site/astro.config.mjs` (`site`), `site/public/robots.txt` (sitemap URL), `site/src/layouts/BaseLayout.astro` (LocalBusiness JSON-LD email + `siteUrl` fallback), `site/src/pages/{contact,privacy,book}.astro` (visible email + the three in-chat fallbacks), and the `siteUrl` fallbacks in `pages/areas/index`, `pages/areas/[slug]`, `pages/guides/[slug]`. Also **`.env.example`** (the `ALLOWED_ORIGINS` example domain; `OPERATOR_EMAIL` → `mark@intelligentclean.co.uk` — operator address per D-018, not the customer-facing `hello@`) and the **CLAUDE.md** bus-factor client-contact line (→ `hello@`, Ben's call). **Verified by a real `npm run build --prefix site`:** 22 pages built clean, new domain in the sitemap + canonicals, `hello@` in the structured data, zero stale strings in `dist/`. No live behaviour changed — the Astro site is dormant and Netlify still publishes the repo root in Phase 0. Only intentional history mentions remain (DECISIONS.md D-013, the prior-session notes in this file).

**Merged the contact sweep (PR #11) to `main` and verified the deploy.** With sign-off, merged + deleted the branch; `main` is at the PR #11 merge commit. WebFetch of the live Netlify site confirms `index.html` now serves `hello@intelligentclean.co.uk` and the old Gmail is gone — production deploy good.

**Phase 0 hardening — deposit guard (PR #12, merged + live).** `chat.js` rendered `Deposit due: undefined` when a booking omitted the optional `deposit`. Added an exported, unit-tested `depositLabel()` and normalise `booking.deposit` once after validation, so the stored record, calendar link, both emails and the PDF all show a clean value (fallback "To be confirmed"). `node --test` 10/10. Remaining ops item: set `ALLOWED_ORIGINS` in Netlify (L-001, still open — needs the Netlify dashboard). The leftover test booking was **deleted this session** (see the cleanup-script note below).

**Phase 2 Slice 3 — `/api/v1/quote` server-side pricing foundation (PR #13, merged + live).** The stateless quote endpoint the website + field app both price from (D-003/D-007/D-011/D-012), alongside the live `/api/chat` — no live change, no DB/Blobs/AI/secrets. Added: `serviceArea.isOutOfArea(postcode)` (outward-code parse vs `core_postcodes`); `pricing.quote(lines,{outOfArea})` + `vat_rate` (itemised ex-VAT subtotal, flat £15 surcharge, 20% VAT, inc-VAT total, 10% deposit on the inc-VAT total); `shared/contract/` versioned TS contract + README (typechecks under the site's strict `tsc`); `server/netlify/functions/v1-quote.js` (public CORS, no rate limit per L-006); the `netlify.toml` redirect; and `test/pricing.test.js` (9 cases). `node --test` **19/19** plus a direct handler smoke test (GL5 wider-area +£15 → £372 inc VAT / £37.20 deposit; GL51 core → £90/£9; unknown code → 400; OPTIONS → 204; GET → 405). **Two assumptions to confirm with Mark** (flagged in code): the deposit base is the **inc-VAT** total, and the `core_postcodes` boundary is still **provisional** (D-011). **Deferred to the Slice 5 cutover:** Postgres-backed `/api/v1/bookings` + `availability` and Supabase Auth/admin RLS (they write/duplicate live behaviour).

**Cleanup script + test booking deleted (PR #14, open).** Wrote `scripts/delete-booking.js` — a report-by-default Blobs utility mirroring `chat.js`'s keys (`<date>`→booked hours, `booking-<id>`→record, `booking-index`). Ben ran it with his Netlify creds and **deleted the leftover TEST booking** (`id=1781101982626`, slot 2026-06-24 10:00) — slot freed, index 5→4. **PR #14 left unmerged on purpose:** in Phase 0 Netlify publishes the repo root, so merging would expose `/scripts/...` publicly (harmless but untidy) — merge later if wanted, or just run from the branch. A git-ignored local `.env` now holds `NETLIFY_SITE_ID` + `NETLIFY_TOKEN` for re-runs.

**Payments direction — D-004 addendum (PR #15).** Mark is considering **Revolut Pro** (sole-trader account). Researched + recorded: it's compatible with the Stripe plan (the card processor and the receiving bank account are separate layers — Stripe pays out to Revolut). Two Phase-3 options — **Stripe** (default, best API, ~1.5%+20p, pays out to Revolut) vs **Revolut Merchant API** (~0.8%+2p, next-day settlement into Revolut, younger API). **Design rule locked:** the processor sits behind our own server-side API (D-003), so the choice is a server-side swap, not a one-way door — deferred to Phase 3.

**AI safety direction — D-019 (PR #15).** Agreed the assistant's grounding / anti-hallucination strategy (concern: aftercare advice that could damage carpets). A grounded assistant with a **two-lane source hierarchy** and a **human-escalation exit**, defence-in-depth: **Citations** to ground answers in the vetted KB (D-006); the hosted **web-search** tool as an *attributed* fallback for low-stakes gaps only; a custom **`escalate_to_human`** tool for out-of-KB / damage-risk / uncitable questions (escalate-*first* for damage-risk — never web). Lands as Phase 1 knowledge consolidation + Slice 4 (the `messages` draft→approve→send loop is the handoff). Full record in D-019.

## Previous session (10 June 2026)

**Hosted Supabase stood up (realises the D-009 addendum).** Created the dedicated **Intelligent Carpet Cleaning** org (Free) + **`icc-platform`** project (ref `qzcfgpfvzpynnjgriqqn`, org `byanmzeomiwnkvhtmsus`, London/eu-west-2), owned by the build-lead account for now (transfers to ICC before the Slice 5 cutover). Loaded the Slice 2 schema via the SQL Editor and verified it (6 tables, RLS on all 6, the `jobs_no_double_booking` exclusion constraint); `supabase migration repair` reconciled history so a future `db push` is clean. **Linked the Supabase CLI** to the repo. Key lesson: **use the Supabase CLI, not the MCP, for ICC** — the MCP connector's OAuth is single-org (scoped to `randommonicle's Org`) and cannot see the ICC org; the CLI's token is account-wide (L-013).

**Email stack live on `intelligentclean.co.uk` (closes L-004 sending-domain).**
- **Resend** verified (DKIM `resend._domainkey`, SPF + bounce MX on the `send` subdomain). One clean DMARC (`_dmarc`, `p=none`) after deleting a GoDaddy-default `p=quarantine` duplicate. "Enable Receiving" left OFF (inbound = Workspace).
- **Google Workspace** (Business Starter): `ben@` super-admin (recovery → Ben's personal Gmail), `mark@` owner mailbox (Ben administers; Mark is non-technical). Domain verified; Gmail MX `smtp.google.com`; root SPF; 2048-bit DKIM (`google._domainkey`, verified byte-exact) authenticated. Aliases `hello@`/`info@`/`bookings@` on `mark@`.
- **App From-addresses** set in Netlify + redeployed: `OPERATOR_EMAIL=mark@` *[corrected 11 June → `mark_director@`; `mark@` never existed + was Resend-suppressed, L-015]*, `OPERATOR_FROM="ICC Bookings <bookings@…>"`, `CUSTOMER_FROM="Intelligent Carpet Cleaning <hello@…>"`. **Verified end-to-end** via a live `confirm_booking` test — confirmation delivered from `hello@` to a real inbox *(only the customer leg; the operator leg to `mark@` had silently bounced + suppressed — caught 11 June, L-015)*. DNS is at 123reg/GoDaddy (nameservers `*.domaincontrol.com`); every record verified live with `Resolve-DnsName`.

**Live-app fix (this branch `chore/contact-email-and-handover`).** `chat.js`: stale `talktoregency@gmail.com` → `hello@intelligentclean.co.uk` (system prompt, confirmation email, PDF job card) and fallback origins `intelligentcarpetcleaning.co.uk` → `intelligentclean.co.uk`. `node --test` 8/8.

## Previous session (7 June 2026)

- **Merged the Phase 2 stack `#6 → #7 → #8` into `main`, in order, with sign-off**, and verified each slice live. Production serves `09a5417` (`ready`, 19s build), `node --test` 8/8 on merged `main`.
- **The predicted Node 24 merge conflict did not materialise.** Each slice branch was cut before PR #9 (Node 24), but the edits don't overlap, so git's 3-way merge kept `NODE_VERSION=24`, `engines: 24`, `.nvmrc 24`, the `server/netlify/functions` path, and the redirects/headers with no conflict. Confirmed by inspecting the merged tree before each merge.
- **Verification method:** #6 on its Netlify **deploy preview** (`/api/chat`→200, `/api/bookings`→401, bad-JSON→400). #7 and #8 **on production after merge** — Netlify would not build previews for the retargeted/reopened stacked PRs without a fresh commit (new **L-012**). Safe because atomic deploys never swap in a failed build, `node --test` proves module loading, and an immediate `/api/*` probe confirms the live functions. The `supabase` devDep did not break the build.
- **`chat.js` furniture surcharge is now config-driven** (`pricing.priceOf("furniture_moving")` → £30) in the confirmation email + PDF — behaviour-preserving (Slice 2 / evening-review carry-over).
- **Caught and fixed a stale handover at the start:** `main`'s NEXT_SESSION was two sessions behind (pre-dated PR #5/#9 and all of Phase 2); merging Slice 2 brought the 5 June version in, and this 7 June note supersedes it.
- **Hosting decision (amends D-009):** ICC gets a **dedicated Supabase organisation** (Free for build/staging, separate from the build-lead's personal `randommonicle's Org`), not a project inside it. Mark gets member access; ownership/billing transfer to ICC later; **no real customer PII on any personal-org instance** (see DECISIONS D-009 addendum, 7 June). **Pending Ben action:** create the ICC org + `icc-platform` project (London / eu-west-2, Free), then we `supabase link` + `db push` the Slice 2 schema to it and build Slice 3 against it. This brings the hosted instance forward from Slice 5; local-first is no longer the only path. **Slice 3 planning is deliberately deferred until the hosted project exists** (Ben's call, 7 June), so it's planned against the real instance rather than speculatively.
- **Domain chosen (resolves D-013):** `intelligentclean.co.uk`, registered with 123reg (1 yr), DNS propagating (123reg quoted 24–48h). Unblocks, pre-promotion and when convenient: set `ALLOWED_ORIGINS` in Netlify (`https://intelligentclean.co.uk,https://www.intelligentclean.co.uk`, closes L-001), fix the now-stale `intelligentcarpetcleaning.co.uk` fallback origins in `chat.js`, lock `astro.config.mjs` `site` (sitemap/canonicals, cutover), verify a Resend sending domain (L-004), and point 123reg DNS at Netlify at go-live. None of it blocks the Supabase build.

## Previous sessions (5 June 2026)

**Daytime:**
- Synced `main` (was 28 behind), read the doc set, approved a sliced Phase 2 plan. Locked: backend folder = **`server/`**; **local-first Supabase** (D-009); backend-AI scope = all of it incl. invoice interpretation + AI chasing.
- **Slice 0 (#6)** — `git mv` functions to `server/netlify/functions/` (history kept); `netlify.toml` functions path; test require paths repointed + root `"test"` script; `app/` placeholder; docs. Deferred (D-014 addendum): npm workspaces + `server/package.json`, and the build-scope `ignore`. `node --test` 8/8.
- **Slice 1 (#7)** — extracted model names + pricing table + service-area/surcharge into `shared/config/*.js` (CommonJS, so the CJS functions + `node --test` can load them). `chat.js` imports the model and **generates** the PRICING + SERVICE AREA prompt blocks from config. **Parity verified: the assembled prompt is byte-identical**, so the prompt-cache prefix is unchanged (L-002). `core_postcodes` seeded from the Astro frontmatter with a `TODO(D-011 boundary)`.
- **Slice 2 (#8)** — `supabase/migrations/20260605115456_init.sql`: `customers / jobs / job_photos / job_assessments / invoices / messages`; enums; `updated_at` triggers; **RLS enabled, no policies** (service-role only); **double-booking is a DB invariant** via a `btree_gist` exclusion constraint; availability derived from jobs. `supabase/tests/schema_test.sql` (pgTAP) proves the guard. Supabase CLI added as a devDependency.
- Recorded **D-016**: registered address kept **private**; ICC runs as a service-area business.

**Evening (at home):**
- **Verified Slice 2.** Ran Docker + the Supabase stack: `supabase test db` to pgTAP **8/8**, then **10/10** after hardening. Fixed a `throws_ok` gotcha (L-011).
- **Node 20 to 24 (D-017), live on `main`.** Node 20 hit EOL 30 Apr 2026; pinned 24 via `netlify.toml` `NODE_VERSION` + `engines` + `.nvmrc` on `chore/node-version` (PR #9). Installed + linked the **Netlify CLI** (site `super-frangollo-c3a14a`).
- **Pre-merge review (5 parallel agents) + fixes**, pushed to `feat/supabase-schema`:
  - **Slice 2 hardened:** the double-booking guard now blocks only **committed** jobs (`booked`/`in_progress`), so an enquiry never holds a slot; the slot is claimed at the `booked` transition (2 new pgTAP cases). Trading hours set to **09:00 to 16:30** (Mark) as whole-hour slots ending by 16:00. Added constraints: `customers.email` UNIQUE, `invoices.amount_ex_vat > 0`, `job_assessments.source` enum check, no `sent` message with a null body.
  - **Slice 1:** the furniture surcharge in the confirmation email + PDF now reads `pricing.priceOf("furniture_moving")` (no drift); added the `priceOf` helper.
  - Review also flagged (not blockers): no root `package-lock.json` so deps float between builds (a lockfile was added with Slice 2); the D-011 postcode boundary is still a `TODO`.

## Immediate next steps (suggested order)

1. **Slice 4a/4b — DONE (merged + live).** #16 and #17 are merged; 4b was preview-verified (assistant escalates on a damage-risk question + operator email **Delivered** after the `mark_director@` fix, L-015). #14 (cleanup script) stays open by choice. Both flagged Mark assumptions are now **confirmed and encoded** (#27): the deposit base is 10% of the **inc-VAT** total, and the service-area boundary is the three core towns + ~5-mile radius (Winchcombe = the GL54 5 sector). Remaining Mark follow-up: confirm `hello@`/`bookings@` exist as real aliases on `mark_director@` so customer *replies* don't bounce (D-018 addendum).
2. **Slice 4 (backend AI / D-019) — 4a–4e merged** (#16/#17/#20/#24/#28; 4a–4d live + preview-verified, 4e foundation #28 local-first), plus the chat-UX follow-on (#21), DIY-advice (#23), and the vision-model bump (#25). **Next: Slice 5** wires the 4e escalation `INSERT` (and the whole Blobs→Postgres cutover) live. The wider backend-AI scope still stands — photo-assessment re-run, invoice interpretation + chasing, summaries, NL admin queries (read-only/whitelisted), re-engagement (consent-gated, Phase 4) — all through the `messages` table for Mark to approve.
3. **Slice 5: 5a + 5b + 5e all live; 5c folded into 5b.** 5a is ENABLED in production (#32, escalations write a `human_handoff` row + email Mark). **5b (bookings Blobs→Postgres) is MERGED (PR [#38](https://github.com/randommonicle/icc-site/pull/38), `ef5398b`) and ENABLED in production** (14 June: `BOOKINGS_STORE=postgres` set + redeployed, live grid confirmed 9..15, hosted write verified by the IT, postcode-nullable migration applied via the Management API). **5c is folded into 5b.** Remaining Slice 5 work: **5d** Supabase Auth for admin (`TODO(slice5d/supabase-auth)` — bookings.js still uses the shared ADMIN_SECRET Bearer), **5e-2** the handoff approve/send lifecycle (`TODO(slice5e-2/approve-send)`). **First-real-booking watch:** the first live `confirm_booking` is the true end-to-end test of the hosted write (fail-closed if anything is off → customer sees the phone fallback, no silent loss). Hosted migration history is now clean (`migration repair`, 14 June), `SUPABASE_DB_PASSWORD` is in the main-checkout `.env`, and this checkout is `supabase link`ed — so `db push` works directly from here for future migrations.
4. **Separate stream: Phase 1 site cutover** (blocked on Mark privacy + domain D-013): `netlify.toml` `publish = site/dist`, lock `astro.config.mjs` `site`. Independent of Phase 2.
5. **Follow-ups noted:** the Astro home/services price cards now render from `shared/config/pricing.js` via `priceOf(code)` (**done 13 June**; labels stay hand-written, `astro.config.mjs` gained a `vite.build.commonjsOptions.include` for `shared/config`). Still open: fill the privacy data-controller slot with the D-016 address (gated on Mark + DP review); the root `package-lock.json` exists (Slice 2) so builds are reproducible.

## Things to watch / not yet decided

- **Open PRs (nothing merges without Ben's go-ahead):** only **#14** `scripts/delete-booking.js` (chore — deliberately unmerged to avoid web-publishing `/scripts/` in Phase 0; left parked on purpose). This session's work is **merged**: **#24** (4d web search, live), **#25** (vision → Opus 4.8, live), **#27** (D-011 boundary + deposit, live), **#28** (4e foundation, local-first), plus this docs reconciliation PR. Earlier #11–#26 all merged (bar #14).
- **Payments (Phase 3, D-004 addendum):** Stripe vs Revolut Merchant is an open choice **deferred to Phase 3**; the processor stays swappable behind our API. Confirm Mark's banking (likely Revolut Pro).
- **AI grounding (D-019): 4a–4e merged** (#16/#17/#20/#24/#28; 4a–4d live + preview-verified, 4e foundation local-first), plus the chat-UX follow-on (#21). Web search must stay **enabled at org level** in the Anthropic Console for the `ANTHROPIC_API_KEY` account. The no-Haiku / customer-facing-citation-links / all-platform-AI-on-API decisions are in the D-019 addendum; the 12 June addenda record the 4c restructure + L-016 split and the 4d build, and **D-020** records the 4e handoff design. The escalation `messages` **live wiring** is the remaining piece, deferred to Slice 5. Mark's deposit base (inc-VAT) and the `core_postcodes` boundary are now **confirmed and encoded** (#27).
- **Vision model = current best Opus (D-007 addendum):** bumped to `claude-opus-4-8` this session (#25). When a newer Opus lands, the policy is to bump the one line in `shared/config/models.js` + a deploy-preview photo check, never auto-detect. Watch: Opus 4.8 defaults `effort=high`; lower it on the vision call if photo-turn latency/cost creeps up.
- **Website contact sweep — DONE (11 June 2026).** All stale `talktoregency@gmail.com` / `intelligentcarpetcleaning.co.uk` references are now swept from the dormant Astro `site/`, `.env.example`, and the CLAUDE.md client line, on branch `chore/contact-email-and-handover` (PR #11), verified by a clean 22-page build. Only historical mentions remain in the records (DECISIONS.md D-013 and the prior-session notes above), intentionally kept as history. The `astro.config.mjs` `site` and `siteUrl` fallbacks now read `https://www.intelligentclean.co.uk`; still lock/confirm `www` vs apex at the cutover.
- **Test booking — DELETED (11 June 2026).** The leftover TEST booking (`id=1781101982626`, slot 2026-06-24 10:00) was removed via `scripts/delete-booking.js` (PR #14); slot freed, index 5→4. A git-ignored local `.env` holds the Netlify creds for future runs.
- **Workspace cost before the 14-day trial converts.** Two licensed seats (`ben@` + `mark_director@`). If `ben@` needs no mailbox, switch it to **Cloud Identity Free** so only `mark_director@` is billable. Keep billing on Mark's business card; give `mark_director@` an admin/recovery path (D-009 bus factor).
- **`ALLOWED_ORIGINS` — safe-strict variant MERGED + live ([#55](https://github.com/randommonicle/icc-site/pull/55), squash `6e07b51`, 19 June 2026); enabling it (setting the env var) still deferred to the cutover by choice.** The 15 June blocker is fixed: `buildAllowedOrigins()` now always folds the site's own Netlify deploy origins (`URL`/`DEPLOY_URL`/`DEPLOY_PRIME_URL`) into the allowlist **even in strict mode**, so setting `ALLOWED_ORIGINS` to lock the public domain no longer 403s the `.netlify.app` host or deploy previews. This only changes the strict branch; with the var unset the allowlist is byte-equivalent, so **no live behaviour changed** (it is unset in prod). `test/origins.test.js` pins both modes (L-001 addendum). **Unchanged caveat:** the check is skipped when a request has **no `Origin` header**, so a scripted caller bypasses it — the per-IP rate limit stays the real defence; this is defence-in-depth. **To enable (at cutover or sooner):** set `ALLOWED_ORIGINS=https://intelligentclean.co.uk,https://www.intelligentclean.co.uk` in Netlify and verify a 403 from a disallowed origin (closes L-001).
- **`deposit` guard — DONE (PR #12, merged).** `depositLabel()` normalises a missing deposit to "To be confirmed" across the calendar link, both emails, the PDF and the stored record.

- **The Supabase schema is NOT wired to the live functions.** It is in the repo, local-first; the live `/api/chat` availability still uses the Phase 0 Blobs grid (09:00–17:00). The schema's hardened **09:00–16:30** hours only take effect when the functions move to Postgres (Slice 5). No live behaviour changed at the merge.
- **The Supabase stack runs at home, not on the work machine** (the work machine OOM'd on `supabase start`). Slice 2 verified at home (pgTAP 10/10). Local data persists in a Docker volume; `npx supabase start` / `stop` to bring it up and down.
- **Trading-hours half-hour (Mark):** Slice 2 encodes 09:00 to 16:30 as whole-hour slots ending by 16:00, so the 16:00 to 16:30 half-hour is not bookable. Confirm whether any job needs to end at the half-hour (would need a half-hour grid across the schema, system prompt, and tests).
- **D-009 local-first.** Do NOT create a hosted Supabase project under our identity; Mark owns it. Build locally; `supabase link && db push` to his project when it exists.
- **D-011 boundary — RESOLVED (Mark, 13 June, #27).** Core = Cheltenham/Gloucester/Winchcombe + ~5-mile radius, encoded in `serviceArea.js` as the GL50–53 / GL1–4 districts + the GL54 5 sector (Winchcombe); everything else surcharged. `isOutOfArea` and the assistant prose both read it. Remaining: server-side *enforcement at booking* (`validateBooking`) lands with the Slice 5 cutover.
- **D-016 address private:** GBP-verification + privacy layer only; never on the public site / NAP / structured data.
- **Slice 0 deferrals** (npm workspaces, build-scope `ignore`): see the D-014 addendum in DECISIONS.md; revisit at Slice 3 and at the app/site-cutover.
- **`shared/config` is `.js` (CommonJS), not `.ts`**: required by the CJS functions + the plain-Node test runner. Slice 3 contract *types* can be `.ts`.
- **Surcharge VAT assumption:** £15 + VAT (if Mark meant £15 all-in, change in `serviceArea.js` + re-grep).
- **The LIVE `index.html` is still blue** with the old stats: fix at/by the Phase 1 cutover (a live change, needs deploy sign-off).
- **`astro dev` fails in this worktree**: use `npm run build/preview --prefix site`.
- **Netlify previews + stacked PRs (L-012):** a retargeted or reopened PR does NOT get a deploy preview without a fresh commit. Plan stacked-PR verification on production (atomic-deploy + tests + probe) or force previews with a throwaway commit.
- Domain (D-013) and account ownership (D-009) still open; monorepo rename `icc-site` to `icc-platform` is cosmetic/deferred.

## Local dev reminder

```bash
# Root: tests (the only logic gate today)
npm install
npm test                         # node --test -> test/hardening.test.js (8 tests)

# Phase 0 / Phase 2 functions live under server/netlify/functions/
cp .env.example .env             # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev                  # serves site + functions; /api/* via netlify.toml redirects

# Phase 1 Astro site
npm run build --prefix site      # -> site/dist (what Netlify runs at cutover)
npm run preview --prefix site

# Phase 2 Supabase (local-first; needs Docker Desktop running)
npx supabase start               # local Postgres in Docker (runs at home; Docker Desktop must be up)
npx supabase db reset            # apply supabase/migrations/
npx supabase test db             # run supabase/tests/ (pgTAP), verifies Slice 2 (10/10)
```

Phase 2 Slices 0–2 are merged into `main` (GitHub `randommonicle/icc-site`). Slice 3 branches off `main`.
