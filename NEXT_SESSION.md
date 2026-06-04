# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 4 June 2026 (session — pre-cutover QA audit of the Phase 1 Astro site, then D-011 resolved: Winchcombe added to the core/no-surcharge area and a flat **£15 + VAT** out-of-area surcharge encoded across the site + assistant + docs; home-page prices aligned to the assistant + VAT. On the Phase 1 branch; **working tree NOT yet committed** — see "State of the branch".)

---

## Current state

- **Phase 0 PoC** is live on the Netlify-assigned URL (not a custom domain, not promoted anywhere). Single-page `index.html` + AI assistant (`chat.js`), availability + booking via Netlify Blobs, Resend emails, PDF job card, admin dashboard. The live `index.html` chrome is still the **old blue** and is silent on the surcharge (no contradiction with the new £15 fact, but it should be brought in line at cutover).
- **`main`** is unchanged this session (still PRs #1–#3). Nothing merged.
- **Phase 1 (public Astro site) — IN PROGRESS on `feat/phase1-public-site`. Built clean (22 routes), NOT merged, NOT cut over.** The live site still serves the Phase 0 `index.html`.

## State of the branch (read before you commit)

This session's edits are in the **working tree but NOT committed** (Ben commits/deploys by deliberate decision, D-010). `npm run build --prefix site` is green and the built `dist` was grepped clean. Suggested commits when you're ready:
1. `feat(site): pre-cutover SEO/JSON-LD/a11y audit` — *(no code; the audit is recorded below, not in a file. Skip unless you add an `AUDIT.md`.)*
2. `feat(site+assistant): encode D-011 — Winchcombe core, flat £15 + VAT out-of-area surcharge` — the area content, template, both index pages, `content.config.ts`, `services.astro`, `index.astro` home strip, and `netlify/functions/chat.js` prompt.
3. `fix(site): align home-page prices to the assistant (+ VAT)` — the three `index.astro` service-card prices.
4. `docs: D-011 surcharge resolved (£15 + VAT, Winchcombe core)` — CLAUDE.md, DECISIONS.md, ROADMAP.md, this file.
(Or one combined commit — the changes are one coherent "encode confirmed pricing & service area" unit.)

## What was done this session (4 June 2026)

**1. Pre-cutover QA audit (read-only) of the Phase 1 site.** Honest RAG findings:
- 🔴 **Fabricated trust stats** — `500+ Cleans`, `98% Satisfaction` / `98% 5-Star Reviews` on the home ([index.astro](site/src/pages/index.astro)) and About ([about.astro](site/src/pages/about.astro)) pages. Violates L-009 + ASA/CAP; no `aggregateRating` backs them. **Mark: this is a new business, there are no stats yet.** Decision: **deferred** — not promoted, so not urgent, but **must be removed/replaced before the site is promoted off the Netlify name.** `15+ Carpet Types` / `15+ Fibre Types` is confirmed fine (a capability, not a track record).
- 🔴 **Privacy `[to confirm: …]` placeholders** ([privacy.astro](site/src/pages/privacy.astro)) — Mark to fill (legal status, postal address, ICO no., retention) + a DP review. Known standing blocker.
- 🟡 **Pricing drift (D-006)** — FIXED this session (see below).
- 🟡 **"Guaranteed Results" H1 + "first fully AI-assisted" claim** ([index.astro](site/src/pages/index.astro)) — substantiate or soften (CAP). **Not actioned** (not directed this session).
- 🟡 **Meta descriptions >160 chars on ~18/22 pages**; several **guide `<title>`s 88–101 chars** — truncated in SERPs. **Not yet actioned** (safe polish; offered).
- 🟡 **No `og:image` / `twitter:card`** sitewide ([BaseLayout.astro](site/src/layouts/BaseLayout.astro)) — poor social/link previews. `public/logo.jpg` exists. **Not yet actioned** (safe polish; offered).
- 🟡 **Chat-form a11y** ([book.astro](site/src/pages/book.astro)) — `<textarea>` has no label/aria-label, send `<button>▶</button>` has no accessible name, suggestion chips are `<div onclick>` (not keyboard-reachable). Inherited Phase 0 patterns. **Not yet actioned** (safe polish; offered).
- 🟡 **Contrast (WCAG 1.4.3)** — teal `#1a8a7a` = **4.23:1** (just under AA 4.5 for small text: links, prices, section labels, nav CTA); white on `--teal-light #2ab8a4` = **2.47:1 fails** on primary-button hover. Touches the provisional green (L-010) — Ben's call.
- 🟢 Verified good: one H1/page; unique titles+descriptions; canonicals correct; **all JSON-LD valid**; no fake `aggregateRating` in structured data; sitemap+robots correct; **all internal links resolve**; NAP consistent; **banned Texatherm claims clean in source AND built HTML** (80% figure attributed); injection-safe DOM rendering preserved (L-003); `lang="en"`.

**2. D-011 resolved and encoded (Mark, June 2026).** Core / no-surcharge area is now **Cheltenham, Gloucester and Winchcombe**; everywhere else is a **flat £15 + VAT** out-of-area surcharge.
- **Winchcombe flipped from `wider` → `core`** ([winchcombe.md](site/src/content/areas/winchcombe.md)); its prose/FAQ now say "no travel surcharge".
- **Stroud, Tewkesbury, Cirencester** ([stroud.md](site/src/content/areas/stroud.md), [tewkesbury.md](site/src/content/areas/tewkesbury.md), [cirencester.md](site/src/content/areas/cirencester.md)) now state the **flat £15 + VAT** surcharge (replacing the "confirmed at booking" placeholder).
- Updated the **area template** ([areas/[slug].astro](site/src/pages/areas/[slug].astro): badge + both tier callouts), the **areas index** ([areas/index.astro](site/src/pages/areas/index.astro): meta, hero, group title, note), the **collection schema comments** ([content.config.ts](site/src/content.config.ts)), the **services page** ([services.astro](site/src/pages/services.astro): intro + price-table row), the **home strip** ([index.astro](site/src/pages/index.astro)), and the **assistant prompt** ([chat.js](netlify/functions/chat.js): SERVICE AREA block + pricing line) so the assistant quotes the concrete £15 + VAT and includes it in the itemised quote.
- **Cheltenham page FAQ** updated so "just outside town" points at the flat £15 + VAT.

**3. Home-page prices aligned to the assistant + VAT (D-006).** `index.astro` service cards were stale (`From £55 per room`, `£35`, `£45`, no VAT). Now: **From £75 per room + VAT**, **From £45 + VAT** (stain), **From £50 per item + VAT** (upholstery) — matching [chat.js](netlify/functions/chat.js) pricing. (`services.astro` was already correct.)

**Verification:** `npm run build --prefix site` clean (22 pages, sitemap regenerated); built `dist` grepped — **0** occurrences of "confirmed at booking"/"small surcharge", and £15 + VAT / Winchcombe render across all pages. Repo-wide grep confirms no stale two-town-core wording in the Phase 1 site or assistant.

## Immediate next steps (suggested order)

1. **Commit the working tree** (see "State of the branch") once reviewed.
2. **Safe SEO/a11y polish set** (offered, not yet done — all on-branch, build-verifiable, no live impact): tighten meta descriptions to ≤155 chars on the ~18 long pages; shorten the 4–5 over-long guide titles; add a default `og:image` (=`/logo.jpg`) + `twitter:card` in `BaseLayout`; add `aria-label`s to the chat textarea + send button and make suggestion chips keyboard-reachable.
3. **Before any promotion off the Netlify name:** remove/replace the `500+` and `98%` stats (home + about); decide on "Guaranteed Results" / "first AI-assisted" (substantiate or soften); fill privacy `[to confirm: …]` + DP review.
4. **Cutover PR** — point `netlify.toml` at the Astro build (`command`, `publish = site/dist`), carry over the `/api/*` + `/admin` redirects + security headers, and **lock `astro.config.mjs` `site`** to the real domain (D-013, currently a placeholder). Then Ben's deliberate merge.
5. **Server-side surcharge enforcement (Phase 2).** `validateBooking` ([chat.js:456](netlify/functions/chat.js:456)) only bounds the total price; the £15 + VAT lives in the assistant's quote, not the server. Encode the precise out-of-area **postcode boundary** + apply the surcharge in `validateBooking` when pricing/area logic moves server-side (D-007), so the website and the field app (D-012) apply it identically.
6. **External SEO** (needs Mark / the domain) — Search Console + Google Business Profile + NAP, once the domain (D-013) is chosen.

## Things to watch / not yet decided

- **Surcharge VAT assumption:** encoded as **£15 + VAT** (consistent with the "+ VAT throughout" convention). If Mark meant £15 all-in, it changes in one place per file — flag and re-grep.
- **Boundary-ambiguous towns:** the area *pages* now carry concrete tiers, but the sitewide `LocalBusiness.areaServed` (BaseLayout) and the contact-page chips still list Bishops Cleeve / Charlton Kings / Prestbury without a tier — they make no surcharge claim, so no contradiction, but the precise core-vs-£15 postcode boundary (step 5) will settle them.
- **Green rebrand is provisional** (L-010) — `--green-dark:#0c2c25` / `--green:#15564a` in `site/src/styles/global.css`. The contrast finding above may push a tweak.
- **The LIVE `index.html` is still blue** and still shows the old `500+/98%` stats and "first"/"Guaranteed" copy; bring it in line at/by cutover (a live change, needs deploy sign-off).
- **`astro dev` still fails in this worktree** (Vite/esbuild dep-scan; restricted install skipped esbuild setup). Production build is unaffected — use `npm run preview --prefix site`, or a fresh `npm install` on a normal machine.
- D-006 alignment now holds across the assistant AND the site (assistant prompt, guides, services, area pages, home prices) — keep it that way (grep the whole repo when correcting a claim, L-009).
- Not cut over; monorepo restructure (D-014) is Phase 2's first task; domain (D-013) and account ownership (D-009) still open.

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

The Phase 1 work lives on branch `feat/phase1-public-site` (GitHub `randommonicle/icc-site`), checked out locally per machine.
