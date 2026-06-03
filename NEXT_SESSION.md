# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 3 June 2026 (Phase 0 pre-launch hardening — on branch `hardening/phase0-pre-launch`, PR open into `main`, not yet merged)

---

## Current state

- Phase 0 proof of concept is built and functional: single-page site, AI assistant (Sonnet + Opus vision), availability + booking via Netlify Blobs, Resend confirmation emails, PDF job card, password-gated admin dashboard.
- Engineering scaffold, the phased [ROADMAP.md](ROADMAP.md), the decision log (D-001..D-014), and [LESSONS_LEARNED.md](LESSONS_LEARNED.md) are all merged to `main`.
- **In flight (this session):** Phase 0 pre-launch hardening on branch `hardening/phase0-pre-launch` — PR open, awaiting Ben's deliberate merge (do not merge mid-traffic without sign-off):
  - Per-IP rate limits on `confirm_booking` (5/hr) and `check_availability` (60/hr), alongside the existing chat cap (30/hr) — L-006 closed.
  - Constant-time admin token comparison in `bookings.js`.
  - A privacy notice drafted and linked across `index.html` — **not go-live ready**: the `[to confirm: …]` placeholders need Mark's data-controller details and a data-protection review.
  - Origin check (L-001) deliberately left fail-open — it auto-enforces once `ALLOWED_ORIGINS` is set in Netlify (blocked on the final domain, D-013).
  - First unit tests added: `test/hardening.test.js` (`node --test`, no creds needed).

## What was just done

- Verified the local `C:\Users\ben\icc-site` checkout is a complete, in-sync mirror of GitHub — all three branches level with their remotes, no stale worktrees, nothing uncommitted at risk.
- Implemented and verified the Phase 0 hardening above. Verification run: `node --check` on both functions, `node --test` 8/8 green, and the privacy section rendered + navigation confirmed in a browser. **Not yet verified:** live 429 / email / CORS behaviour against real Blobs — that needs a Netlify deploy preview (there is no local `.env`/CLI on this machine).
- Updated [ROADMAP.md](ROADMAP.md) Phase 0 table, [LESSONS_LEARNED.md](LESSONS_LEARNED.md) L-006 (now resolved), and the [CLAUDE.md](CLAUDE.md) hardening checklist to match.

## Immediate next steps (suggested order)

1. **Merge the `hardening/phase0-pre-launch` PR** once reviewed (deliberate merge; not mid-traffic without sign-off). Then, on a deploy preview, smoke-test the three rate limits (confirm 429s) and that a normal booking still completes end to end.
2. **Phase 1 is starting — decide D-001 (Astro vs hand-built HTML)** before the multi-page conversion begins. This is the active gate.
3. **Fill the privacy-notice placeholders with Mark** (registered name / legal status, postal address, ICO registration, retention period) and get a data-protection review before go-live.
4. **Remaining Phase 0 gaps**, blocked on the domain (D-013) / accounts: set `ALLOWED_ORIGINS` in Netlify (L-001), and verify a Resend sending domain + real from/operator addresses (L-004).
5. **Still blocked on Mark:** exact out-of-area surcharge figure + postcode boundary (D-011); confirm account ownership sits with Mark (D-009).

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
