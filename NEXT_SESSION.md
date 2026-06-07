# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 5 June 2026 (evening, at home). **Phase 2 backend underway; Slice 2 now VERIFIED + HARDENED, and Node 24 is live on `main`.** Three stacked PRs are open and **none are merged**: Slice 0 (monorepo to `server/`, #6), Slice 1 (`shared/config` single source, #7), Slice 2 (Supabase schema, #8). Slice 2's pgTAP passes **10/10** at home and a pre-merge review's findings are fixed (see "Done this evening"). Node was upgraded 20 to 24 (PR #9, D-017) and confirmed live in production. **Next action: merge the stack #6 to #7 to #8**, resolving each merge to keep Node 24 (step 2). Everything is committed + pushed; working tree clean. Phase 1 (Astro site) remains in `main`, **not cut over**.

---

## Current state — three streams

**1. Live (Phase 0 PoC).** `index.html` + `admin.html` + the serverless functions, on the Netlify site `super-frangollo-c3a14a` (not promoted). Booking/availability via Netlify Blobs, Resend, PDF job card. Live assistant quotes the flat £15 + VAT surcharge, treats Winchcombe as core. Live `index.html` is still the old blue with the old stats, fix at/by cutover.

**2. Phase 1 public site (Astro, `site/`).** In `main`, 22 routes, polished (PR #5), **dormant** until the cutover PR. Blocked on Mark (privacy `[to confirm]` + DP review) and the domain (D-013). Independent of Phase 2.

**3. Phase 2 operational backend — IN PROGRESS.** Built in slices that each leave `main` deployable, **local-first** (no hosted Supabase project, D-009). Three stacked PRs (below).

### Phase 2 PRs (stacked, merge in order; none merged)

| Slice | Branch | PR | What | State |
|---|---|---|---|---|
| 0 | `chore/d014-monorepo` | **#6** to `main` | Functions to `server/` (D-014) | green (`node --test` 8/8) |
| 1 | `feat/shared-config` | **#7** to #6 | `shared/config` models/pricing/area (D-006/D-007) | green; prompt byte-identical |
| 2 | `feat/supabase-schema` | **#8** to #7 | Supabase schema + pgTAP (D-002) | **verified 10/10 + hardened** (L-011) |

`node --test` is the only logic gate locally; **no CI**, Netlify auto-deploys `main` from GitHub. Each PR's deploy preview is where `/api/*` is confirmed before merge. **Note:** the Slice branches were cut before the Node 24 merge (PR #9), so each will conflict on `netlify.toml` + `package.json` at merge, keep Node 24 (D-017).

## What was done this session (5 June 2026, daytime)

- Synced `main` (was 28 behind), read the doc set, approved a sliced Phase 2 plan. Locked: backend folder = **`server/`**; **local-first Supabase** (D-009); backend-AI scope = all of it incl. invoice interpretation + AI chasing.
- **Slice 0 (#6)** — `git mv` functions to `server/netlify/functions/` (history kept); `netlify.toml` functions path; test require paths repointed + root `"test"` script; `app/` placeholder; docs. Deferred (D-014 addendum): npm workspaces + `server/package.json`, and the build-scope `ignore`. `node --test` 8/8.
- **Slice 1 (#7)** — extracted model names + pricing table + service-area/surcharge into `shared/config/*.js` (CommonJS, so the CJS functions + `node --test` can load them). `chat.js` imports the model and **generates** the PRICING + SERVICE AREA prompt blocks from config. **Parity verified: the assembled prompt is byte-identical**, so the prompt-cache prefix is unchanged (L-002). `core_postcodes` seeded from the Astro frontmatter with a `TODO(D-011 boundary)`.
- **Slice 2 (#8)** — `supabase/migrations/20260605115456_init.sql`: `customers / jobs / job_photos / job_assessments / invoices / messages`; enums; `updated_at` triggers; **RLS enabled, no policies** (service-role only); **double-booking is a DB invariant** via a `btree_gist` exclusion constraint; availability derived from jobs. `supabase/tests/schema_test.sql` (pgTAP) proves the guard. Supabase CLI added as a devDependency. (Could not run `supabase test db` on the work machine, Docker OOM'd; verified at home in the evening.)
- Recorded **D-016**: registered address kept **private**; ICC runs as a service-area business.

## Done this evening (5 June 2026, at home)

- **Pulled the work and verified Slice 2.** Ran Docker + the Supabase stack at home: `supabase test db` to pgTAP **8/8**, then **10/10** after hardening. Fixed a `throws_ok` gotcha (L-011).
- **Node 20 to 24 (D-017), live on `main`.** Node 20 hit EOL 30 Apr 2026; pinned 24 via `netlify.toml` `NODE_VERSION` + `engines` + `.nvmrc` on `chore/node-version` (PR #9), verified on the deploy preview and confirmed live in production (`a7131f2`) via the Netlify CLI. Installed + linked the **Netlify CLI** (site `super-frangollo-c3a14a`).
- **Pre-merge review (5 parallel agents) + fixes**, pushed to `feat/supabase-schema`:
  - **Slice 2 hardened:** the double-booking guard now blocks only **committed** jobs (`booked`/`in_progress`), so an enquiry never holds a slot (an abandoned enquiry can't corrupt availability); the slot is claimed at the `booked` transition (2 new pgTAP cases). Trading hours set to **09:00 to 16:30** (Mark) as whole-hour slots ending by 16:00. Added constraints: `customers.email` UNIQUE, `invoices.amount_ex_vat > 0`, `job_assessments.source` enum check, no `sent` message with a null body.
  - **Slice 1:** the furniture surcharge in the confirmation email + PDF now reads `pricing.priceOf("furniture_moving")` (no drift); added the `priceOf` helper.
  - Review also flagged (not blockers): no root `package-lock.json` so deps float between builds; the D-011 postcode boundary is still a `TODO`.

## Immediate next steps (suggested order)

1. **Verify Slice 2: DONE.** pgTAP 10/10 at home (+ hardened, L-011); #8 is unblocked. The first real action is the merges (step 2).
2. **Merge the stack in order** with sign-off: **#6 to #7 to #8**. On each PR's **deploy preview**, confirm `/api/chat` (check_availability) + `/api/bookings` still respond. **Expect a Node-version conflict:** each branch was cut before PR #9, so #6 (and likely #7/#8) conflicts on `netlify.toml` + `package.json`; resolve keeping the `server/...` functions path AND `NODE_VERSION=24` / engines 24 (D-017). GitHub auto-retargets the next PR's base as each lands.
3. **Slice 3: `/api/v1/*` + server-side pricing/surcharge enforcement** (D-003/D-011/D-012). New versioned endpoints alongside the live ones; `shared/contract/` types; the `validateBooking` successor enforces the D-011 surcharge/boundary from `serviceArea.js`, using `pricing.priceOf` for figures. Built on the now-verified schema.
4. **Slice 4: backend AI** through the `messages` table (draft to approve to send): photo-assessment re-run, invoice interpretation + chasing, summaries, NL admin queries (read-only/whitelisted), re-engagement (consent-gated, Phase 4).
5. **Slice 5: Blobs to Postgres migration + client repoint + Supabase Auth** (sign-off-gated, LAST; only slice that changes live behaviour).
6. **Separate stream: Phase 1 site cutover** (blocked on Mark privacy + domain D-013): `netlify.toml` `publish = site/dist`, lock `astro.config.mjs` `site`. Independent of Phase 2.
7. **Follow-ups noted:** wire the Astro home/services price cards to `shared/config/pricing.js` (now has `priceOf`); fill the privacy data-controller slot with the D-016 address (gated on Mark + DP review); consider committing a root `package-lock.json` for reproducible builds.

## Things to watch / not yet decided

- **The Supabase stack runs at home, not on the work machine** (the work machine OOM'd on `supabase start`). Slice 2 verified at home (pgTAP 10/10). Local data persists in a Docker volume; `npx supabase start` / `stop` to bring it up and down (first `start` pulled a few GB).
- **Node 24 live on `main` (D-017); the Slice branches still pin Node 20.** They were cut before PR #9; resolve to keep Node 24 at each merge (step 2).
- **Trading-hours half-hour (Mark):** Slice 2 encodes 09:00 to 16:30 as whole-hour slots ending by 16:00, so the 16:00 to 16:30 half-hour is not bookable. Confirm whether any job needs to end at the half-hour (would need a half-hour grid across the schema, system prompt, and tests).
- **D-009 local-first.** Do NOT create a hosted Supabase project under our identity; Mark owns it. Build locally; `supabase link && db push` to his project when it exists.
- **D-011 boundary open (Mark):** `serviceArea.js core_postcodes` is seeded from the Astro frontmatter with a `TODO`; settle the precise out-of-area postcode list, kept in that one file. Server-side enforcement lands in Slice 3.
- **D-016 address private:** GBP-verification + privacy layer only; never on the public site / NAP / structured data.
- **Slice 0 deferrals** (npm workspaces, build-scope `ignore`): see the D-014 addendum in DECISIONS.md; revisit at Slice 3 and at the app/site-cutover.
- **`shared/config` is `.js` (CommonJS), not `.ts`**: required by the CJS functions + the plain-Node test runner. Slice 3 contract *types* can be `.ts`.
- **Surcharge VAT assumption:** £15 + VAT (if Mark meant £15 all-in, change in `serviceArea.js` + re-grep).
- **The LIVE `index.html` is still blue** with the old stats: fix at/by the Phase 1 cutover (a live change, needs deploy sign-off).
- **`astro dev` fails in this worktree**: use `npm run build/preview --prefix site`.
- Domain (D-013) and account ownership (D-009) still open; monorepo rename `icc-site` to `icc-platform` is cosmetic/deferred.

## Local dev reminder

```bash
# Root: tests (the only logic gate today)
npm install
npm test                         # node --test -> test/hardening.test.js (8 tests)

# Phase 0 / Phase 2 functions live under server/netlify/functions/
cp .env.example .env             # ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_SECRET, NETLIFY_SITE_ID, NETLIFY_TOKEN
npx netlify dev                  # serves site + functions; /api/* via netlify.toml redirects (Netlify CLI now installed + linked)

# Phase 1 Astro site
npm run build --prefix site      # -> site/dist (what Netlify runs at cutover)
npm run preview --prefix site

# Phase 2 Supabase (local-first; needs Docker Desktop running)
npx supabase start               # local Postgres in Docker (runs at home; Docker Desktop must be up)
npx supabase db reset            # apply supabase/migrations/
npx supabase test db             # run supabase/tests/ (pgTAP), verifies Slice 2 (10/10)
```

Phase 2 work is a stack of branches off `main`: `chore/d014-monorepo` to `feat/shared-config` to `feat/supabase-schema` (GitHub `randommonicle/icc-site`).
