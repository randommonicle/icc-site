# ICC Platform — Decision Records

Architectural decisions, newest-relevant kept together. Each has an ID (D-NNN), a status, the decision, and the reasoning. When a decision changes, add a new record that supersedes the old one rather than editing history.

Same convention as the ASH app and PropOS. Reference decisions by ID from code comments and other docs.

**Status:** Accepted · Proposed · Open (needs a call) · Superseded

---

## D-001 — Multi-page static front end, built with Astro
**Status:** Accepted (front-end tool resolved: Astro, June 2026)

The public site becomes a proper multi-page static site so each page is independently crawlable and can target its own search terms — the foundation of the SEO strategy (DESIGN §4, §9).

The front-end-tool sub-question is **resolved in favour of Astro** (a static site generator). Reasoning: Phase 1 is content- and SEO-heavy (Services, About, History, a growing library of care guides, and several core/wider-area pages per D-011), which is exactly where Astro's shared layouts/components and content collections remove duplication and keep per-page SEO consistent; `@astrojs/sitemap` generates the sitemap at build; output is zero-JS static HTML (fast, fully crawlable); and the existing chat widget ports cleanly as a client-side island with the `/api/*` serverless contract unchanged. The cost is a Node build step — already anticipated in CLAUDE.md, and immaterial on the project's paid Netlify plan. Hand-built HTML was the alternative; rejected because ~12+ pages would duplicate head/nav/footer and need hand-maintained meta, structured data, and sitemap, with drift being the exact failure mode Phase 1 is trying to avoid.

Implementation: scaffolded under `site/` — a small, deliberate pull-forward of the D-014 monorepo layout, so the site is not relocated at Phase 2. TypeScript strict, vanilla CSS ported from the Phase 0 site, static output, deployed on Netlify. The Phase 0 single-page `index.html` keeps serving until the Astro site is cut over in a dedicated PR.

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

**Addendum (7 June 2026) — hosted Supabase goes in a dedicated ICC organisation, not the build-lead's personal org.** Until now Phase 2 was local-first (no hosted project, D-002). Refined because the work machine cannot run the local Supabase stack (Docker OOM) and Slices 3+ build far faster against a hosted instance: we stand one up now, in a **dedicated Supabase organisation for ICC** ("Intelligent Carpet Cleaning"), separate from the build-lead's personal `randommonicle's Org`. The build lead is owner/admin to build and grants Mark a member role for access; org ownership and billing transfer to Mark or an ICC-controlled login later, with no data migration (a Supabase org is a clean ownership boundary). This keeps D-009's principle intact: ICC owns its data and account, build-lead access sits on top.

Rejected alternative: hosting the ICC project inside `randommonicle's Org` and adding Mark as a member. That inverts D-009 (build-lead owns, Mark visits), pools ICC's customer PII with other clients' projects under one personal login (an undocumented processor arrangement the privacy notice would have to describe), and makes ICC's backend hostage to the build-lead's personal account and billing (the continuity failure D-009 exists to prevent). Member access is not ownership.

Cost and hard rule: Supabase Pro is per-organisation, so the ICC org runs on **Free** for build/staging and upgrades to Pro at go-live (an ICC business cost). **No real customer PII on any instance under the build-lead's personal org**; the production instance holding real data must be on the ICC-owned org before launch (gates the Slice 5 cutover). Server-side secrets (service-role key, DB password) follow the secrets-server-side rule: Netlify env + local `.env`, never committed.

## D-010 — Engineering discipline inherited from the ASH app / PropOS
**Status:** Accepted

Branch off `main`, never push to `main` directly, deploy by deliberate merge (not mid-traffic without sign-off). Real services in tests, no mocks. Honest RAG-tracked, standards-referenced, phased audits. Keep the doc set (CLAUDE/ROADMAP/DECISIONS/LESSONS_LEARNED/NEXT_SESSION) current. Clean prose, bold for structure only. Recorded here so the convention is explicit for this repo, not just assumed.

## D-011 — Service area: Cheltenham/Gloucester/Winchcombe core, wider Gloucestershire with a flat £15 out-of-area surcharge
**Status:** Accepted (confirmed by Mark, June 2026; surcharge figure resolved June 2026 — flat £15 + VAT)

Cheltenham, Gloucester and Winchcombe are the core service area with no travel charge. ICC also covers the wider Gloucestershire area — Stroud, Tewkesbury, Cirencester, and surrounding towns (all GL postcodes). Jobs outside the core area incur a **flat £15 + VAT out-of-area surcharge** (confirmed by Mark, June 2026). The AI assistant and the site (area pages, services page, home-page strip) now state this concretely, and the assistant includes the £15 + VAT in the itemised quote for out-of-area addresses, shown up front. This shapes the SEO area pages (D-001): Cheltenham/Gloucester/Winchcombe are core/no-surcharge pages; Stroud/Tewkesbury/Cirencester and the wider GL towns are wider-area pages stating the flat £15 + VAT. **Still open (Phase 2):** the precise postcode boundary for "out of area" and **server-side enforcement** — `validateBooking` currently only bounds the total price, so the surcharge is applied in the assistant's quote, not enforced server-side. Encode the boundary + surcharge in `validateBooking` when pricing/area logic moves server-side (D-007), so the website and the future field app (D-012) apply it identically.

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

