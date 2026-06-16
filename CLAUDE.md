# ICC Platform — Developer Guide

**Last updated:** June 2026
**Author:** Ben Graham (build lead)
**Client:** Mark McClymont, Intelligent Carpet Cleaning, Cheltenham
**Purpose:** Single source of truth for anyone (human or AI) picking up this codebase. It covers what the platform is, how it is built today, where it is going, the conventions we hold to, and the hard-won gotchas. If you read one file before touching code, read this one, then [NEXT_SESSION.md](NEXT_SESSION.md) for the live state.

This project deliberately follows the same engineering discipline as the sibling ASH inspection app and the PropOS platform. Where a convention already exists there, we reuse it rather than reinventing.

---

## ⚡ READ THIS FIRST — EVERY SESSION

1. Read [NEXT_SESSION.md](NEXT_SESSION.md) for the current state and the immediate next task.
2. Skim [DECISIONS.md](DECISIONS.md) so you do not relitigate a settled architectural choice.
3. Skim [LESSONS_LEARNED.md](LESSONS_LEARNED.md) before working on anything near the chat proxy, bookings, email, or deploy config.
4. Check which phase you are in against [ROADMAP.md](ROADMAP.md). We build phase by phase; do not pull future-phase work forward without a reason recorded in DECISIONS.md.

The full product brief lives in [docs/DESIGN.md](docs/DESIGN.md). That document is the scope reference agreed with Mark. This file is the engineering companion to it.

---

## What this platform is

A one-stop platform for carpet and upholstery cleaning, positioned premium. A customer arrives, gets genuine expert advice from an AI assistant, understands why quality cleaning is worth paying for, receives an accurate quote (optionally from a photo), and books and pays in one place. Mark runs the operational side — jobs, invoices, payments, calendar, repeat-customer marketing — from an admin platform, not from his inbox.

Three principles run through everything (from [docs/DESIGN.md](docs/DESIGN.md) §2):

- Expertise is the product. The AI and the content exist to make ICC visibly more knowledgeable than any local competitor.
- Everything is built to be found. SEO and AI-search visibility are designed in from the structure up.
- The back end is a real business tool, not just a booking inbox.

The Phase 1 public site is live and most of the Phase 2 operational backend is built and live; the roadmap takes it the rest of the way to the full platform. See [ROADMAP.md](ROADMAP.md).

---

## Architecture: where we are vs where we are going

### Where we are now (Phase 1 live, Phase 2 backend live)

The platform has moved past the Phase 0 single-page demonstrator. What is live in production today:

