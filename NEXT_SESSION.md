# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 4 June 2026 (end of session — service-area pages for Cheltenham, Gloucester, Stroud, Tewkesbury and Cirencester, with Breadcrumb/Service/FAQ JSON-LD and the honest D-011 surcharge wording; on the Phase 1 branch, pushed)

---

## Current state

- **Phase 0 PoC** is live: single-page `index.html` + AI assistant (`chat.js`), availability + booking via Netlify Blobs, Resend emails, PDF job card, admin dashboard. The live `index.html` marketing copy is clean of the Texatherm claim issues, but its **chrome is still the old blue** (see "things to watch").
- **`main`** carries the Phase 0 hardening (PR #1), the assistant accuracy fix (PR #2), and the earlier handover + L-009 (PR #3). Nothing new merged to `main` this session.
- **Phase 1 (public Astro site) — IN PROGRESS on branch `feat/phase1-public-site`, pushed, NOT merged, NOT cut over.** The live site still serves the Phase 0 `index.html`.

## Phase 1 progress (branch `feat/phase1-public-site`)

- **D-001 resolved: Astro** (static SSG). **Building clean** (`npm run build --prefix site`) — **22 routes**: home, services, about, contact, history, privacy, book; guides ×7 + index; **areas ×6 + index**.
- Shared `BaseLayout` (per-page SEO + LocalBusiness JSON-LD + an optional `<slot name="head">` for per-page structured data), `Nav` (with **Areas** + **Guides** links), `Footer` (links to Areas + Privacy); `@astrojs/sitemap` wired.
- **Care-guides content collection** (`src/content.config.ts` + `src/content/guides/*.md`), one template (`pages/guides/[slug].astro`) with **Breadcrumb + Article + FAQPage JSON-LD** + visible FAQ, listing at `pages/guides/index.astro`. **Seven guides:** cleaning wool carpets, natural-fibre carpets (sisal/seagrass/coir/jute), carpet care at home, which stains are permanent, cleaning upholstery (incl. the W/S/SW/X fabric codes), low-moisture vs hot-water extraction, drying & aftercare. Cross-linked.
- **Service-area pages (D-011)** — an `areas` content collection (`src/content/areas/*.md`) + template (`pages/areas/[slug].astro`) emitting **BreadcrumbList + Service + FAQPage JSON-LD**, listing at `pages/areas/index.astro`. **Six towns:** Cheltenham + Gloucester (core, *no* surcharge), Stroud + Tewkesbury + Cirencester + Winchcombe (wider Gloucestershire, *small out-of-area surcharge confirmed at booking* — no figure invented, D-011/L-009). A `tier` frontmatter switch drives the core-vs-wider wording from one place; `Service.areaServed` is scoped to the town and tied to the site-wide `LocalBusiness` by `@id`.
- **Brand is now the ICC logo's green** (not the old ASH-style blue) across nav/footer/headers/headings. See L-010 for the token details.
- **Verified Texatherm knowledge brief** at `docs/TEXATHERM_KNOWLEDGE_BRIEF.md` — the **D-006 single source** for the guides + the assistant.

## What was just done (this session — 4 June 2026)

- **Service-area pages (D-011).** New `areas` content collection + `pages/areas/[slug].astro` template + `pages/areas/index.astro` index. Five towns live: **Cheltenham** and **Gloucester** (core, no surcharge), **Stroud**, **Tewkesbury** and **Cirencester** (wider Gloucestershire, surcharge confirmed at booking). Each town page has a unique title/meta/H1, a coverage panel (GL postcode chips + nearby places), a core-vs-wider surcharge callout, a services-offered grid linking to `/services`, a visible FAQ, and **BreadcrumbList + Service + FAQPage JSON-LD**. Added an **Areas** nav link and a footer link.
- **Honesty held (D-011 / L-009).** No surcharge figure is invented anywhere — wider pages say "a small out-of-area surcharge applies, confirmed when you book". The built HTML was grepped clean of "WoolSafe approved" / "EMV 409" / "76 dB"; the single Texatherm drying figure is attributed ("Texatherm states…").
- **Verified:** `npm run build` clean (18 pages, sitemap regenerated with all 6 area URLs); all four JSON-LD blocks per page parse; `npm run preview` serves every route 200 with the right title/H1 and the Areas nav marked active. (`dist`/`.astro` stay gitignored — only source committed.)
- **Home-page Areas strip + mobile nav (CSS-only).** Added an "Areas we cover" section to the home page — it pulls the 5 towns from the `areas` collection (core-vs-wider tags) so the strongest page links into the area pages. Fixed the pre-existing mobile-nav gap: the nav now has a **CSS-only hamburger** (checkbox hack, zero-JS per D-001) — below 820px it shows a burger that opens a dropdown with all links. Verified in a 375px viewport (burger → X, menu open/close, all 7 links incl. Areas) + a desktop strip screenshot.
- **Three more care guides + a sixth area page + breadcrumbs on guides.** Added guides for **natural-fibre carpets**, **cleaning upholstery** (with the W/S/SW/X fabric codes) and **drying & aftercare** (7 guides total), plus a **Winchcombe** area page (GL54, wider — already an asserted service area, no boundary conflict). Extended **BreadcrumbList JSON-LD to the guide template** (Home › Care Guides › guide). All new content grepped clean of banned claims; the Texatherm drying figure is attributed. Build clean (22 pages); `robots.txt` reviewed (allows all, points to the sitemap — fine as-is).

## Immediate next steps (suggested order)

1. **Encode the surcharge once Mark confirms it (D-011).** The five area pages and `services.astro` already say "confirmed at booking". When Mark gives the figure + the precise out-of-area boundary, wire a concrete number into the area template's `tier` wording (one place) and into `validateBooking` server-side. Until then the honest placeholder stands.
2. **Even more guides / towns as wanted** — guide topics and surrounding towns are now a one-file drop each (`src/content/{guides,areas}/*.md`). Boundary-ambiguous towns close to the core (e.g. Bishop's Cleeve, GL52) need Mark's surcharge boundary first, or they'd contradict the Cheltenham page's "GL52, no surcharge".
3. **Cutover PR** — point `netlify.toml` at `site/` (`astro build`, publish `site/dist`), carry over the `/api/*` redirects + headers, then Ben's deliberate merge.
4. **External SEO (needs Mark / the domain)** — Google Search Console + Google Business Profile (Mark-owned) + NAP consistency, once the domain (D-013) is chosen.

(Done this session: area pages ×6, home-page → `/areas` strip, mobile-nav hamburger, 3 more guides (7 total), breadcrumb JSON-LD on guides, robots.txt reviewed.)

Standing pre-launch items (unchanged): privacy `[to confirm: …]` details + DP review; `ALLOWED_ORIGINS` (L-001) + Resend domain (L-004) once the domain is chosen; for Mark: surcharge figure (D-011), WoolSafe Service Provider route, Texatherm SDS PDFs + EMV 401 spec, account ownership (D-009), domain (D-013).

## Things to watch / not yet decided

- **Green rebrand is provisional.** Ben said it looks "very green… fine for the moment… may need to revisit." The two brand greens live in one place (`site/src/styles/global.css` `:root`): `--green-dark:#0c2c25` and `--green:#15564a`. Tone down there if needed (L-010). The new area pages reuse these tokens, so they follow any change automatically.
- **The LIVE `index.html` is still the old blue.** Only the Astro site was rebranded. Matching the live site to the green is a separate, live change needing deploy sign-off; at minimum it should match at cutover.
- **`astro dev` currently fails in this worktree** with a Vite/esbuild dependency-scan error (the deps were installed under a restricted install policy that skipped esbuild's setup step). The **production build is unaffected** (`npm run build` is clean). To preview locally, use `npm run preview --prefix site` (serves the build at localhost:4321), or do a fresh `npm install` on a normal machine to fix dev.
- **D-006 alignment now holds across the assistant AND the site** (assistant prompt, guides, services, *and* area pages) — keep it that way (grep the whole repo when correcting a claim, L-009).
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

The Phase 1 work lives on branch `feat/phase1-public-site` (GitHub `randommonicle/icc-site`), checked out locally per machine (this session used the main clone; an earlier session used a git worktree).
