# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 3 June 2026 (end of session — accuracy fix, four care guides, and a green rebrand, all on the Phase 1 branch; pushed)

---

## Current state

- **Phase 0 PoC** is live: single-page `index.html` + AI assistant (`chat.js`), availability + booking via Netlify Blobs, Resend emails, PDF job card, admin dashboard. The live `index.html` marketing copy is clean of the Texatherm claim issues, but its **chrome is still the old blue** (see "things to watch").
- **`main`** carries the Phase 0 hardening (PR #1), the assistant accuracy fix (PR #2), and the earlier handover + L-009 (PR #3). Nothing new merged to `main` this session.
- **Phase 1 (public Astro site) — IN PROGRESS on branch `feat/phase1-public-site`, pushed, NOT merged, NOT cut over.** The live site still serves the Phase 0 `index.html`.

## Phase 1 progress (branch `feat/phase1-public-site`)

- **D-001 resolved: Astro** (static SSG). **9 pages building clean** (`npm run build --prefix site`, 12 routes incl. guides).
- Shared `BaseLayout` (per-page SEO + LocalBusiness JSON-LD + an optional `<slot name="head">` for per-page structured data), `Nav` (with a **Guides** link), `Footer`; `@astrojs/sitemap` wired.
- **Care-guides content collection** (`src/content.config.ts` + `src/content/guides/*.md`), one template (`pages/guides/[slug].astro`) with **Article + FAQPage JSON-LD** + visible FAQ, listing at `pages/guides/index.astro`. **Four guides:** cleaning wool carpets, **carpet care at home (spill first-aid + everyday care)**, which stains are permanent, low-moisture vs hot-water extraction. Cross-linked.
- **Brand is now the ICC logo's green** (not the old ASH-style blue) across nav/footer/headers/headings. See L-010 for the token details.
- **Verified Texatherm knowledge brief** at `docs/TEXATHERM_KNOWLEDGE_BRIEF.md` — the **D-006 single source** for the guides + the assistant.

## What was just done (this session)

- Merged `main` into the branch.
- **Accuracy fix (`ba9bd70`):** corrected `services.astro` + `history.astro`, which still carried the pre-correction Texatherm claims (WoolSafe approved, exothermic mechanism, unattributed 80%/30-60, EN 1040 overclaim). The site had drifted from the brief even though the assistant was fixed (L-009 addendum).
- **Care guides (`58bfae7`):** content collection + 3 guides + index + template + nav + head slot.
- **Docs (`5dfc907`):** earlier handover + L-009 addendum + roadmap.
- **Green rebrand (`a6382a8`):** shifted the chrome from ASH-blue to the logo's deep green (L-010). Verified via build + computed styles (the preview screenshot tool was wedging). **Ben accepted it provisionally and may want it toned down later.**
- **Carpet Care at Home guide (`eeef31e`):** the at-home advice Mark/Ben wanted — spill first-aid + maintenance, framed as damage limitation, not a replacement for the professional clean.

## Immediate next steps (suggested order)

1. **Area pages** — Cheltenham + Gloucester (core, no surcharge); wider-Gloucestershire towns with the honest D-011 surcharge wording. **Blocked on Mark's exact surcharge figure + postcode boundary.** Scaffold can be built with the figure as a placeholder (mirror the assistant's "confirmed at booking").
2. **More care guides** — natural fibres (sisal/seagrass/coir/jute), upholstery fabrics, drying/aftercare. Trivial to add: drop a Markdown file in `src/content/guides/`.
3. **SEO finalisation** — robots/sitemap review, breadcrumb JSON-LD site-wide. Per-guide FAQ JSON-LD is already done.
4. **Cutover PR** — point `netlify.toml` at `site/` (`astro build`, publish `site/dist`), carry over the `/api/*` redirects + headers, then Ben's deliberate merge.

Standing pre-launch items (unchanged): privacy `[to confirm: …]` details + DP review; `ALLOWED_ORIGINS` (L-001) + Resend domain (L-004) once the domain is chosen; for Mark: surcharge figure (D-011), WoolSafe Service Provider route, Texatherm SDS PDFs + EMV 401 spec, account ownership (D-009), domain (D-013).

## Things to watch / not yet decided

- **Green rebrand is provisional.** Ben said it looks "very green… fine for the moment… may need to revisit." The two brand greens live in one place (`site/src/styles/global.css` `:root`): `--green-dark:#0c2c25` and `--green:#15564a`. Tone down there if needed (L-010).
- **The LIVE `index.html` is still the old blue.** Only the Astro site was rebranded. Matching the live site to the green is a separate, live change needing deploy sign-off; at minimum it should match at cutover.
- **`astro dev` currently fails in this worktree** with a Vite/esbuild dependency-scan error (the deps were installed under a restricted install policy that skipped esbuild's setup step). The **production build is unaffected** (`npm run build` is clean). To preview locally, use `npm run preview --prefix site` (serves the build), or do a fresh `npm install` on a normal machine to fix dev.
- **D-006 alignment now holds across the assistant AND the site** — keep it that way (grep the whole repo when correcting a claim, L-009).
- Not cut over; monorepo restructure (D-014) is Phase 2's first task; domain (D-013), surcharge (D-011), account ownership (D-009) all open.

## Local dev reminder

```bash
# Phase 0 functions (repo root):
npm install
cp .env.example .env   # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev

# Phase 1 Astro site (on branch feat/phase1-public-site):
npm install --prefix site
npm run build --prefix site     # -> site/dist (this is what Netlify will run)
npm run preview --prefix site   # serve the build at localhost:4321 (use this, not dev, in this worktree)
```

The Phase 1 work lives on branch `feat/phase1-public-site` (GitHub `randommonicle/icc-site`), checked out locally per machine (this session used a git worktree).
