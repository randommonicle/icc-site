# ICC Platform — Roadmap

The phased forward plan, derived from [docs/DESIGN.md](docs/DESIGN.md) §12 and refined into buildable work. Each phase delivers something usable; the architecture grows only when a phase needs it.

**Status key (RAG):** 🟢 done · 🟡 in progress · 🔴 not started · ⚪ deferred/optional

**Last updated:** June 2026

---

## Phase 0 — Proof of concept 🟢 (with hardening gaps)

What exists today: single-page site, AI chat assistant with vision, availability + booking via Netlify Blobs, Resend confirmation emails, PDF job card, password-gated admin dashboard.

Outstanding before this can safely take real traffic (carried into Phase 1, tracked in [LESSONS_LEARNED.md](LESSONS_LEARNED.md)):

| Item | Status | Ref |
|------|--------|-----|
| Set `ALLOWED_ORIGINS` in Netlify (chat origin check fails open today) | 🔴 | L-001 |
| Rate-limit booking/availability endpoints (slot-griefing risk) | 🔴 | L-006 |
| Verify a Resend sending domain; set real from/operator addresses | 🔴 | L-004 |
| Privacy notice on the public site | 🔴 | DESIGN §11 |
| Constant-time admin token compare | 🔴 | — |

---

## Phase 1 — Public site and findability 🔴

**Outcome:** a fast, expert, fully indexable site that ranks and converts. No new backend yet.

Front end and content:
- [ ] Convert the single-file PoC to a multi-page static site (D-001). Decide hand-built HTML vs Astro before starting (open in DECISIONS.md D-001).
- [ ] Build pages: Home, Services, Booking, About, History of carpet cleaning, Carpet science & care guides, Area pages (Cheltenham, Gloucester, Tewkesbury, Stroud, Cirencester — confirm list), Contact.
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

## Phase 5 and beyond 🔴 / ⚪

- [ ] Field app built against the platform API (no separate backend). Front-load API work in Phase 2 only if Mark wants the app on the near roadmap (DESIGN §13).
- [ ] ⚪ SMS notifications (Mark and customers).
- [ ] ⚪ Open banking for direct bank payments.
- [ ] ⚪ Accounting software export for invoices.
- [ ] ⚪ Public additions: review wall, before/after gallery, instant quote calculator.

---

## Open questions blocking later phases (from DESIGN §13)

Resolve with Mark before the phase that needs each:

- Domain name to register for the live site (Phase 1).
- Full service-area town list for the area pages (Phase 1).
- Deposit policy — amount or percentage at booking (Phase 3).
- Which calendar Mark actually uses day to day (Phase 3).
- Whether the field app is near-roadmap or later — affects how much API work is front-loaded in Phase 2.
- Account ownership (domain, Stripe, Google Business Profile, database) sitting with Mark from the start.
