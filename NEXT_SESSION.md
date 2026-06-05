# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 5 June 2026 — **Phase 2 (operational backend) underway.** Three stacked PRs are open and **none are merged**: Slice 0 (monorepo → `server/`, #6), Slice 1 (`shared/config` single source, #7), Slice 2 (Supabase schema, #8). **Slice 2 is authored but NOT verified** — the work machine can't run the local Supabase stack (Docker OOM'd it), so the pgTAP test hasn't run; its PR is gated. **Picking this up at home: do step 1 below to verify Slice 2, then the merges.** Everything is committed + pushed; working tree clean. Phase 1 (Astro site) remains in `main`, **not cut over**.

---

## Current state — three streams

**1. Live (Phase 0 PoC).** `index.html` + `admin.html` + the serverless functions, on the Netlify URL (not promoted). Booking/availability via Netlify Blobs, Resend, PDF job card. Live assistant quotes the flat £15 + VAT surcharge, treats Winchcombe as core. Live `index.html` is still the old blue with the old stats — fix at/by cutover.

**2. Phase 1 public site (Astro, `site/`).** In `main`, 22 routes, polished (PR #5), **dormant** until the cutover PR. Blocked on Mark (privacy `[to confirm]` + DP review) and the domain (D-013). Independent of Phase 2.

**3. Phase 2 operational backend — IN PROGRESS.** Built in slices that each leave `main` deployable, **local-first** (no hosted Supabase project — D-009). Three stacked PRs (below). Plan in the approved session plan; slice summaries in "Immediate next steps".

### Phase 2 PRs (stacked — merge in order; none merged)

| Slice | Branch | PR | What | State |
|---|---|---|---|---|
| 0 | `chore/d014-monorepo` | **#6** → `main` | Functions → `server/` (D-014) | ✅ green (`node --test` 8/8) |
| 1 | `feat/shared-config` | **#7** → #6 | `shared/config` models/pricing/area (D-006/D-007) | ✅ green; prompt byte-identical |
| 2 | `feat/supabase-schema` | **#8** → #7 | Supabase schema + pgTAP (D-002) | ⚠️ **authored, NOT verified** (Docker) |

`node --test` is the only logic gate locally; **no CI** — Netlify auto-deploys `main` from GitHub. Each PR's deploy preview is where `/api/*` is confirmed before merge.

## What was done this session (5 June 2026)

- Synced `main` (was 28 behind), read the doc set, approved a sliced Phase 2 plan. Locked: backend folder = **`server/`**; **local-first Supabase** (D-009); backend-AI scope = all of it incl. invoice interpretation + AI chasing.
- **Slice 0 (#6)** — `git mv` functions → `server/netlify/functions/` (history kept); `netlify.toml` functions path; test require paths repointed + root `"test"` script; `app/` placeholder; docs. Deferred (D-014 addendum): npm workspaces + `server/package.json`, and the build-scope `ignore`. `node --test` 8/8.
- **Slice 1 (#7)** — extracted model names + pricing table + service-area/surcharge into `shared/config/*.js` (CommonJS, so the CJS functions + `node --test` can load them; `.ts` would break that). `chat.js` imports the model and **generates** the PRICING + SERVICE AREA prompt blocks from config. **Parity verified: the assembled prompt is byte-identical**, so the prompt-cache prefix is unchanged (L-002). `core_postcodes` seeded from the Astro frontmatter with a `TODO(D-011 boundary)`.
- **Slice 2 (#8)** — `supabase/migrations/20260605115456_init.sql`: `customers / jobs / job_photos / job_assessments / invoices / messages`; enums; `updated_at` triggers; **RLS enabled, no policies** (service-role only); **double-booking is a DB invariant** via a `btree_gist` exclusion constraint; availability derived from jobs. `supabase/tests/schema_test.sql` (pgTAP) proves the guard. Supabase CLI added as a devDependency. **Could not run `supabase test db` — Docker daemon would not start (Linux engine pipe missing).** PR #8 is gated "do not merge until verified".
- Recorded **D-016** — registered address (11 Horsbere Road, Hucclecote, Gloucester, GL3 3BT) kept **private**; ICC runs as a service-area business; address used only for GBP verification + the privacy/data-controller layer, never published (better for SEO than publishing — see D-016).

## Immediate next steps (suggested order)

1. **Verify Slice 2 at home** (the work machine can't run the Supabase stack — Docker ran but ate too much memory and forced a restart). On branch `feat/supabase-schema`: `npm install` (pulls the `supabase` CLI devDep), then `npx supabase start && npx supabase db reset && npx supabase test db`. The pgTAP test (`supabase/tests/schema_test.sql`) proves the double-booking guard. **Until it passes, #8 must not merge.** (First `supabase start` pulls a few GB of images.)
2. **Merge the stack in order** with sign-off: **#6 → #7 → #8**. On each PR's **deploy preview**, confirm `/api/chat` (check_availability) + `/api/bookings` still respond — #6 moves the functions, #7 adds the `shared/config` requires to the bundle, so both change how the functions bundle. GitHub auto-retargets the next PR's base as each lands.
3. **Slice 3 — `/api/v1/*` + server-side pricing/surcharge enforcement** (D-003/D-011/D-012). New versioned endpoints alongside the live ones; `shared/contract/` types; the `validateBooking` successor enforces the D-011 surcharge/boundary from `serviceArea.js`. Best started on a **verified** schema (do step 1 first).
4. **Slice 4 — backend AI** through the `messages` table (draft→approve→send): photo-assessment re-run, invoice interpretation + chasing, summaries, NL admin queries (read-only/whitelisted), re-engagement (consent-gated, Phase 4).
5. **Slice 5 — Blobs→Postgres migration + client repoint + Supabase Auth** (sign-off-gated, LAST; only slice that changes live behaviour).
6. **Separate stream — Phase 1 site cutover** (blocked on Mark privacy + domain D-013): `netlify.toml` `publish = site/dist`, lock `astro.config.mjs` `site`. Independent of Phase 2.
7. **Follow-ups noted:** wire the Astro home/services price cards to `shared/config/pricing.js` (closes the site-side price drift); fill the privacy data-controller slot with the D-016 address (gated on Mark + DP review).

## Things to watch / not yet decided

- **Docker is unusable for the Supabase stack on the work machine.** It wouldn't start at first (engine-pipe missing); after a reinstall + restart it ran and began pulling images, but `supabase start` consumed too much memory and forced another restart. **Verify Slice 2 at home** (more headroom) or against Mark's project — not on the work machine.
- **D-009 — local-first.** Do NOT create a hosted Supabase project under our identity; Mark owns it. Build locally; `supabase link && db push` to his project when it exists.
- **D-011 boundary open (Mark):** `serviceArea.js core_postcodes` is seeded from the Astro frontmatter with a `TODO`; settle the precise out-of-area postcode list, kept in that one file. Server-side enforcement lands in Slice 3.
- **D-016 — address private:** GBP-verification + privacy layer only; never on the public site / NAP / structured data.
- **Slice 0 deferrals** (npm workspaces, build-scope `ignore`) — see the D-014 addendum in DECISIONS.md; revisit at Slice 2/3 and at the app/site-cutover.
- **`shared/config` is `.js` (CommonJS), not `.ts`** — required by the CJS functions + the plain-Node test runner. Slice 3 contract *types* can be `.ts`.
- **Surcharge VAT assumption:** £15 + VAT (if Mark meant £15 all-in, change in `serviceArea.js` + re-grep).
- **The LIVE `index.html` is still blue** with the old stats — fix at/by the Phase 1 cutover (a live change, needs deploy sign-off).
- **`astro dev` fails in this worktree** — use `npm run build/preview --prefix site`.
- Domain (D-013) and account ownership (D-009) still open; monorepo rename `icc-site`→`icc-platform` is cosmetic/deferred.

## Local dev reminder

```bash
# Root: tests (the only logic gate today)
npm install
npm test                         # node --test -> test/hardening.test.js (8 tests)

# Phase 0 / Phase 2 functions live under server/netlify/functions/
cp .env.example .env             # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev                  # serves site + functions; /api/* via netlify.toml redirects

# Phase 1 Astro site
npm run build --prefix site      # -> site/dist (what Netlify runs at cutover)
npm run preview --prefix site

# Phase 2 Supabase (local-first; needs Docker Desktop running)
npx supabase start               # local Postgres in Docker  (CURRENTLY BLOCKED: Docker won't start here)
npx supabase db reset            # apply supabase/migrations/
npx supabase test db             # run supabase/tests/ (pgTAP) — verifies Slice 2
```

Phase 2 work is a stack of branches off `main`: `chore/d014-monorepo` → `feat/shared-config` → `feat/supabase-schema` (GitHub `randommonicle/icc-site`).
