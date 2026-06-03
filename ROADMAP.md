# ICC Platform — Roadmap

The phased forward plan, derived from [docs/DESIGN.md](docs/DESIGN.md) §12 and refined into buildable work. Each phase delivers something usable; the architecture grows only when a phase needs it.

**Status key (RAG):** 🟢 done · 🟡 in progress · 🔴 not started · ⚪ deferred/optional

**Last updated:** 3 June 2026

---

## Phase 0 — Proof of concept 🟢 (with hardening gaps)

What exists today: single-page site, AI chat assistant with vision, availability + booking via Netlify Blobs, Resend confirmation emails, PDF job card, password-gated admin dashboard.

Outstanding before this can safely take real traffic (carried into Phase 1, tracked in [LESSONS_LEARNED.md](LESSONS_LEARNED.md)):

| Item | Status | Ref |
|------|--------|-----|
| Set `ALLOWED_ORIGINS` in Netlify (chat origin check fails open today) | 🔴 | L-001 |
| Rate-limit booking/availability endpoints (slot-griefing risk) | 🟢 | L-006 |
| Verify a Resend sending domain; set real from/operator addresses | 🔴 | L-004 |
| Privacy notice on the public site | 🟡 | DESIGN §11 |
| Constant-time admin token compare | 🟢 | — |

🟢 done on `hardening/phase0-pre-launch` (rate limits L-006, constant-time admin compare). 🟡 privacy notice is **drafted and live-linked but not go-live ready** — Mark must fill the data-controller placeholders (`[to confirm: …]` in `index.html`) and the wording wants a data-protection review before real traffic. 🔴 `ALLOWED_ORIGINS` (L-001) and the Resend sending domain (L-004) are blocked on the final domain (D-013) and on Netlify/Resend access; the new rate limits are the interim defence on the cost/slot paths. Verified locally by `node --test` (pure logic) + in-browser render; live 429/email/CORS behaviour verifies on a Netlify deploy preview.

---

## Phase 1 — Public site and findability 🟡

**Outcome:** a fast, expert, fully indexable site that ranks and converts. No new backend yet.

🟡 In progress on `feat/phase1-public-site` (built, not yet cut over). Done on the branch: Astro scaffold + 8 pages (home, services, about, contact, history, privacy, book, guides), shared `BaseLayout` with per-page SEO + site-wide LocalBusiness JSON-LD, `@astrojs/sitemap`, and a **care-guides content collection** (4 guides) carrying per-guide **FAQ + Article JSON-LD**; the chrome rebranded from ASH-blue onto the ICC logo's green (L-010). Remaining: area pages (blocked on the D-011 surcharge figure), more guides, sitemap/robots review + Search Console/GBP, the review-request engine, and the cutover PR. Carry the Phase 0 hardening items below into go-live.

Front end and content:
- [ ] Convert the single-file PoC to a multi-page static site (D-001). Decide hand-built HTML vs Astro before starting (open in DECISIONS.md D-001).
- [ ] Build pages: Home, Services, Booking, About, History of carpet cleaning, Carpet science & care guides, Area pages, Contact.
- [ ] Area pages reflect the service-area model (D-011): Cheltenham and Gloucester as core/no-surcharge pages, plus wider-Gloucestershire pages (Stroud, Tewkesbury, Cirencester and surrounding towns) that honestly state a small out-of-area surcharge applies. Confirm the exact surcharge figure and postcode boundary with Mark before quoting a number on a page.
- [ ] Move the AI knowledge into a single maintainable source shared between site content and the assistant prompt (D-006).
- [ ] Expand the AI knowledge base (fibre science, stain chemistry, method justification, history).

Findability:
- [ ] Per-page unique title + meta description, one clear H1 per page.
- [ ] Structured data (LocalBusiness: location, hours, service area, price range, aggregate rating) + FAQ markup on guides.
- [ ] `sitemap.xml` + `robots.txt`; register Google Search Console + Bing Webmaster Tools.
- [ ] Google Business Profile claimed/verified (Mark-owned), categories, service area, photos, posts.
- [ ] NAP consistency across Google, Bing Places, Apple Business Connect, Yell, Facebook.

Review engine (high value, build early — DESIGN §9 priority 2):
- [ ] Automated Google-review request triggered when a job is marked complete. (Depends on a "mark complete" action — minimal job state can live in Blobs in Phase 1, or wait for Phase 2. Decide in DECISIONS.md.)

Carry the Phase 0 hardening items above into this phase.

---

## Phase 2 — Operational back end 🔴