- A multi-page static **Astro** site (`site/`), cut over to production on 15 June 2026 (PR #49). Netlify builds and serves `site/dist`. The old single-page `index.html` is kept at the repo root as the **rollback only** and is no longer served.
- A separate admin dashboard (`admin.html`), signed in with **per-user Supabase Auth** (Slice 5d).
- Netlify serverless functions: `chat.js` (AI proxy, availability, booking confirmation, email, PDF job card), `bookings.js` (admin booking list) and `handoffs.js` (escalation queue + draft/send), plus `v1-quote.js` (stateless pricing) and the Supabase/auth helpers.
- Booking storage in **Supabase Postgres** (`BOOKINGS_STORE=postgres`, enabled 14 June 2026); Netlify Blobs now holds only the rate-limit windows and legacy test bookings.
- Transactional email through Resend (sending domain `intelligentclean.co.uk` verified).
- AI through the Claude API, called only from the serverless functions so keys never reach the browser.

### Target (Phases 2+)

The platform described in the design doc needs persistent relational data, authenticated access, and background processing, which Netlify Blobs cannot carry. The agreed target (see [DECISIONS.md](DECISIONS.md) D-001..D-006):

- A multi-page static front end for the public site (hand-built HTML or Astro), still on Netlify, fully crawlable.
- A managed Postgres backend (Supabase) for the business platform: relational data, admin auth, file storage for job photos, and an API.
- API-first design. The website is one client of the API; the field app is another. Plan endpoints so a second client is a small step, not a rebuild.
- Serverless functions remain the home for the AI proxy, email, and calendar writes — keys stay server-side.

The field app is a concurrent, fully-integrated client, not a deferred final phase (D-012). It is not designed yet, but every backend decision from Phase 2 onward must assume two equal clients (website + app) consuming the same documented, versioned API. Keep all business logic server-side so the two never diverge. See [ROADMAP.md](ROADMAP.md) "Field app — concurrent track".

The public marketing site and the operational platform are separated cleanly, share the same database where it makes sense, and talk through a documented API.

---

## Infrastructure Overview

| Service | Purpose | Notes |
|---------|---------|-------|
| **Netlify** | Static hosting + serverless functions | Site `super-frangollo-c3a14a` (super-frangollo-c3a14a.netlify.app); auto-deploys `main` (confirm branch in Netlify settings) |
| **Netlify Blobs** | Rate-limit windows + legacy bookings | Bookings moved to Supabase (Slice 5b, D-021, **ENABLED 14 June 2026** via `BOOKINGS_STORE=postgres`); Blobs now holds only past test bookings (still shown via the admin dual-store read) and is the rollback target (unset the flag) |
| **Anthropic (Claude)** | AI assistant — chat + vision | Called server-side only |
| **Resend** | Transactional email (confirmations) | Sandbox domain until a sending domain is verified |
| **GitHub** | Source control | https://github.com/randommonicle/icc-site (private) |
| **Stripe** | Payments — deposits + balances | Phase 3 (D-004), not yet integrated |
| **Supabase** | Relational backend + auth + storage | Stood up + live (D-009 addendum): hosted `icc-platform`, London. Carries escalation handoffs (5a) and **live bookings (5b, ENABLED 14 June)** in `jobs`/`customers`. Auth + photo Storage still to come (5d / photos) |

When a service is added, add a row here and a decision record in DECISIONS.md.

---

## Environment Variables

Defined in [.env.example](.env.example) — copy to `.env` for local dev, or set each value in Netlify → Site settings → Environment variables. Never commit the real `.env` (it is git-ignored).

### Required

```
ANTHROPIC_API_KEY=    # Claude API key for the AI assistant
RESEND_API_KEY=       # Resend, for booking confirmation emails
ADMIN_SECRET=         # Bearer token the admin dashboard sends to /api/bookings
NETLIFY_SITE_ID=      # Needed for Blobs when deploys do not auto-configure context
NETLIFY_TOKEN=        # Personal token for Blobs auth
```

### Optional

```
OPERATOR_EMAIL=       # Where new-booking notifications go (defaults to a fallback)
OPERATOR_FROM=        # From-address for operator emails (sandbox default until domain verified)
CUSTOMER_FROM=        # From-address for customer confirmations
ALLOWED_ORIGINS=      # Comma-separated origin allowlist for /api/chat. When unset, the
                      # function fails OPEN and relies on the per-IP rate limit. SET THIS
                      # before launch (see LESSONS_LEARNED.md L-001).
```

---

## Project Structure

### Target (monorepo, from Phase 2 — D-014)

The whole platform lives in this one repo: the public site, the field app, the backend/functions, and a shared API contract. Created when Phase 2 starts, before the API exists to consume.

```
icc-platform/                   # (currently named icc-site; rename when convenient)
├── site/                       # public multi-page static site (Astro or HTML)
├── app/                        # field app (Capacitor, like the ASH app)
├── functions/ (or server/)     # API + AI proxy + serverless
├── shared/                     # API contract types + AI knowledge source (D-006, D-012)
├── supabase/migrations/
└── docs/ + CLAUDE.md, ROADMAP.md, DECISIONS.md, LESSONS_LEARNED.md, NEXT_SESSION.md (root)
```

Netlify's build is scoped to `site/` (and `shared/`) so app-only commits do not trigger a site deploy. Site and app are worked on in separate sessions via branches (D-010) or git worktrees.

### Current layout (Phase 1 live, Phase 2 backend)

```
icc-site/                        # monorepo layout (D-014): site/ + server/ + shared/ + supabase/
├── index.html                  # Phase 0 single-page site — RETAINED AS ROLLBACK ONLY (no longer served)
├── admin.html                  # Bookings + handoffs dashboard; per-user Supabase Auth (Slice 5d)
├── logo.jpg                    # Brand logo (extracted from inline base64 — keep as a real file)
├── netlify.toml                # builds site/dist; functions = server/netlify/functions; redirects + headers
├── package.json                # Node 24 (D-017); deps: @netlify/blobs, @supabase/supabase-js, pdfkit; "test": node --test
├── .env.example                # Documented env vars — copy to .env for local dev
├── site/                       # LIVE public Astro site (cut over 15 June 2026, PR #49) — Netlify builds site/dist
├── server/                     # backend tier (D-014) — serverless functions
│   └── netlify/functions/
│       ├── chat.js             # AI proxy + availability + booking confirmation + email + PDF
│       ├── bookings.js         # Admin-only: list all bookings (Postgres jobs + legacy Blobs)
│       ├── handoffs.js         # Admin-only: escalation queue + AI draft → send reply (Slice 5e-2)
│       ├── bookingsStore.js    # Postgres booking read/write mappers (Slice 5b)
│       ├── v1-quote.js         # Stateless server-side pricing endpoint (Slice 3)
│       ├── adminAuth.js        # Supabase-Auth JWT gate for the admin functions (Slice 5d)
│       └── supabaseClient.js   # Service-role Supabase client singleton
├── shared/                     # config single source: models, pricing, service area, knowledge (D-006/D-007)
├── supabase/                   # migrations + pgTAP tests (D-002)
├── scripts/                    # ops utilities (e.g. delete-booking.js)
├── app/                        # field-app placeholder (D-012) — empty until the Phase 2 API exists
├── test/                       # node --test suite
└── docs/
    └── DESIGN.md               # The agreed product brief (scope reference for Mark)

# Doc set (this discipline):
# README.md  CLAUDE.md  ROADMAP.md  DECISIONS.md  LESSONS_LEARNED.md  NEXT_SESSION.md
```

---

## Architecture: Key Rules

### 1. Secrets are server-side only
Anthropic, Resend, and the admin secret live in the serverless functions and Netlify env vars. The browser never sees an API key. Any new integration (Stripe, Supabase service key) follows the same rule.

### 2. Model routing — Sonnet for text, Opus only for vision
`chat.js` uses Sonnet for normal chat and switches to Opus only when the most recent user message contains an image. Opus is expensive and only justified where visual understanding matters. This mirrors the ASH/PropOS rule. When we add a backend, model names should live in one place (a single source of truth), never hardcoded in scattered call sites (D-007).

### 3. Treat all AI output as untrusted when rendering
Customer-facing and admin-facing rendering of AI responses and booking fields is built with DOM nodes / `escHtml`, never `innerHTML`. A prompt-injected reply must render as inert text. Do not regress this (see LESSONS_LEARNED.md L-003).

### 4. The server validates every booking
The chat client cannot be trusted — anyone can POST directly to `/api/chat` with `action=confirm_booking`. `validateBooking()` in `chat.js` enforces required fields, formats, date window, trading-hours fit, a price floor/ceiling, image size/type, and length caps. Extend this function rather than trusting the client when new fields are added.

### 5. AI knowledge is one maintainable source
The science/history content on the website and the assistant's knowledge should come from the same place so they never drift (D-006). The vetted facts now live in `shared/config/knowledge.js` as structured `knowledgeSections`, fed to the assistant as a **citeable Citations document** (Slice 4c) and, at the Phase 1 cutover, to the site care-guides. **Split by kind, not topic (L-016):** facts/reference prose go in the citeable document; the L-009 claim rules and the grounding/escalation directive go in the system prompt (`knowledge.guardrailsBlock()`), because a rule in a citeable document is quotable but not binding. Never duplicate a fact into both the prompt and the document.

### 6. SEO is structural, not bolted on
Decisions that affect crawlability (multi-page vs single-page, titles/meta per page, structured data, sitemap) are first-class, not afterthoughts. This is why Phase 1 is "public site and findability" and why the single-file PoC becomes a multi-page site (D-001).

### 7. Consent is a hard requirement, not a feature
Any marketing-email capability must record per-client consent (PECR soft opt-in for existing customers) and honour unsubscribes automatically. This gates Phase 4 — do not ship re-engagement campaigns without it (D-008, [docs/DESIGN.md](docs/DESIGN.md) §11).

---

## Feature Deep-Dives (current code)

### Business facts that live in the code
These are real business rules encoded in `chat.js` (the system prompt) — keep them in sync with reality and with [DECISIONS.md](DECISIONS.md):
- **Service area (D-011):** Cheltenham, Gloucester and Winchcombe are core (no travel charge). Everywhere else in Gloucestershire (Stroud, Tewkesbury, Cirencester and the surrounding GL towns) carries a **flat £15 + VAT out-of-area surcharge** (confirmed by Mark, June 2026). The assistant quotes the £15 + VAT concretely and includes it in the itemised quote for out-of-area addresses. Remaining: the precise postcode boundary for "out of area" and **server-side enforcement** — `validateBooking` currently only bounds the total price (£30–£5000), so the surcharge lives in the assistant's quote, not the server; encode the boundary + surcharge in `validateBooking` in Phase 2 (pairs with moving pricing/area logic server-side, D-007).
- **Hours, slots, pricing, deposit:** all in the `STATIC_SYSTEM_PROMPT`. Pricing is "+ VAT" throughout. A 10% non-refundable deposit secures a slot.

### AI chat flow (`server/netlify/functions/chat.js` + `site/src/pages/book.astro`)
The live chat client is the Astro `book.astro` since the Phase 1 cutover; the retained `index.html` rollback carries the same client mechanics (faithfully ported, same `/api/chat` contract).
- The browser keeps `conversationHistory` and POSTs it to `/api/chat` with a randomised assistant name (Jamie/Alex/Sam/Ellie/Tom).
- The system prompt is sent in two blocks: a large static block (business rules, pricing, method, booking script, and the L-009 claim guardrails) with `cache_control: ephemeral`, and a small dynamic block (assistant name, today's date, the pre-computed list of bookable dates). The split keeps the cache prefix stable so repeat messages in a 5-minute window pay roughly 10% of normal input cost (see LESSONS_LEARNED.md L-002). The carpet-science **facts** are no longer in this prompt: since Slice 4c they ride as a `cache_control`'d **citeable Citations document** on the first user turn (`withKnowledgeDocument`), so the assistant grounds and cites its claims and the customer sees the source (rendered as inert labels in the chat client, L-003). The server resolves each citation back to its KB section (`collectCitations`) and still collapses the reply to one text block (L-014).
- Two tools ride on every chat call (a byte-stable `TOOLS` constant, L-002): `escalate_to_human` (Slice 4b — out-of-KB, damage-risk, uncitable, or customer-request questions hand over to Mark instead of guessing) and the Anthropic-hosted `web_search` (Slice 4d — D-019's low-stakes lane: `max_uses: 3`, results localised to Cheltenham, prompt-gated to practical no-property-risk gaps only, never cleaning/treatment/aftercare advice). Web answers come back with `web_search_result_location` citations which `collectCitations` resolves to `{title, url}` and the chat client renders as safe external links ("Looked up on the web", L-003). `runAssistantTurn` resolves custom tool rounds and `pause_turn` continuations server-side, bounded by `maxRounds`. Ops note: web search must be enabled org-side in the Anthropic Console for the `ANTHROPIC_API_KEY` account.
- Dates are never calculated by the model. The function pre-computes the bookable date list (Mon–Sat, 7+ days out) and the model only quotes from it.
- Per-IP rate limit on the chat path: 30 messages/hour, sliding window in Blobs, fails open if Blobs are unavailable.

### Booking flow
- The assistant emits a `BOOKING_READY:{json}` block once the customer confirms. The client parses it, calls `check_availability`, then `confirm_booking`.
- `confirm_booking` validates, blocks the slots in Blobs (keyed by date), stores the full booking record + index, builds a Google Calendar link, generates a PDF job card (pdfkit, includes a RAMS risk assessment), and emails both Mark and the customer via Resend.
- Availability and booking write through Blobs date keys; concurrent double-booking is guarded by a conflict check before write.

### Admin dashboard (`admin.html` + `server/netlify/functions/bookings.js`)
- **Admin auth is per-user Supabase Auth (Slice 5d, live).** The operator signs in with email + password via the Supabase Auth password grant; the session access token is held in memory only (cleared on logout) and sent as `Authorization: Bearer <jwt>`. `adminAuth.requireAdmin` verifies the JWT (`auth.getUser`) and checks the `ADMIN_EMAILS` allowlist on top of the project's disabled sign-ups. The legacy `ADMIN_SECRET` is no longer read by the app.
- `bookings.js` returns all bookings (newest first), reading the Postgres `jobs` store plus legacy Blobs (Slice 5b). `handoffs.js` serves the handoff queue and the draft→send lifecycle (Slice 5e-2). Cards render customer/job detail, photo, AI assessment, price, and a calendar link.

### PDF job card (`generateJobCardPDF` in `chat.js`)
- pdfkit, A4, branded header, sections for customer/job/carpet/assessment/RAMS/pricing/photo. Dates are parsed as local Y-M-D components because Netlify functions run in UTC (see LESSONS_LEARNED.md L-005).

---

## Working Discipline

These are the same standards we hold on the ASH app and PropOS. They are not optional.

### Branching and deploys
- Stage all work on branches off `main`. Never push directly to `main`.
- Ben deploys by deliberate merge; always stage on a branch and merge only on his go-ahead. **Current status (June 2026): the site is deployed on Netlify but pre-launch** — not on the `intelligentclean.co.uk` domain and not marketed, so real booking traffic is effectively nil and a merge to `main` is low-risk. The hard rule **"never merge mid-traffic without explicit sign-off" tightens back up at launch** (domain cutover + marketing); until then, merge verified, branch-based work on Ben's go-ahead without heavy ceremony.
- One logical change per branch; descriptive branch names (e.g. `feat/area-pages`, `docs/scaffold-and-roadmap`, `hardening/booking-rate-limit`).

### Tests and verification
- Real services in tests, no mocks. When a test suite is added (Phase 2 onward), it exercises real code paths the way the ASH suites do. Fix the code, never skip the test.
- For anything observable in a browser, verify it actually works before claiming it does. Do not ask the user to check manually what you can check yourself.

### Audits and reviews
- Audits are honest, critical, and read-only. Track findings RAG (red/amber/green), reference the relevant standard (GDPR/PECR, accessibility, security), and run in phases with a review gate between them. Do not soften findings.

### Documentation maintenance
- Keep this doc set current. Every architectural choice → a record in [DECISIONS.md](DECISIONS.md). Every hard-won gotcha → an entry in [LESSONS_LEARNED.md](LESSONS_LEARNED.md). At the end of a working session, update [NEXT_SESSION.md](NEXT_SESSION.md) so the next person (or AI) can continue cold.
- Writing style: clean prose. Use bold for structure (labels, headings, table headers), not to emphasise random words or sentences in body text.

### Ownership
- All accounts (domain, Netlify, Anthropic, Resend, Stripe, Supabase, Google Business Profile) should be owned by Mark / the business from the start, so nothing needs transferring later (D-009, [docs/DESIGN.md](docs/DESIGN.md) §13).

---

## Deploy Process (Phase 0)

1. Push the branch and open a PR into `main`.
2. Merge to `main` only when reviewed and approved (and not mid-traffic without sign-off).
3. Netlify auto-deploys `main`. Confirm the production deploy URL serves the change.
4. Verify env vars are present in Netlify before relying on any function (`chat.js` returns a 500 if `ANTHROPIC_API_KEY` is missing; `bookings.js` returns 401/500 if `ADMIN_SECRET` is missing).

There is no build step in Phase 0 (static files + functions). When the front end moves to Astro (Phase 1/2), document the build command here.

---

## Known Issues / Hardening Checklist

Tracked in full in [LESSONS_LEARNED.md](LESSONS_LEARNED.md) and the roadmap. The live priorities before any real-traffic launch:

- [ ] **Set `ALLOWED_ORIGINS`** in Netlify. The chat origin check fails open by default; the rate limits are currently the only defence on the AI cost path (L-001). Blocked on the final domain (D-013); the code auto-enforces strict mode once the env var is set (`chat.js`).
- [x] **Rate-limit the booking/availability endpoints.** Done — per-IP caps on all three POST actions (chat 30/hr, `confirm_booking` 5/hr, `check_availability` 60/hr), fail-open if Blobs are unavailable (L-006).
- [x] **Verify a Resend sending domain** and set `OPERATOR_EMAIL` / `OPERATOR_FROM` / `CUSTOMER_FROM` to real addresses. **Done (10 June 2026):** `intelligentclean.co.uk` verified in Resend (DKIM/SPF/bounce MX), the addresses set in Netlify and confirmed delivering end-to-end (L-004, L-015). The separate handoff-reply identity work is the A4 item below.
- [ ] **Handoff-reply email identity (review finding A4).** Code-side **done**: the outbound customer reply from `handoffs.js` (Slice 5e-2) carries controller identification (trading name, business contact), a privacy-notice link, and a real `Reply-To` (UK GDPR Arts.13/14). Remaining before live traffic: set `CUSTOMER_FROM` (verified domain), `CUSTOMER_REPLY_TO` and `PUBLIC_SITE_URL` in Netlify, and Mark must complete the privacy-notice controller details. Flag `TODO(prelaunch/email-identity)` now names only the env + data steps.
- [ ] **Handoff-lead retention (review finding A5, D-023).** Erasure **mechanism** done: the admin "Erase lead" action hard-deletes a `human_handoff` row (UK GDPR Art.17). Full erasure is a documented two-part procedure (DB delete **plus** Mark deleting the matching escalation email; verify requester identity first, Art.12(6)). Remaining: the timed storage-limitation purge (Art.5(1)(e)) — confirm the retention period with Mark/DP (proposed 6 months) and wire a scheduled purge of old `human_handoff` rows (`TODO(D-008/retention)`).
- [ ] **Add a privacy notice** to the public site before collecting data at any scale. Drafted and linked across the site; Mark must fill the `[to confirm: …]` data-controller details in the Astro privacy page (`site/src/pages/privacy.astro`) and get a data-protection review before go-live ([docs/DESIGN.md](docs/DESIGN.md) §11).
- [x] **Constant-time compare** for the admin token — done (SHA-256 + `crypto.timingSafeEqual` in `bookings.js`).

---

## Continuity and onboarding (bus factor)

This project is deliberately built so that anyone could pick it up and carry on with no handover conversation — if Ben were hit by a bus tomorrow, the docs and the code are the handover. If you are that person, here is the whole picture:

- **What it is and why:** read this file, then [docs/DESIGN.md](docs/DESIGN.md) (the client brief), then [ROADMAP.md](ROADMAP.md) (what to build next and in what order).
- **Why things are the way they are:** [DECISIONS.md](DECISIONS.md). Do not undo a decision without reading its record first.
- **What will bite you:** [LESSONS_LEARNED.md](LESSONS_LEARNED.md). Read it before touching the chat proxy, bookings, email, or deploy config.
- **Where you left off:** [NEXT_SESSION.md](NEXT_SESSION.md), updated at the end of every session.
- **The client:** Mark McClymont, Intelligent Carpet Cleaning, Cheltenham — phone 01242 279590, email hello@intelligentclean.co.uk.
- **Where the code runs:** GitHub `randommonicle/icc-site` → Netlify site `super-frangollo-c3a14a` (super-frangollo-c3a14a.netlify.app) auto-deploys `main`. Static site + serverless functions; no build step in Phase 0.
- **Where the secrets are:** Netlify → Site settings → Environment variables (never in git). The list and what each does is in [.env.example](.env.example) and the Environment Variables section above. These are the only things not reconstructable from the repo — make sure Mark owns the accounts that hold them (D-009).
- **The data:** Phase 0 bookings live in Netlify Blobs (store `icc-bookings`). From Phase 2 they live in Supabase. There is no other hidden state.

Keeping this true is part of the job: every session, leave the docs in a state where a stranger could continue. That is the standard, not a nice-to-have.

## Pointers

- [docs/DESIGN.md](docs/DESIGN.md) — the agreed product brief and scope reference.
- [ROADMAP.md](ROADMAP.md) — the phased forward plan with RAG status.
- [DECISIONS.md](DECISIONS.md) — architectural decision records (D-NNN).
- [LESSONS_LEARNED.md](LESSONS_LEARNED.md) — gotchas and how we fixed them (L-NNN).
- [NEXT_SESSION.md](NEXT_SESSION.md) — live handover: current state + next task.
- [README.md](README.md) — short orientation and quick start.
