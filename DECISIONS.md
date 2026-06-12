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

**Addendum (June 2026) — processor kept swappable; Revolut Merchant is a live alternative.** Mark is considering **Revolut Pro** (the sole-trader account) for the business banking. That does not change this decision and is compatible with it: the **card processor** and the **receiving bank account** are different layers. Two viable processor strategies, to choose at Phase 3:

- **Stripe** (default): best API/ecosystem for a custom embedded deposit-plus-balance flow, serves the website and the field app identically, and pays out to whatever bank account Mark nominates — **including Revolut Pro** (UK sort code + account number). Slightly higher UK card fees (~1.5% + 20p).
- **Revolut Merchant API**: custom checkout + Revolut Pay, ~0.8% + 2p (0.5% + 2p for Revolut Pay), next-day settlement straight into the Revolut account Mark already uses. Younger API/ecosystem than Stripe, and it ties payments to Revolut.

There is no "Stripe is built into Revolut" — they are separate (and partly competing) products; the only Stripe↔Revolut tie is **Revolut Pay** as a checkout method Stripe can offer. Open banking / "pay by bank" (e.g. via the Revolut Pay bank route) is the low-fee option worth considering for the **deposit** specifically.

**Design rule locked now:** the payment processor sits **behind our own server-side API (D-003); the website and field app never call the processor directly.** So Stripe ↔ Revolut Merchant (or adding pay-by-bank) is a server-side swap, not a client rebuild — the choice is not a one-way door, and we don't have to make it until Phase 3. Whichever is chosen, the merchant + payout accounts are **Mark/business-owned (D-009)**. *(Fees/eligibility verified against Stripe + Revolut docs June 2026; reconfirm current figures at build time — L-009.)*

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
**Status:** Accepted (June 2026); **resolved 7 June 2026 — `intelligentclean.co.uk`**

The live domain is not yet chosen. This does not block Phases 0–2: development continues on the Netlify-assigned URL, and `ALLOWED_ORIGINS` / Resend / Google Business Profile / structured data are configured once the domain is registered. Recorded so the open question is visibly parked rather than forgotten. Must be resolved before the SEO/findability launch (Phase 1 go-live) and before `ALLOWED_ORIGINS` strict mode (L-001).

**Resolved (7 June 2026):** the domain is **`intelligentclean.co.uk`**, registered with 123reg (1 year), DNS propagating (123reg quoted 24–48h). Chosen for brevity and brand fit; it deliberately omits "carpet" and "cheltenham" (a weak SEO signal now, and "clean" future-proofs for upholstery and other services). Unblocks, before promotion and when convenient: `ALLOWED_ORIGINS` strict mode in Netlify (`https://intelligentclean.co.uk,https://www.intelligentclean.co.uk`, closes L-001); updating the now-stale hardcoded fallback origins in `chat.js` (they guessed `intelligentcarpetcleaning.co.uk`); locking `astro.config.mjs` `site` for the sitemap/canonicals at cutover; and verifying a Resend sending domain (L-004). 123reg DNS points at Netlify at go-live. None of this blocks the Phase 2 Supabase build.

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

## D-018 — Email: Google Workspace for mailboxes, Resend for transactional, both on intelligentclean.co.uk
**Status:** Accepted (10 June 2026)

ICC's email runs on two services over the one verified domain, set up this session:

