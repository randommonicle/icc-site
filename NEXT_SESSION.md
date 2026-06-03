# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 3 June 2026 (end of session — care-guides increment + a staged-content accuracy fix, both on the Phase 1 branch; `main` merged into the branch)

---

## Current state

- **Phase 0 PoC** is live: single-page `index.html` + AI assistant (`chat.js`), availability + booking via Netlify Blobs, Resend emails, PDF job card, admin dashboard. The live `index.html` marketing copy is clean of the Texatherm claim issues (verified this session).
- **`main`** carries the Phase 0 hardening (PR #1), the assistant accuracy fix (PR #2), and the previous handover + L-009 (PR #3). Nothing new was merged to `main` this session.
- **Phase 1 (public Astro site) — IN PROGRESS on branch `feat/phase1-public-site`.** This branch now has **`main` merged in** (so it includes the hardening + corrected `chat.js`), and two new commits from this session (below). It is **still local / not pushed, not merged, not cut over** — the live site still serves the Phase 0 `index.html`.

## Phase 1 progress (branch `feat/phase1-public-site`)

- **Decision D-001 resolved: Astro** (static SSG).
- **8 pages building clean** (`npm run build --prefix site`, 11 routes incl. guides): `/`, `/services`, `/about`, `/contact`, `/history`, `/privacy`, `/book`, and now **`/guides`** (index + 3 guide pages).
- Shared `BaseLayout` (per-page SEO head + canonical + OG + site-wide **LocalBusiness JSON-LD**, plus a new optional `<slot name="head">` for per-page structured data), `Nav` (now includes a **Guides** link), `Footer`; brand CSS ported; `@astrojs/sitemap` wired (sitemap now lists the guide URLs).
- **Care guides content collection** (`src/content.config.ts` + `src/content/guides/*.md`): a glob-loaded Astro collection rendered through one template (`pages/guides/[slug].astro`) with **Article + FAQPage JSON-LD** and a visible FAQ; listing at `pages/guides/index.astro`. Three guides so far: cleaning wool carpets, which stains are permanent, low-moisture vs hot-water extraction.
- **Verified Texatherm knowledge brief** at `docs/TEXATHERM_KNOWLEDGE_BRIEF.md` — the **D-006 single source** for the guides + the assistant.

## What was just done (this session)

- Pulled everything, read the handover + lessons, merged `main` into `feat/phase1-public-site`.
- **Fixed staged-content accuracy drift (commit `ba9bd70`).** `services.astro` and `history.astro` still carried the pre-correction Texatherm marketing as fact — "WoolSafe approved", the exothermic "draws dirt from the base of the fibres" mechanism, flat "30–60 min" / "80% less water", "the only safe professional approach", "pH-neutral / no sticky residue", and "Biocidal sanitiser certified to BS EN 1040 on every clean". Same class of claim PR #2 stripped from the assistant; the **site had drifted from the brief** even though the assistant was fixed. Corrected to the agreed wool stance (say "safe for use on wool", never "WoolSafe approved"), attributed Texatherm's figures, dropped the exothermic mechanism and overclaims, made the EN 1040 line precise. See the L-009 addendum.
- **Built the care guides (commit `58bfae7`).** Content collection + template + index + nav link + head slot + 3 guides. Build green (11 pages). **Verified** the built output (Article + FAQPage JSON-LD present, visible FAQ, sitemap URLs, zero residual WoolSafe/exothermic/EMV-409 strings in `dist/`) and **visually** in a browser preview (guides index + wool guide both render correctly, "Last updated June 2026" date formatting confirmed).

## Immediate next steps (suggested order)

1. **Push `feat/phase1-public-site`** (awaiting Ben's go-ahead — not pushed yet) and continue Phase 1 on it.
2. **Area pages** — Cheltenham + Gloucester (core, no surcharge); wider-Gloucestershire towns with the honest D-011 surcharge wording. **Blocked on Mark's exact surcharge figure + postcode boundary** before any page quotes a number (D-011). The page scaffold can be built now with the figure left as a placeholder, mirroring the assistant's "confirmed at booking" wording.
3. **More care guides** — natural fibres (sisal/seagrass/coir/jute), upholstery fabrics, drying/aftercare. The collection makes adding them trivial: drop a Markdown file in `src/content/guides/`.
4. **SEO finalisation** — robots/sitemap review, consider breadcrumb JSON-LD site-wide. Per-guide FAQ JSON-LD is already done (pulled forward into the guide template this session).
5. **Cutover PR** — point `netlify.toml` build at `site/` (`astro build`, publish `site/dist`), carry over the `/api/*` redirects + security headers, then Ben's deliberate merge.

Standing pre-launch items (unchanged):
- **Privacy notice go-live:** fill the `[to confirm: …]` placeholders (registered name/status, postal address, ICO registration, retention) + a data-protection review — applies to BOTH the live `index.html` notice and the Astro `/privacy` page.
- **Set `ALLOWED_ORIGINS`** in Netlify once the domain is chosen (L-001), and verify a Resend sending domain (L-004).
- **For Mark:** out-of-area surcharge figure + boundary (D-011); the WoolSafe Service Provider route (future USP); Texatherm SDS PDFs (real pH data) + an EMV 401 spec sheet; account ownership (D-009); domain (D-013).

## Things to watch / not yet decided

- **Branch is local only** — not pushed. Push and PR are Ben's call (D-010).
- **D-006 alignment now holds across the assistant AND the site** — keep it that way. When you correct a claim, grep the **whole repo** (site content too), not just `chat.js`; the drift this session proves a fix in one place does not fix the others (L-009 addendum).
- The Astro site is **not cut over** — `netlify.toml` still serves the Phase 0 root; changing the publish target is the deliberate go-live moment.
- Monorepo restructure (D-014) is Phase 2's first task; the Astro site already lives in `site/` as a small, deliberate pull-forward.
- Domain (D-013), surcharge figure (D-011), and account ownership (D-009) all still open.

## Local dev reminder

```bash
# Phase 0 functions (repo root):
npm install
cp .env.example .env   # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev

# Phase 1 Astro site (on branch feat/phase1-public-site):
npm install --prefix site
npm run build --prefix site     # -> site/dist
npm run preview --prefix site   # serve the build; `npm run dev --prefix site` for live reload
```

The in-progress Phase 1 work lives on branch `feat/phase1-public-site`. The repo is on GitHub at `randommonicle/icc-site` and is checked out locally per machine (this session worked in a git worktree).
