# ICC Platform — Decision Records

Architectural decisions, newest-relevant kept together. Each has an ID (D-NNN), a status, the decision, and the reasoning. When a decision changes, add a new record that supersedes the old one rather than editing history.

Same convention as the ASH app and PropOS. Reference decisions by ID from code comments and other docs.

**Status:** Accepted · Proposed · Open (needs a call) · Superseded

---

## D-001 — Multi-page static front end (not single-file, not an SPA)
**Status:** Accepted (front-end tool still Open)

The public site becomes a proper multi-page static site so each page is independently crawlable and can target its own search terms. This is the foundation of the SEO strategy (DESIGN §4, §9). Open sub-question: hand-built HTML vs a static site generator such as Astro. Astro gives components/layouts and content collections (useful once there are many guide/area pages) at the cost of a build step. Decide before Phase 1 build starts. Either way it deploys on Netlify and stays fully static.

## D-002 — Supabase (managed Postgres) for the operational backend
**Status:** Accepted

Invoicing, payments, calendar sync, a client database, and marketing automation need persistent relational data, authenticated access, and background processing. Netlify Blobs is a key-value store and is not the right home for that. Supabase provides Postgres, admin auth, file storage for job photos, and an API without running servers. Netlify Blobs remains only for the Phase 0 PoC until Phase 2 migrates bookings into Postgres. (Consistency bonus: the ASH app and PropOS already use Supabase, so the conventions transfer.)

## D-003 — API-first design; website and field app are both clients
**Status:** Accepted

The backend exposes a clean, documented set of endpoints. The website is one client; the future field app is another, consuming the same endpoints rather than needing its own backend. Plan the API surface with the app in mind from the first backend build so nothing is retrofitted. Document it as an integration contract (mirror the ASH/PropOS `INTEGRATION_CONTRACT` convention).

## D-004 — Stripe for payments; no card data stored locally
**Status:** Accepted

Stripe handles card security, so no card data is ever stored on the platform, keeping ICC out of scope for the heaviest payment-security obligations. Covers the deposit at booking and the balance on completion. True open-banking links are heavier and parked as optional/later (not needed to take deposits).

## D-005 — Calendar: ICS + per-booking links first, API sync later
**Status:** Accepted

The simplest reliable version is a per-booking calendar link plus an ICS file, which works with every calendar app. Full two-way Google Calendar / Microsoft Graph sync is the richer version and follows once accounts and auth are in place. Confirm which calendar Mark uses day to day before prioritising which API sync to build first (DESIGN §13).

## D-006 — AI knowledge lives in one maintainable structured source
**Status:** Accepted (implementation in Phase 1/2)

The science/history content shown on the website and the assistant's system-prompt knowledge should come from the same source so they never drift. Today the system prompt is inline in `chat.js`; as content grows, factor it into a shared structured source consumed by both the site build and the AI proxy. This is the ICC analogue of the ASH "single source of truth" rule.

## D-007 — Single source of truth for AI model names; Sonnet for text, Opus only for vision
**Status:** Accepted

The cost discipline from ASH/PropOS applies here. Sonnet handles all text; Opus is used only when the latest user message contains an image (visual understanding genuinely needed). Model names must not be hardcoded across scattered call sites — once there is a backend, route them through one config value. Already partly implemented in `chat.js`.

## D-008 — Consent (PECR soft opt-in) is a hard gate on marketing
**Status:** Accepted

Marketing email to past customers relies on the PECR soft opt-in: details collected during a sale of a similar service, every message carrying a clear opt-out. The platform records consent status per client and processes unsubscribes automatically. No re-engagement campaign ships without this (DESIGN §11). This gates Phase 4.

## D-009 — Accounts owned by Mark / the business from the start
**Status:** Accepted

Domain, Netlify, Anthropic, Resend, Stripe, Supabase, and Google Business Profile should be owned by Mark / the business from day one, so nothing needs transferring later. Build-lead access is granted on top of Mark's ownership, not in place of it (DESIGN §13).

## D-010 — Engineering discipline inherited from the ASH app / PropOS
**Status:** Accepted

Branch off `main`, never push to `main` directly, deploy by deliberate merge (not mid-traffic without sign-off). Real services in tests, no mocks. Honest RAG-tracked, standards-referenced, phased audits. Keep the doc set (CLAUDE/ROADMAP/DECISIONS/LESSONS_LEARNED/NEXT_SESSION) current. Clean prose, bold for structure only. Recorded here so the convention is explicit for this repo, not just assumed.
