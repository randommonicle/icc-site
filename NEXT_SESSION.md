# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 3 June 2026 (end of session — Phase 0 hardening + assistant accuracy fix merged & deployed; Phase 1 Astro site in progress on a branch)

---

## Current state

- **Phase 0 PoC** is live: single-page `index.html` + AI assistant (`chat.js`), availability + booking via Netlify Blobs, Resend emails, PDF job card, admin dashboard.
- **Merged to `main` this session (both deploy via Netlify — confirm the production deploy went green):**
  - **Phase 0 hardening** (PR #1): per-IP rate limits on `confirm_booking` (5/hr), `check_availability` (60/hr) and chat (30/hr) — L-006 closed; constant-time admin token compare in `bookings.js`; a **draft** privacy notice linked across `index.html`; first unit tests (`test/hardening.test.js`).
  - **Assistant accuracy fix** (PR #2): corrected the `chat.js` system prompt after a verified research pass — machine is **EMV 401** (+ the TC 170 spinner), removed the **"WoolSafe approved"** claim, removed the **76 dB** claim, attributed the 80%-water / 30–60-min / exothermic lines to the manufacturer, and made the BS EN 1040 wording accurate. Guardrails added so the assistant won't drift back.
- **Phase 1 (public Astro site) — IN PROGRESS on branch `feat/phase1-public-site` (pushed, NOT merged, NOT cut over).** The live site still serves the Phase 0 `index.html`; the Astro build is developed in `site/` and only goes live at the cutover PR.

## Phase 1 progress (branch `feat/phase1-public-site`)

- **Decision D-001 resolved: Astro** (static SSG). Recorded in DECISIONS.md (on the branch).
- **7 pages built and building clean** (`cd site && npm run build`): `/` (home), `/services` (full pricing), `/about`, `/contact`, `/history` (new expert content), `/privacy`, `/book` (the AI chat assistant ported as an inline island — same `/api/chat` contract).
- Shared `BaseLayout` (per-page SEO head + canonical + OG + site-wide **LocalBusiness JSON-LD**), `Nav`, `Footer`; brand CSS ported faithfully; `@astrojs/sitemap` wired.
- **Verified Texatherm knowledge brief** at `docs/TEXATHERM_KNOWLEDGE_BRIEF.md` (on the branch) — the **D-006 single source** for the guides + the assistant. Built from a deep-research pass (24 sources, adversarial verification).

## What was just done (this session)

- Confirmed the local checkout mirrors GitHub; closed the Phase 0 hardening; chose Astro and scaffolded the Phase 1 site (7 pages, parallel subagents built 4 of them); ran a verified Texatherm research pass and corrected the live assistant's unsupported claims.
- **WoolSafe resolved:** Texatherm is NOT WoolSafe-certified (verified against the WoolSafe directory + Texatherm's own product pages, which carry no mark or certificate number). The confusion was Texatherm's own in-house "safe for use on wool" tick vs the independent WoolSafe mark. **Agreed messaging: we may say "safe for use on wool"; we never say "WoolSafe approved".** A genuine WoolSafe Approved Service Provider badge is a possible FUTURE USP (Fibre Care Specialist training + an approved chemical range for wool jobs; the Texatherm machine is no obstacle, as WoolSafe does not certify machines/methods).

## Immediate next steps (suggested order)

1. **Continue Phase 1 on `feat/phase1-public-site`.** FIRST `git merge main` into it (to pull in the hardening + assistant fix), then build, in order:
   - **Care guides** — a content collection, sourced from `docs/TEXATHERM_KNOWLEDGE_BRIEF.md`, following the agreed wool stance (accuracy-first; "safe for use on wool" yes, "WoolSafe" no; attribute manufacturer figures).
   - **Area pages** — Cheltenham + Gloucester (core, no surcharge); wider-Gloucestershire towns with the honest D-011 surcharge wording.
   - **SEO layer** — per-page FAQ JSON-LD, finalise sitemap/robots.
   - **Cutover PR** — point `netlify.toml` build at `site/` (`astro build`, publish `site/dist`), carry over the `/api/*` redirects + security headers, then Ben's deliberate merge.
2. **Privacy notice go-live:** fill the `[to confirm: …]` placeholders (registered name/status, postal address, ICO registration, retention) + a data-protection review — applies to BOTH the live `index.html` notice and the Astro `/privacy` page.
3. **Set `ALLOWED_ORIGINS`** in Netlify once the domain is chosen (L-001), and verify a Resend sending domain (L-004).
4. **For Mark:** out-of-area surcharge figure + boundary (D-011); the WoolSafe Service Provider route (future USP); Texatherm SDS PDFs (real pH data) + an EMV 401 spec sheet; account ownership (D-009); domain (D-013).

## Things to watch / not yet decided

- **`feat/phase1-public-site` is behind `main`** after the two merges — merge `main` into it before continuing so the corrected `chat.js` + hardening are included.
- The Astro site is **not cut over** — `netlify.toml` still serves the Phase 0 root; changing the publish target is the deliberate go-live moment.
- **The Texatherm brief is the single source (D-006)** — the guides AND the assistant must agree with it; the assistant prompt is now aligned, the guides are next.
- Monorepo restructure (D-014) is Phase 2's first task; the Astro site already lives in `site/` as a small, deliberate pull-forward.
- Domain (D-013), surcharge figure (D-011), and account ownership (D-009) all still open.

## Local dev reminder

```bash
# Phase 0 functions (repo root):
npm install
cp .env.example .env   # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev

# Phase 1 Astro site (on branch feat/phase1-public-site):
cd site && npm install && npm run build   # -> site/dist ; use `npm run dev` for a live preview
```

Repo is checked out at `C:\Users\ben\icc-site` on this machine. The in-progress Phase 1 work lives on branch `feat/phase1-public-site`.