**Outcome:** Mark runs the operational side from one place.

- [ ] **Restructure to the monorepo layout first** (D-014): `site/`, `app/`, `functions/`, `shared/`, `supabase/migrations/`, docs at root. Scope the Netlify build to `site/`+`shared/`. Do this before the API exists so the contract is born in `shared/`, not extracted later.
- [ ] Stand up Supabase: relational DB, admin auth, file storage for job photos, API (D-002).
- [ ] Design the API surface deliberately so the future field app is a client, not a rebuild (D-003). Document it as an integration contract from day one (mirror the ASH/PropOS convention).
- [ ] Migrate bookings off Netlify Blobs into Postgres (one-time migration + cutover).
- [ ] Jobs dashboard: all jobs, filterable by status (enquiry, booked, in progress, completed, cancelled); outstanding vs completed views.
- [ ] Job records: customer, address, carpet details, photos, AI assessment, quote, slot, notes.
- [ ] Basic invoice tracking (draft / sent / paid / overdue) against completed jobs.
- [ ] Move model names + AI knowledge source server-side as a single source of truth (D-007, D-006).
- [ ] First test suite (real services, no mocks) covering booking validation and the API contract.

---

## Phase 3 — Payments and calendar 🔴

**Outcome:** money and scheduling handled end to end.

- [ ] Stripe: deposit at booking, balance on completion. No card data stored locally (D-004).
- [ ] Calendar output: ICS feed + per-booking links first (universal), then Google Calendar API and Microsoft Graph sync (D-005). Confirm which calendar Mark uses day to day before prioritising (DESIGN §13).
- [ ] Reconcile deposits/balances against invoices in the admin platform.

---

## Phase 4 — CRM and marketing 🔴

**Outcome:** the platform generates repeat business, within the compliance rules.

- [ ] Client database: per-customer record, job history, contact details, consent status.
- [ ] Consent tracking (PECR soft opt-in) with automatic unsubscribe handling — hard gate, build before any campaign (D-008, DESIGN §11).
- [ ] Client curation views: due-a-repeat, lapsed, high-value.
- [ ] AI-assisted re-engagement and seasonal campaigns, segmented, with Mark approving before send.
- [ ] Privacy/consent wording reviewed by a data-protection professional before go-live.

---

## Field app — concurrent track (not a deferred final phase) 🔴

**Decision (D-012):** Mark wants the field app built alongside the website and fully integrated, not parked until the end. It is not yet designed, but it is a first-class client of the platform API from the start, equal to the website.

What this changes about the plan:
- **Phase 2 API design must serve both clients.** Design and version the API surface and a documented integration contract from the first backend build, with all business logic server-side so the website and app never diverge (D-003, D-012).
- **One repo (D-014).** The app lives in `app/` in this monorepo and imports the shared contract from `shared/`, so it cannot drift from the website. No separate app repo, no separate backend.
- The app's own build (scoping, UI, native shell) begins once the Phase 2 API exists to consume, and progresses in parallel with Phases 3–4 rather than after them.
- Whatever the website does through the API (book, quote, view jobs, mark complete, invoice), the app can do through the same endpoints — no app-only backend.

When the app is scoped, give it its own roadmap section here.

## Phase 5 and beyond — optional integrations ⚪

- [ ] ⚪ SMS notifications (Mark and customers).
- [ ] ⚪ Open banking for direct bank payments.
- [ ] ⚪ Accounting software export for invoices.
- [ ] ⚪ Public additions: review wall, before/after gallery, instant quote calculator.

---

## Open questions (from DESIGN §13)

Resolved with Mark (June 2026):
- ✅ **Service area:** Cheltenham + Gloucester core (no surcharge); wider Gloucestershire (Stroud, Tewkesbury, Cirencester, surrounding GL towns) with a small out-of-area surcharge (D-011).
- ✅ **Field app:** built concurrently with the website and fully integrated via the shared API, not deferred (D-012).
- ⏸️ **Domain:** still to be chosen — parked, non-blocking for Phases 0–2 (D-013). Needed before Phase 1 go-live and `ALLOWED_ORIGINS` strict mode.

Still to resolve before the phase that needs each:
- Exact out-of-area surcharge figure and the precise postcode boundary for "out of area" (D-011) — needed before area pages quote a number and before server-side surcharge logic.
- Deposit policy — amount or percentage at booking (Phase 3).
- Which calendar Mark actually uses day to day (Phase 3).
- Account ownership (domain, Stripe, Google Business Profile, database) sitting with Mark from the start (D-009).