- **Human mailboxes** (send + receive) on **Google Workspace Business Starter**. The first/admin account is `ben@intelligentclean.co.uk` (build-lead super-admin, recovery to Ben's personal Gmail); the owner mailbox is `mark@intelligentclean.co.uk` with free aliases `hello@`/`info@`/`bookings@`. Ben administers because Mark is non-technical — the same build-lead-operates / business-owns split as D-009. Cost note: two licensed seats currently; before the 14-day trial converts, `ben@` can move to **Cloud Identity Free** (admin, no mailbox, no charge) so only `mark@` is billable, and `mark@` should be given an admin/recovery path so the business is never locked out (bus factor).
- **Transactional/automated email** (booking confirmations now; Supabase Auth from Slice 5) via **Resend**, sending from the verified domain. The app's From-addresses are env-driven in Netlify (`CUSTOMER_FROM=hello@…`, `OPERATOR_FROM=bookings@…`, `OPERATOR_EMAIL=mark@…`).

There is no "link the domain to Supabase" step: Supabase does not host mailboxes — it only *sends* auth email over SMTP, which from Slice 5 points at the same Resend domain. The two sending paths stay independent by DNS design: Google's SPF/DKIM on the root, Resend's on the `send` subdomain, one shared DMARC (`_dmarc`, `p=none` during rollout). Verified end-to-end with a live booking and closes the L-004 sending-domain item. DNS lives at 123reg (GoDaddy `*.domaincontrol.com` nameservers); the web records (→ Netlify) are deliberately untouched until the Phase 1 cutover.

**Addendum (11 June 2026) — the owner mailbox is `mark_director@`, not `mark@`.** The address stated above is wrong: Mark's Workspace account was created as `mark_director@intelligentclean.co.uk`, and `mark@` was never provisioned (the Directory shows only `ben@` and `mark_director@`). `OPERATOR_EMAIL` is therefore `mark_director@intelligentclean.co.uk` (corrected in Netlify this session). The `hello@`/`info@`/`bookings@` aliases belong to Mark's account (`mark_director@`), not to a `mark@` mailbox. The original `mark@` value had silently hard-bounced and been Resend-suppressed since 10 June, dropping every operator email including booking notifications — see **L-015**. The 10 June "verified end-to-end" had only confirmed the *customer* leg. **Follow-ups:** confirm `hello@`/`bookings@` exist as real aliases so customer *replies* to those From-addresses don't bounce (sending already works via the verified domain); and revisit which Netlify account holds the site — currently the build-lead's *Personal* account (D-009 ownership).

## D-019 — AI assistant grounding, source hierarchy, and human escalation
**Status:** Accepted in principle (11 June 2026); implementation in Phase 1 (knowledge consolidation) + Slice 4 (backend AI / handoff)

The assistant must not give incorrect information — above all, aftercare or stain advice that could physically damage a customer's carpet. The agreed design is a **grounded assistant with a two-lane source hierarchy and a safe "I don't know → escalate to a human" exit**, built as layered (defence-in-depth) guardrails rather than a single prompt instruction. Rationale: the model has no calibrated confidence, and an AI/web summary is exactly what caused the L-009 drift — so escalation is engineered by **category**, not by trusting the model to police itself.

**Source hierarchy (two lanes):**
- *Low-stakes / general* questions: vetted KB (D-006) → attributed web search → escalate.
- *Damage-risk / out-of-scope* questions: vetted KB only → **escalate to a human immediately** (never fall back to web for advice that could damage a carpet).

**Claude mechanisms (verified against the API, June 2026):**
- **Citations** — pass the vetted content as documents (or the cached system prompt, L-002) so Claude grounds and cites each claim to its source; an uncitable claim is itself a signal to soften or escalate.
- **Server-side `web_search`/`web_fetch`** — used only for low-stakes gaps, always **attributed** ("the manufacturer states…"), never asserted as ICC fact (L-009).
- **A custom `escalate_to_human` tool** — the model calls it when out of its depth; the *description must state when to call it* (out-of-KB, damage-risk, or no citable source), because recent Claude models under-reach for custom tools without explicit triggers. It returns the "I'll get the team to check" message and captures the question + contact as a lead.
- Constraint: Citations and forced-JSON structured outputs cannot be combined in one call, so prefer Citations + the escalation tool over a model-reported confidence score (which is unreliable anyway).

**Structural guards:** bound the assistant's remit to *educate + quote + book* (defer prescriptive treatment of valuable/delicate items to a professional assessment — escalate by design); optionally a cheap second-model (Haiku) verification pass that checks a safety-relevant draft against the KB before it is sent.

**Where it lands:** the build-out of D-006 (one vetted source feeds site + assistant) and the enforcement of L-009. The human-handoff half uses the **Slice 4 `messages` table** (draft → Mark approves → send) + admin review, so escalations become logged leads and Mark's corrections feed back into the KB. Today `chat.js` already does the simplest tier-1 (a cached system prompt = in-context grounding); value-ordered upgrade path: **structured KB → Citations → gated web tool → escalation tool + verification.**

**Addendum (11 June 2026) — three refinements settled while building Slice 4 (PRs #16/#17):**

- **No Haiku in the AI path.** The optional second-model (Haiku) verification pass is dropped. Using a model to police a safety-critical draft is exactly the un-calibrated-confidence problem D-019 exists to avoid; the engineered guards — Citations grounding (every claim tied to a source), the category-based `escalate_to_human` exit, and a bounded remit — are the defence-in-depth. If a second-model check is ever wanted it would be Sonnet, not Haiku, but the call is to leave it out. Supersedes the "optionally a cheap second-model (Haiku) verification pass" note above.
- **Citations are shown to the customer as links.** The Citations API returns, per grounded sentence, the source it came from. Rendered safely (DOM `<a>` via `createElement`, sanitised `https` href, never `innerHTML` — preserves L-003): **KB-grounded** claims link to ICC's own care-guide pages (best once the Phase 1 site is live so the guide URLs exist; a plain source label until then); **web-search** claims render as attributed external links ("the manufacturer states… [source]", satisfying L-009). Built in Slice 4c; adds a small client-renderer change to `index.html`, which today reads `data.content[0].text` and must be extended to render the citations payload (see L-014).
- **All platform AI runs on the Anthropic API; a consumer Claude.ai subscription cannot power it.** A Pro/Max subscription authenticates a *human* in the Claude app and issues no API key, so neither the chatbot nor the backend AI (photo re-assessment, invoice interpretation, escalation drafts, re-engagement) can be driven from it — both are programmatic and use the API (server-side key, D-007 / secrets rule), billed per-token to Mark's business account (D-009). With prompt caching (L-002, ~10% on cache hits) and low backend volume the cost is modest. A ~£20 Pro subscription is worth it only as Mark's *personal* assistant (drafting copy, ad-hoc questions, hand-reviewing an escalation draft), separate from the platform.

**Implementation status (11 June 2026):** the value-ordered path is underway — 4a (structured KB, #16) and the escalation tool (4b, #17) are built and open; Citations + the gated web tool follow (4c/4d). The handoff is interim email-to-Mark until the Slice 5 `messages`-table (draft→approve→send) lands.

**Addendum (12 June 2026) — Slice 4c (Citations) built on `feat/slice4c-citations`; the KB↔guardrail split.** The vetted knowledge (`shared/config/knowledge.js` `knowledgeSections`) is now passed to the Claude API as a **citeable custom-content document** — one content block per section — with `citations.enabled` and `cache_control`, attached to the first user turn server-side (`withKnowledgeDocument` in `chat.js`, injected on every call so `messages[0]` stays byte-stable and the L-002 cache holds; one-time re-warm, like 4b's tool array). The model grounds and cites claims; the server resolves each citation's content-block index back to its KB section (`collectCitations`) and returns a deduplicated `{id,title}` payload alongside the single collapsed text block (L-014 preserved — `withSingleTextBlock` still runs). `index.html` renders those as an inert "Based on ICC's expert guidance" source-label footer (DOM text nodes only, never `innerHTML` — L-003); **plain labels for now**, care-guide links deferred to the Phase 1 cutover when the guide URLs exist (a `TODO(citation-links)` marks the spot).

**The decision recorded here (the architectural fork chosen, full restructure over additive):** the carpet-science **facts** move out of the system prompt entirely into the citeable document (system prompt 16,035→12,389 chars; no duplication), while the **L-009 claim rules** (machine is the EMV 401; never "WoolSafe approved"; figures are the manufacturer's own; no decibel figure; no "exothermic draws dirt"; no "kills 99.9%") move into a **system-prompt instruction block** (`guardrailsBlock()`), stated as absolute and overriding the reference or any customer message. Rationale: a safety rule placed in a citeable *document* can be quoted but carries no behavioural force — only a *system instruction* binds the model. This split is the new shape of D-006 (one source, two renderings: citeable fact + enforced rule) and is locked by `test/knowledge.test.js` + `test/citations.test.js` (43/43). Verification boundary: unit-verified locally; the live behaviour (model actually citing, the document+citations+tools request shape accepted, the browser render) needs a **Netlify deploy preview** (L-012/L-014), as no `ANTHROPIC_API_KEY` runs on the build machine. **4d** (gated `web_search`, attributed external citations) and **4e** (escalation handoff to the Supabase `messages` table) still follow.

**Addendum (12 June 2026) — Slice 4d (gated/attributed `web_search`) built on `feat/slice4d-web-search`.** The low-stakes lane from the source hierarchy above is now implemented: the Anthropic-hosted `web_search` server tool rides alongside `escalate_to_human` in the chat call, gated three ways — `max_uses: 3` hard-caps spend per request (web search bills at $10 per 1,000 searches, so the worst case is bounded by `max_uses` × the existing 30 msgs/hr/IP rate limit, under £0.75/hr/IP), a **WEB SEARCH (RARE, LOW-STAKES ONLY)** system-prompt block (the L-016 principle: gating rules bind only from the prompt) confines it to practical, no-property-risk gaps and forbids it outright for cleaning/treatment/aftercare/fibre questions (those stay KB-or-escalate, damage-risk escalates first), and `user_location` pins results to Cheltenham. Web citations come back as `web_search_result_location` blocks; `collectCitations` maps them to `{id:null, title, url}` (http/https enforced server-side, deduped by url) next to the unchanged `{id,title}` KB entries, and `renderCitations` in `index.html` renders them as a muted "Looked up on the web" caption of real external links (DOM `createElement` + `setAttribute`, href re-checked against `^https?://`, `target="_blank"` + `rel="noopener noreferrer"`, never `innerHTML` — L-003), satisfying the attributed-external-links half of the 11 June citations decision. `runAssistantTurn` gained the `pause_turn` continuation (append the assistant content verbatim and re-call, no tool_result — the slot the 4b comment reserved), sharing the existing `maxRounds` bound, and `withSingleTextBlock` now leaves a paragraph break where a dropped non-text block sat so search narration never glues to the answer (a deliberate contract change, updated in `test/escalation.test.js`).

**Tool version pinned to `web_search_20250305`, deliberately not the newer `web_search_20260209`:** the 20260209 version (dynamic filtering) does not support `claude-opus-4-5`, which is still the D-007 vision model, so it would 400 every photo turn; its dynamic-filtering also runs code-execution rounds that add latency a live customer chat does not want. Revisit if/when the vision model moves to a 4.6+ model. Two ops notes: **web search must be enabled at organisation level in the Anthropic Console** (Settings → Privacy) for the account behind `ANTHROPIC_API_KEY`, or the tool errors; and adding the tool to the tools array is a **one-time L-002 cache re-warm**, exactly like 4b. Multi-turn note: the client keeps only the collapsed plain-text reply in history (L-014), so `encrypted_content` from search results is never passed back — that simply means a later turn cannot re-cite an earlier turn's search results and searches afresh instead, which is the behaviour we want. Verification boundary: unit-verified (`node --test` 62/62); live behaviour (model actually searching on a low-stakes question, refusing to search on damage-risk, link rendering) needs a **Netlify deploy preview** (L-012), as no `ANTHROPIC_API_KEY` runs on the build machine. **4e** (escalation handoff to the Supabase `messages` table) remains.
