# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** June 2026 (scaffold + roadmap + service-area / field-app decisions; pushed to git)

---

## Current state

- Phase 0 proof of concept is built and functional: single-page site, AI assistant (Sonnet + Opus vision), availability + booking via Netlify Blobs, Resend confirmation emails, PDF job card, password-gated admin dashboard.
- The codebase has already had a security-hardening and prompt-caching pass (see git log). It is in good shape for its size.
- This session added the engineering discipline this repo was missing: `README.md`, `CLAUDE.md`, `ROADMAP.md`, `DECISIONS.md`, `LESSONS_LEARNED.md`, this file, and `docs/DESIGN.md` (the agreed product brief).
- Work is on branch `docs/scaffold-and-roadmap`, off `main`. Not yet merged.

## What was just done

- Reviewed the platform design document and turned it into a phased, RAG-tracked [ROADMAP.md](ROADMAP.md).
- Captured the architectural choices as decision records D-001..D-013 in [DECISIONS.md](DECISIONS.md).
- Seeded [LESSONS_LEARNED.md](LESSONS_LEARNED.md) with eight entries — some from reviewing the current code, some carried pre-emptively from the ASH app.
- Confirmed with Mark and encoded:
  - **Service area (D-011):** Cheltenham + Gloucester core (no surcharge); wider Gloucestershire with a small out-of-area surcharge. Updated the live AI prompt in `chat.js` (service-area block + a pricing line) so the assistant flags the surcharge without inventing a figure.
  - **Field app (D-012):** built concurrently with the website and fully integrated via the shared API — added a dedicated concurrent-track section to the roadmap.
  - **Domain (D-013):** deferred but non-blocking for now.
- Added a Continuity / bus-factor section to [CLAUDE.md](CLAUDE.md) so a stranger could pick this up cold.
- Pushed everything to git so the home machine can pull it.

## Immediate next steps (suggested order)

1. **Get the exact out-of-area surcharge figure and postcode boundary from Mark** (D-011), then encode it so the assistant quotes a concrete number and the server applies it.
2. **Close the Phase 0 hardening gaps before any real-traffic launch** (tracked in ROADMAP Phase 0 table):
   - Set `ALLOWED_ORIGINS` in Netlify (L-001).
   - Rate-limit the booking/availability endpoints (L-006).
   - Verify a Resend sending domain and set real from/operator addresses (L-004).
   - Add a privacy notice to the site (DESIGN §11).
3. **Decide the Phase 1 front-end approach** (hand-built HTML vs Astro — D-001) so the multi-page conversion can start.

## Things to watch / not yet decided

- D-001 front-end tool (Astro vs hand-built) is still open.
- Monorepo restructure (D-014) is the first task of Phase 2 — do it before the API exists so the shared contract is born in `shared/`. Repo may be renamed `icc-site` → `icc-platform` then.
- Exact out-of-area surcharge figure + postcode boundary (D-011) — not yet set; the assistant currently says "small charge, confirmed at booking".
- Domain not yet chosen (D-013) — fine for now, needed before Phase 1 go-live.
- Phase 2 API must be designed for two clients (website + field app) from the start (D-012).
- Whether minimal job state (for the "mark complete → review request" flow) lands in Phase 1 on Blobs or waits for the Supabase backend in Phase 2.
- Account ownership (D-009) — confirm everything is registered under Mark / the business, not personal accounts, before more services are added.

## Local dev reminder

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev
```

Repo is checked out at `C:\Users\ben\icc-site` on this machine.