**Addendum (5 June 2026 — implementation):** backend folder resolved to **`server/`** (not `functions/`). Phase 2 Slice 0 moved `chat.js`/`bookings.js` to `server/netlify/functions/` (history preserved) on `chore/d014-monorepo`, updated the `netlify.toml` `functions` path, and repointed the test require paths — `node --test` green 8/8 locally, awaiting sign-off, not merged. Two things were deliberately deferred to keep the structural change minimal and reduce live-deploy risk: **npm workspaces + a `server/package.json`** (introduced when `server/` first needs its own dependency — e.g. `@supabase/supabase-js` in Slice 2; until then the functions resolve root `node_modules` exactly as before, so Netlify's install/bundle is unchanged), and the **build-scope `ignore` directive** (no consumer until `app/` has a real build, and Phase 0 still publishes the repo root incl. the live `index.html`/`admin.html`, so it needs care — better introduced with the site cutover). `shared/` and `supabase/migrations/` are created in their own slices.

## D-015 — No quantified trust or marketing claims until independently substantiated
**Status:** Accepted (June 2026)

The public site must not show quantified track-record or trust metrics (completed-job counts, satisfaction percentages, star ratings) or superlative claims ("first", "guaranteed") unless each is independently substantiated and current. ICC is a new business with no track record yet, so figures like "500+ cleans" or "98% satisfaction" are unverifiable and breach ASA/CAP and the L-009 rule on repeating unverified claims. Capability facts that are simply true (for example "15+ carpet types", the six trading days, the 10% deposit) are fine, because they describe what the service is rather than a track record it has not earned.

Where a quantified metric would genuinely add value, it goes in only once there is a real, defensible source: a true completed-job count, or a verified review aggregate (which would also back an `aggregateRating` in the structured data). Implemented June 2026 on `feat/pre-cutover-polish`: the fabricated `500+`/`98%` tiles on the home and About pages were removed and replaced with capability facts, the "Guaranteed Results" and "first fully AI-assisted" claims were softened, and a grep-able `TODO(trust-stats)` anchor marks where substantiated metrics may later go. This is the site-side companion to L-009 (which governs the assistant) and is a hard gate on promoting the site off the Netlify name.

## D-016 — Registered address kept private; ICC runs as a service-area business
**Status:** Accepted (5 June 2026)

ICC's registered business address is **11 Horsbere Road, Hucclecote, Gloucester, GL3 3BT** (inside the Gloucester core area — GL3 — so no surcharge applies to its own neighbourhood). The address is kept **private**: used only for Google Business Profile verification and the data-controller / privacy layer, never published on the public site or in NAP / structured data. ICC is set up as a **service-area business** (it travels to the customer), so the Google Business Profile is configured with service areas and the street address hidden.

Reasoning (the SEO question that prompted this): for a home-based service-area business, displaying the street address gives at best a marginal SEO benefit and is not worth the privacy/safety trade-off. Google ranks on the **verified** address (given privately for GBP verification), not the **displayed** one, so hiding it costs ~nothing in proximity ranking; Google's own guidance is that service-area businesses should not display an address they don't serve customers at. The real local-SEO levers are unaffected: a verified GBP + correct category + service areas, the review engine, NAP (here Name + Phone) consistency, the area pages, and structured data. The one useful move is publishing the **locality** (Hucclecote / Gloucester / GL3) in content, not the house. Practical consequence: this address fills the privacy-notice data-controller `[to confirm]` slot only (still gated on Mark + a DP review); it does **not** go on the contact page or into `LocalBusiness` structured data.

## D-017 — Node runtime pinned to 24 (build + Functions)
**Status:** Accepted (5 June 2026)

Node 20 reached end-of-life on 30 April 2026, so the platform pins **Node 24** for both the Netlify build and the serverless Functions runtime. Node 24 is the active LTS line (security support to April 2028) and is usable on Netlify Functions because AWS Lambda shipped the `nodejs24.x` runtime on 25 November 2025 (Functions inherit the build's Node version when it is a valid Lambda runtime, otherwise they fall back to Node 22).

Pinned in three places, with `NODE_VERSION` taking precedence: `netlify.toml` (`[build.environment] NODE_VERSION = "24"`), root `package.json` (`"engines": { "node": "24" }`), and `.nvmrc` (`24`). Verified end to end before relying on it: the PR #9 deploy preview built and ran the functions on Node 24, and the published production deploy is the Node 24 merge (`a7131f2`, confirmed via the Netlify CLI `listSiteDeploys`). Landed standalone on `chore/node-version` (PR #9 to `main`) ahead of the Phase 2 stack, so the EOL runtime was not carried into new backend work. The Phase 2 branches (#6 to #8) were cut before this merge and still pin Node 20; they must resolve to keep Node 24 when they merge (their `netlify.toml` and `package.json` conflict on the version — resolution: keep the `server/...` functions path and Node 24).
