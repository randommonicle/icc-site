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

## D-011 — Service area: Cheltenham/Gloucester core, wider Gloucestershire with an out-of-area surcharge
**Status:** Accepted (confirmed by Mark, June 2026; exact surcharge figure still Open)

Cheltenham and Gloucester are the core service area with no travel charge. ICC also covers the wider Gloucestershire area — Stroud, Tewkesbury, Cirencester, and surrounding towns (all GL postcodes). Jobs outside Cheltenham and Gloucester incur a small out-of-area surcharge. The live AI assistant now states this and flags the surcharge early when an address is outside the core area, without inventing a figure (Mark confirms the amount at booking). Open: the exact surcharge amount and/or the precise postcode boundary for "out of area" — once Mark sets these, encode them so the assistant can quote a concrete number and `validateBooking` can apply it server-side. This also shapes the SEO area pages (D-001): core-area pages and wider-area pages with honest surcharge messaging.

## D-012 — The field app is built concurrently with the website and fully integrated, not deferred
**Status:** Accepted (confirmed by Mark, June 2026)

The field app has not been designed yet, but Mark wants it built alongside the website and fully integrated rather than treated as a final, separate phase. This raises the priority of the API-first design (D-003): the backend API surface must be designed from the first backend build (Phase 2) to serve both the website and the app as equal clients, with a documented integration contract. The app is no longer "Phase 5 only" — it is a parallel track that consumes the same API as it matures. Practical consequence: front-load API design in Phase 2, keep all business logic server-side (never only in the website client), and version the API/contract from day one so the two clients never drift. Supersedes the roadmap's earlier framing of the app as a deferred Phase 5 item.

## D-013 — Domain registration is deferred but non-blocking
**Status:** Accepted (June 2026)

The live domain is not yet chosen. This does not block Phases 0–2: development continues on the Netlify-assigned URL, and `ALLOWED_ORIGINS` / Resend / Google Business Profile / structured data are configured once the domain is registered. Recorded so the open question is visibly parked rather than forgotten. Must be resolved before the SEO/findability launch (Phase 1 go-live) and before `ALLOWED_ORIGINS` strict mode (L-001).

## D-014 — One monorepo for the whole ICC platform (site + app + backend + shared contract)
**Status:** Accepted (June 2026)

The public website, the field app, the backend/serverless functions, and the shared API contract all live in this single repository. This is the natural consequence of D-003 and D-012: the website and the field app are two clients of one product, not two products.

Reasoning:
- One product, one repo. This is the dividing line from the ASH↔PropOS strategy, where separate repos are used precisely because those are separate products with separate commercial lives. The ICC site and ICC app are clients of the same platform, so they belong together.
- Single source of truth for the API contract. A `shared/` package (endpoint shapes, types) is imported by the site, the app, and the functions, so the compiler enforces D-012's "the two clients never diverge". Across two repos this needs a published versioned package or hand-duplication, and drift is exactly the failure mode we are avoiding (it is why PropOS needs the XR cross-repo tagging convention).
- Same win for D-006: the AI knowledge source lives in `shared/` and is consumed by site content, the assistant prompt, and the app.
- Bus factor: one clone, one doc set, one decisions/lessons log covering the whole platform.
- Atomic changes: an endpoint change plus both clients land in one PR, not coordinated cross-repo PRs.

The one real cost is two deploy targets (site → Netlify, app → Capacitor build). Handle it by scoping Netlify's build to changes under `site/` (and `shared/`) so an app-only commit never triggers a site deploy, and vice versa. The ASH repo already proves a Capacitor app + server + Supabase migrations coexist in one repo.

Target layout (created when Phase 2 starts, before the API exists to consume):
```
icc-platform/
├── site/                       public multi-page static site
├── app/                        field app (Capacitor)
├── functions/ (or server/)     API + AI proxy + serverless
├── shared/                     API contract types + AI knowledge source (D-006, D-012)
├── supabase/migrations/
└── docs/ + CLAUDE.md, ROADMAP.md, DECISIONS.md, LESSONS_LEARNED.md, NEXT_SESSION.md at root
```

Sessions stay separate by working on branches (existing discipline, D-010) or git worktrees — the monorepo makes separate site/app sessions easier, not harder, because each has the shared contract and docs to hand. The repo is currently named `icc-site`; rename to `icc-platform` when convenient (GitHub redirects the old URL) or leave it as a cosmetic mismatch. Do the monorepo restructure before building the Phase 2 API, so the contract is born in `shared/` rather than extracted later.
