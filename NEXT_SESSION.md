# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 5 June 2026 — **Phase 2 (operational backend) kicked off.** A sliced implementation plan was approved (Supabase + API + backend AI, built local-first per D-009). **Slice 0 (the D-014 monorepo restructure → `server/`) is staged on `chore/d014-monorepo`, verified green locally (`node --test` 8/8), NOT merged — awaiting Ben's sign-off.** Phase 1 (the Astro public site) is fully in `main` (PR #4 + the PR #5 pre-cutover polish) but still **NOT cut over**.

---

## Current state — three streams

**1. Live (Phase 0 PoC).** `index.html` + `admin.html` + the two serverless functions, on the Netlify-assigned URL (no custom domain, not promoted). Booking/availability via Netlify Blobs, Resend email, PDF job card. The live AI assistant already quotes the flat **£15 + VAT** out-of-area surcharge and treats Winchcombe as core (PR #4 redeployed `chat.js`). The live `index.html` chrome is still the **old blue** and still shows the old `500+/98%` stats + "first/Guaranteed" copy — bring it in line at/by cutover.

**2. Phase 1 public site (Astro, `site/`).** In `main`, 22 routes, built clean, **dormant** until the cutover PR. All pre-cutover polish is merged (PR #5): SEO meta + `og:image`/Twitter card, chat a11y, WCAG AA contrast, the unsubstantiated `500+`/`98%` stats removed (→ capability tiles, D-015), "first/Guaranteed" softened. **Cutover is blocked on Mark** (privacy `[to confirm: …]` placeholders + a DP review) **and the domain** (D-013). This stream is independent of Phase 2 below.

**3. Phase 2 operational backend — IN PROGRESS (this session).** Plan approved; building in slices that each leave `main` deployable, **local-first** (no hosted Supabase project created under our identity — D-009). Slice 0 staged on `chore/d014-monorepo` (see below).

**No CI in this repo** — local `node --test` + `npm run build --prefix site` are the only gates. Netlify auto-deploys `main`.

## What was done this session (5 June 2026)

- Synced local `main` to `origin/main` (was 28 behind — the PR #5 polish session had moved it on); read the doc set.
- Agreed to open the Phase 2 backend while the Phase 1 cutover waits on Mark. Approved a sliced plan. Decisions locked: backend folder = **`server/`** (D-014 was open); **local-first Supabase** (D-009); backend-AI scope = **all of it** — persisted/re-runnable photo assessment, AI job/customer summaries, NL admin queries, AI-drafted comms (review requests + re-engagement), **plus invoice interpretation + AI-assisted chasing**.
- **Slice 0 — monorepo restructure (D-014), on `chore/d014-monorepo`:**
  - `git mv` `chat.js` + `bookings.js` → `server/netlify/functions/` (history preserved — both show as renames).
  - `netlify.toml`: `functions = "server/netlify/functions"` (one line; all 4 redirects + 2 header blocks byte-identical).
  - `test/hardening.test.js`: require paths repointed to `../server/netlify/functions/`; added root `"test": "node --test"` script.
  - `app/README.md` placeholder (D-012 field-app track).
  - Docs updated (CLAUDE.md structure + deep-dive headings, README, ROADMAP Phase 2 bullet, DECISIONS D-014 addendum, this file).
  - **Verified:** `node --test` green **8/8** after the move (baseline was 8/8). Config diffs are exactly one concern each.
  - **Deliberately deferred (documented in the D-014 addendum) to keep the structural change minimal + low deploy-risk:** npm workspaces + a `server/package.json` (add when `server/` first needs its own dep — `@supabase/supabase-js`, Slice 2; until then functions resolve root `node_modules`, so Netlify install/bundle is unchanged) and the `netlify.toml` build-scope `ignore` directive (no consumer until `app/` has a real build; Phase 0 still publishes the repo root, so it needs care).
  - **NOT merged.** No live behaviour changes. Awaiting sign-off.

## Immediate next steps (suggested order)

1. **Merge Slice 0** — Ben's sign-off. Before merge: confirm in the Netlify dashboard whether prod is **git-linked** (builds on push) or **manual/drag-drop** (only `netlify.toml functions` honoured); merge on a quiet window and verify `/api/chat` (check_availability) + `/api/bookings` resolve on the deploy preview (functions now bundle from the new path). From `main`, branch fresh for each subsequent slice.
2. **Slice 1 — `shared/config` (D-006/D-007).** Extract `models.ts` (one value: `{text:"claude-sonnet-4-6", vision:"claude-opus-4-5"}`), `pricing.ts` (the prose pricing table in `STATIC_SYSTEM_PROMPT` as data; generate the assistant's PRICING block from it), `serviceArea.ts` (`core_postcodes` + `surcharge_ex_vat:15`, seeded from `site/src/content.config.ts` area frontmatter `tier`+`postcodes`). Pure refactor — assistant output identical.
3. **Slice 2 — Supabase schema, local-first (D-002).** `supabase init` + `0001_init.sql` (`customers / jobs / job_photos / job_assessments / invoices / messages`; jobs carry a `btree_gist` exclusion constraint that makes double-booking a hard DB invariant; availability is **derived** from jobs, not a second table). **Prereqs:** install the Supabase CLI (`npm i -g supabase`) and start Docker Desktop (`supabase start` needs the daemon — it is installed but was not running). No prod cutover; Blobs stays live.
4. **Slice 3 — `/api/v1/*` + server-side pricing/surcharge enforcement (D-003/D-011/D-012).** New versioned endpoints **alongside** the live `/api/chat`+`/api/bookings`; `shared/contract/` types imported by site/app/server. This is where the D-011 surcharge/boundary finally gets enforced server-side (the `validateBooking` successor).
5. **Slice 4 — backend AI** (sequenced; all drafts go through the `messages` table, Mark approves before send): photo-assessment re-run, invoice interpretation + chasing (transactional), job/customer summaries, NL admin queries (read-only, whitelisted — never model-authored SQL), re-engagement (Phase 4, consent-gated D-008).
6. **Slice 5 — data migration + cutover (sign-off-gated, LAST).** One-time Blobs→Postgres (`legacy_blob_id` trace), repoint the public client to `/api/v1/*`, retire static-Bearer for Supabase Auth. The only slice that changes live behaviour.
7. **Separate stream — Phase 1 site cutover** (blocked on Mark privacy + domain D-013): point `netlify.toml` at `publish = site/dist`, carry redirects/headers, lock `astro.config.mjs` `site`. Independent of Phase 2.

## Things to watch / not yet decided

- **D-009 — local-first.** Do NOT create a hosted Supabase project under our identity; Mark owns it from day one. Build locally; `supabase link && db push` to Mark's project when it exists.
- **Slice 0 deferrals** (npm workspaces, build-scope `ignore`) — see the D-014 addendum in DECISIONS.md; revisit at Slice 2 and at the app/site-cutover respectively.
- **Confirm Netlify git-linked vs manual deploy** before merging Slice 0 (changes the deploy-risk profile and whether `ignore` matters).
- **D-011 boundary is open (Mark):** `serviceArea.ts` will be seeded from the Astro frontmatter with a `TODO`; settle the precise out-of-area postcode list with Mark, kept in one config file.
- **Surcharge VAT assumption:** encoded as **£15 + VAT**. If Mark meant £15 all-in, change in one place per file and re-grep.
- **Green rebrand provisional** (L-010): `--green-dark:#0c2c25` / `--green:#15564a` in `site/src/styles/global.css`; AA contrast fix applied — re-check ratios if toned down.
- **`astro dev` still fails in this worktree** (Vite/esbuild dep-scan); use `npm run build`/`preview --prefix site`. Phase 2 backend work doesn't need it.
- **D-006 alignment** holds across assistant + site — grep the whole repo when correcting any claim (L-009).
- Domain (D-013) and account ownership (D-009) still open; monorepo rename `icc-site`→`icc-platform` is cosmetic/deferred.

## Local dev reminder

```bash
# Root: tests (the only logic gate today)
npm install
npm test                         # node --test -> test/hardening.test.js (8 tests)

# Phase 0 / Phase 2 functions now live under server/netlify/functions/
cp .env.example .env             # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev                  # serves site + functions; /api/* via netlify.toml redirects

# Phase 1 Astro site
npm run build --prefix site      # -> site/dist (what Netlify will run at cutover)
npm run preview --prefix site    # serve the build at localhost:4321 (use this, not dev, in this worktree)

# Phase 2 Supabase (Slice 2 onward — local-first; needs Docker Desktop running)
npm i -g supabase                # CLI not yet installed
supabase start                   # local Postgres in Docker
supabase db reset                # apply supabase/migrations/
```

Phase 2 backend work is on branch `chore/d014-monorepo` (Slice 0) → subsequent slices branch fresh off `main` (GitHub `randommonicle/icc-site`).
