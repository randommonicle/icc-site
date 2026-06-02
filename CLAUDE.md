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

We are at the very start: a working proof of concept (Phase 0). The roadmap takes it to a full platform in five phases. See [ROADMAP.md](ROADMAP.md).

---

## Architecture: where we are vs where we are going

### Current (Phase 0 — proof of concept)

A zero-cost demonstrator, and correct for what it is today:

- Single-file public site (`index.html`) plus a separate admin page (`admin.html`), static-hosted on Netlify.
- Two Netlify serverless functions: `chat.js` (AI proxy, availability, booking confirmation, email, PDF job card) and `bookings.js` (admin-only booking list).
- Booking storage in Netlify Blobs (a key-value store).
- Transactional email through Resend.
- AI through the Claude API, called only from the serverless functions so keys never reach the browser.

### Target (Phases 2+)

The platform described in the design doc needs persistent relational data, authenticated access, and background processing, which Netlify Blobs cannot carry. The agreed target (see [DECISIONS.md](DECISIONS.md) D-001..D-006):

- A multi-page static front end for the public site (hand-built HTML or Astro), still on Netlify, fully crawlable.
- A managed Postgres backend (Supabase) for the business platform: relational data, admin auth, file storage for job photos, and an API.
- API-first design. The website is one client of the API; the future field app is another. Plan endpoints so a second client is a small step, not a rebuild.
- Serverless functions remain the home for the AI proxy, email, and calendar writes — keys stay server-side.

The public marketing site and the operational platform are separated cleanly, share the same database where it makes sense, and talk through a documented API.

---

## Infrastructure Overview

| Service | Purpose | Notes |
|---------|---------|-------|
| **Netlify** | Static hosting + serverless functions | Auto-deploys on push (confirm branch in Netlify settings) |
| **Netlify Blobs** | Booking + slot storage (Phase 0 only) | Migrate to Supabase in Phase 2 (D-002) |
| **Anthropic (Claude)** | AI assistant — chat + vision | Called server-side only |
| **Resend** | Transactional email (confirmations) | Sandbox domain until a sending domain is verified |
| **GitHub** | Source control | https://github.com/randommonicle/icc-site (private) |
| **Stripe** | Payments — deposits + balances | Phase 3 (D-004), not yet integrated |
| **Supabase** | Relational backend + auth + storage | Phase 2 (D-002), not yet stood up |

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

```
icc-site/
├── index.html                  # Public single-page site (hero, services, about, booking, chat client)
├── admin.html                  # Password-gated bookings dashboard (Bearer token, in-memory only)
├── logo.jpg                    # Brand logo (extracted from inline base64 — keep as a real file)
├── netlify.toml                # Redirects (/api/* → functions, /admin) + security headers
├── package.json                # Node 20; deps: @netlify/blobs, pdfkit
├── .env.example                # Documented env vars — copy to .env for local dev
├── netlify/
│   └── functions/
│       ├── chat.js             # AI proxy + availability + booking confirmation + email + PDF
│       └── bookings.js         # Admin-only: list all bookings from Blobs
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
The science/history content on the website and the assistant's system-prompt knowledge should come from the same place so they never drift (D-006). Today the system prompt is inline in `chat.js`; as content grows, factor it into a shared structured source rather than duplicating prose.

### 6. SEO is structural, not bolted on
Decisions that affect crawlability (multi-page vs single-page, titles/meta per page, structured data, sitemap) are first-class, not afterthoughts. This is why Phase 1 is "public site and findability" and why the single-file PoC becomes a multi-page site (D-001).

### 7. Consent is a hard requirement, not a feature
Any marketing-email capability must record per-client consent (PECR soft opt-in for existing customers) and honour unsubscribes automatically. This gates Phase 4 — do not ship re-engagement campaigns without it (D-008, [docs/DESIGN.md](docs/DESIGN.md) §11).

---

## Feature Deep-Dives (current code)

### AI chat flow (`netlify/functions/chat.js` + `index.html`)
- The browser keeps `conversationHistory` and POSTs it to `/api/chat` with a randomised assistant name (Jamie/Alex/Sam/Ellie/Tom).
- The system prompt is sent in two blocks: a large static block (business knowledge, pricing, method, booking script) with `cache_control: ephemeral`, and a small dynamic block (assistant name, today's date, the pre-computed list of bookable dates). The split keeps the cache prefix stable so repeat messages in a 5-minute window pay roughly 10% of normal input cost (see LESSONS_LEARNED.md L-002).
- Dates are never calculated by the model. The function pre-computes the bookable date list (Mon–Sat, 7+ days out) and the model only quotes from it.
- Per-IP rate limit on the chat path: 30 messages/hour, sliding window in Blobs, fails open if Blobs are unavailable.

### Booking flow
- The assistant emits a `BOOKING_READY:{json}` block once the customer confirms. The client parses it, calls `check_availability`, then `confirm_booking`.
- `confirm_booking` validates, blocks the slots in Blobs (keyed by date), stores the full booking record + index, builds a Google Calendar link, generates a PDF job card (pdfkit, includes a RAMS risk assessment), and emails both Mark and the customer via Resend.
- Availability and booking write through Blobs date keys; concurrent double-booking is guarded by a conflict check before write.

### Admin dashboard (`admin.html` + `netlify/functions/bookings.js`)
- Password entered at login is sent as `Authorization: Bearer <pw>` and held in memory only (cleared on refresh/logout — nothing in localStorage).
- `bookings.js` compares the token to `ADMIN_SECRET` and returns all bookings (newest first). Cards render customer/job detail, photo, AI assessment, price, and a calendar link.

### PDF job card (`generateJobCardPDF` in `chat.js`)
- pdfkit, A4, branded header, sections for customer/job/carpet/assessment/RAMS/pricing/photo. Dates are parsed as local Y-M-D components because Netlify functions run in UTC (see LESSONS_LEARNED.md L-005).

---

## Working Discipline

These are the same standards we hold on the ASH app and PropOS. They are not optional.

### Branching and deploys
- Stage all work on branches off `main`. Never push directly to `main`.
- Ben deploys by deliberate merge. Do not merge to `main` (and therefore trigger a Netlify production deploy) while the site is live and taking real bookings, without Ben's explicit go-ahead.
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

- [ ] **Set `ALLOWED_ORIGINS`** in Netlify. The chat origin check fails open by default; the rate limit is currently the only defence on the AI cost path (L-001).
- [ ] **Rate-limit the booking/availability endpoints.** Only the chat path is throttled today, so a direct POST loop could block calendar slots (slot-griefing). Add a per-IP cap or lightweight challenge (L-006).
- [ ] **Verify a Resend sending domain** and set `OPERATOR_EMAIL` / `OPERATOR_FROM` / `CUSTOMER_FROM` to real addresses. Remember: "accepted by Resend" is not "delivered" (L-004).
- [ ] **Add a privacy notice** to the public site before collecting data at any scale ([docs/DESIGN.md](docs/DESIGN.md) §11).
- [ ] **Constant-time compare** for the admin token (minor; single-operator dashboard).

---

## Pointers

- [docs/DESIGN.md](docs/DESIGN.md) — the agreed product brief and scope reference.
- [ROADMAP.md](ROADMAP.md) — the phased forward plan with RAG status.
- [DECISIONS.md](DECISIONS.md) — architectural decision records (D-NNN).
- [LESSONS_LEARNED.md](LESSONS_LEARNED.md) — gotchas and how we fixed them (L-NNN).
- [NEXT_SESSION.md](NEXT_SESSION.md) — live handover: current state + next task.
- [README.md](README.md) — short orientation and quick start.
