# ICC Platform — Next Session / Handover

Live handover note. Read this and [CLAUDE.md](CLAUDE.md) first. Update this file at the end of every working session so the next person (or AI) can continue cold.

**Last updated:** 11 June 2026. **This session: closed out the website contact sweep — swept the last stale `talktoregency@gmail.com` → `hello@intelligentclean.co.uk` and `intelligentcarpetcleaning.co.uk` → `intelligentclean.co.uk` references across the dormant Astro `site/`, plus `.env.example` and the CLAUDE.md client-contact line, verified by a clean 22-page build (this branch `chore/contact-email-and-handover`, PR #11). Previous session (10 June): the hosted ICC Supabase project went live + CLI-linked, and the full email stack on `intelligentclean.co.uk` (Resend + Google Workspace + DNS + app From-addresses) was set up and verified end-to-end — see the 10 June section below.** **Phase 2 backend Slices 0–2 are merged to `main` and live in production.** The stack `#6 → #7 → #8` (functions to `server/`, `shared/config` single source, Supabase schema) was merged in order and verified: production now serves `09a5417`, `node --test` is 8/8 on merged `main`, and the live `/api/chat` (check_availability) + `/api/bookings` respond correctly. **Next action: Slice 3** (`/api/v1/*` + server-side D-011 surcharge/boundary enforcement). Working tree clean. Phase 1 (Astro site) remains in `main`, **not cut over**. The Supabase schema is in the repo but **local-first and not wired to the live functions**, so the merge changed no live behaviour.

---

## Current state — three streams

**1. Live (Phase 0 PoC).** `index.html` + `admin.html` + the serverless functions, on the Netlify site `super-frangollo-c3a14a` (not promoted). Booking/availability via Netlify Blobs, Resend, PDF job card. Live assistant quotes the flat £15 + VAT surcharge, treats Winchcombe as core. Live `index.html` is still the old blue with the old stats, fix at/by cutover. Functions now resolve from `server/netlify/functions/` (Slice 0) and the assistant prompt is generated from `shared/config` (Slice 1, byte-identical). Live availability is still the Phase 0 grid (09:00–17:00 from Blobs) — the schema's hardened 09:00–16:30 hours are NOT wired in yet.

**2. Phase 1 public site (Astro, `site/`).** In `main`, 22 routes, polished (PR #5), **dormant** until the cutover PR. Blocked on Mark (privacy `[to confirm]` + DP review) and the domain (D-013). Independent of Phase 2.

**3. Phase 2 operational backend — Slices 0–2 DONE (merged + live).** Built in slices that each leave `main` deployable, **local-first** (no hosted Supabase project, D-009).

### Phase 2 slices

| Slice | Branch | PR | What | State |
|---|---|---|---|---|
| 0 | `chore/d014-monorepo` | #6 | Functions to `server/` (D-014) | **merged + live** (preview-verified) |
| 1 | `feat/shared-config` | #7 | `shared/config` models/pricing/area (D-006/D-007) | **merged + live** (prod-verified) |
| 2 | `feat/supabase-schema` | #8 | Supabase schema + pgTAP (D-002) | **merged + live** (prod-verified; pgTAP 10/10, L-011) |
| 3 | — | — | `/api/v1` + server-side pricing/surcharge (D-003/D-011/D-012) | **next** |

`node --test` is the only logic gate locally; **no CI**, Netlify auto-deploys `main` from GitHub. Branches `chore/d014-monorepo` and `feat/shared-config` were deleted after merge; `feat/supabase-schema` is kept (checked out in another worktree).

## What was done this session (11 June 2026)

**Astro site contact sweep (this branch `chore/contact-email-and-handover`, follow-up to PR #11).** Swept the two remaining stale strings across the dormant Phase 1 site and config: `talktoregency@gmail.com` → `hello@intelligentclean.co.uk` and `intelligentcarpetcleaning.co.uk` → `intelligentclean.co.uk`. Files: `site/astro.config.mjs` (`site`), `site/public/robots.txt` (sitemap URL), `site/src/layouts/BaseLayout.astro` (LocalBusiness JSON-LD email + `siteUrl` fallback), `site/src/pages/{contact,privacy,book}.astro` (visible email + the three in-chat fallbacks), and the `siteUrl` fallbacks in `pages/areas/index`, `pages/areas/[slug]`, `pages/guides/[slug]`. Also **`.env.example`** (the `ALLOWED_ORIGINS` example domain; `OPERATOR_EMAIL` → `mark@intelligentclean.co.uk` — operator address per D-018, not the customer-facing `hello@`) and the **CLAUDE.md** bus-factor client-contact line (→ `hello@`, Ben's call). **Verified by a real `npm run build --prefix site`:** 22 pages built clean, new domain in the sitemap + canonicals, `hello@` in the structured data, zero stale strings in `dist/`. No live behaviour changed — the Astro site is dormant and Netlify still publishes the repo root in Phase 0. Only intentional history mentions remain (DECISIONS.md D-013, the prior-session notes in this file).

## Previous session (10 June 2026)

**Hosted Supabase stood up (realises the D-009 addendum).** Created the dedicated **Intelligent Carpet Cleaning** org (Free) + **`icc-platform`** project (ref `qzcfgpfvzpynnjgriqqn`, org `byanmzeomiwnkvhtmsus`, London/eu-west-2), owned by the build-lead account for now (transfers to ICC before the Slice 5 cutover). Loaded the Slice 2 schema via the SQL Editor and verified it (6 tables, RLS on all 6, the `jobs_no_double_booking` exclusion constraint); `supabase migration repair` reconciled history so a future `db push` is clean. **Linked the Supabase CLI** to the repo. Key lesson: **use the Supabase CLI, not the MCP, for ICC** — the MCP connector's OAuth is single-org (scoped to `randommonicle's Org`) and cannot see the ICC org; the CLI's token is account-wide (L-013).

**Email stack live on `intelligentclean.co.uk` (closes L-004 sending-domain).**
- **Resend** verified (DKIM `resend._domainkey`, SPF + bounce MX on the `send` subdomain). One clean DMARC (`_dmarc`, `p=none`) after deleting a GoDaddy-default `p=quarantine` duplicate. "Enable Receiving" left OFF (inbound = Workspace).
- **Google Workspace** (Business Starter): `ben@` super-admin (recovery → Ben's personal Gmail), `mark@` owner mailbox (Ben administers; Mark is non-technical). Domain verified; Gmail MX `smtp.google.com`; root SPF; 2048-bit DKIM (`google._domainkey`, verified byte-exact) authenticated. Aliases `hello@`/`info@`/`bookings@` on `mark@`.
- **App From-addresses** set in Netlify + redeployed: `OPERATOR_EMAIL=mark@`, `OPERATOR_FROM="ICC Bookings <bookings@…>"`, `CUSTOMER_FROM="Intelligent Carpet Cleaning <hello@…>"`. **Verified end-to-end** via a live `confirm_booking` test — confirmation delivered from `hello@` to a real inbox. DNS is at 123reg/GoDaddy (nameservers `*.domaincontrol.com`); every record verified live with `Resolve-DnsName`.

**Live-app fix (this branch `chore/contact-email-and-handover`).** `chat.js`: stale `talktoregency@gmail.com` → `hello@intelligentclean.co.uk` (system prompt, confirmation email, PDF job card) and fallback origins `intelligentcarpetcleaning.co.uk` → `intelligentclean.co.uk`. `node --test` 8/8.

## Previous session (7 June 2026)

- **Merged the Phase 2 stack `#6 → #7 → #8` into `main`, in order, with sign-off**, and verified each slice live. Production serves `09a5417` (`ready`, 19s build), `node --test` 8/8 on merged `main`.
- **The predicted Node 24 merge conflict did not materialise.** Each slice branch was cut before PR #9 (Node 24), but the edits don't overlap, so git's 3-way merge kept `NODE_VERSION=24`, `engines: 24`, `.nvmrc 24`, the `server/netlify/functions` path, and the redirects/headers with no conflict. Confirmed by inspecting the merged tree before each merge.
- **Verification method:** #6 on its Netlify **deploy preview** (`/api/chat`→200, `/api/bookings`→401, bad-JSON→400). #7 and #8 **on production after merge** — Netlify would not build previews for the retargeted/reopened stacked PRs without a fresh commit (new **L-012**). Safe because atomic deploys never swap in a failed build, `node --test` proves module loading, and an immediate `/api/*` probe confirms the live functions. The `supabase` devDep did not break the build.
- **`chat.js` furniture surcharge is now config-driven** (`pricing.priceOf("furniture_moving")` → £30) in the confirmation email + PDF — behaviour-preserving (Slice 2 / evening-review carry-over).
- **Caught and fixed a stale handover at the start:** `main`'s NEXT_SESSION was two sessions behind (pre-dated PR #5/#9 and all of Phase 2); merging Slice 2 brought the 5 June version in, and this 7 June note supersedes it.
- **Hosting decision (amends D-009):** ICC gets a **dedicated Supabase organisation** (Free for build/staging, separate from the build-lead's personal `randommonicle's Org`), not a project inside it. Mark gets member access; ownership/billing transfer to ICC later; **no real customer PII on any personal-org instance** (see DECISIONS D-009 addendum, 7 June). **Pending Ben action:** create the ICC org + `icc-platform` project (London / eu-west-2, Free), then we `supabase link` + `db push` the Slice 2 schema to it and build Slice 3 against it. This brings the hosted instance forward from Slice 5; local-first is no longer the only path. **Slice 3 planning is deliberately deferred until the hosted project exists** (Ben's call, 7 June), so it's planned against the real instance rather than speculatively.
- **Domain chosen (resolves D-013):** `intelligentclean.co.uk`, registered with 123reg (1 yr), DNS propagating (123reg quoted 24–48h). Unblocks, pre-promotion and when convenient: set `ALLOWED_ORIGINS` in Netlify (`https://intelligentclean.co.uk,https://www.intelligentclean.co.uk`, closes L-001), fix the now-stale `intelligentcarpetcleaning.co.uk` fallback origins in `chat.js`, lock `astro.config.mjs` `site` (sitemap/canonicals, cutover), verify a Resend sending domain (L-004), and point 123reg DNS at Netlify at go-live. None of it blocks the Supabase build.

## Previous sessions (5 June 2026)

**Daytime:**
- Synced `main` (was 28 behind), read the doc set, approved a sliced Phase 2 plan. Locked: backend folder = **`server/`**; **local-first Supabase** (D-009); backend-AI scope = all of it incl. invoice interpretation + AI chasing.
- **Slice 0 (#6)** — `git mv` functions to `server/netlify/functions/` (history kept); `netlify.toml` functions path; test require paths repointed + root `"test"` script; `app/` placeholder; docs. Deferred (D-014 addendum): npm workspaces + `server/package.json`, and the build-scope `ignore`. `node --test` 8/8.
- **Slice 1 (#7)** — extracted model names + pricing table + service-area/surcharge into `shared/config/*.js` (CommonJS, so the CJS functions + `node --test` can load them). `chat.js` imports the model and **generates** the PRICING + SERVICE AREA prompt blocks from config. **Parity verified: the assembled prompt is byte-identical**, so the prompt-cache prefix is unchanged (L-002). `core_postcodes` seeded from the Astro frontmatter with a `TODO(D-011 boundary)`.
- **Slice 2 (#8)** — `supabase/migrations/20260605115456_init.sql`: `customers / jobs / job_photos / job_assessments / invoices / messages`; enums; `updated_at` triggers; **RLS enabled, no policies** (service-role only); **double-booking is a DB invariant** via a `btree_gist` exclusion constraint; availability derived from jobs. `supabase/tests/schema_test.sql` (pgTAP) proves the guard. Supabase CLI added as a devDependency.
- Recorded **D-016**: registered address kept **private**; ICC runs as a service-area business.

**Evening (at home):**
- **Verified Slice 2.** Ran Docker + the Supabase stack: `supabase test db` to pgTAP **8/8**, then **10/10** after hardening. Fixed a `throws_ok` gotcha (L-011).
- **Node 20 to 24 (D-017), live on `main`.** Node 20 hit EOL 30 Apr 2026; pinned 24 via `netlify.toml` `NODE_VERSION` + `engines` + `.nvmrc` on `chore/node-version` (PR #9). Installed + linked the **Netlify CLI** (site `super-frangollo-c3a14a`).
- **Pre-merge review (5 parallel agents) + fixes**, pushed to `feat/supabase-schema`:
  - **Slice 2 hardened:** the double-booking guard now blocks only **committed** jobs (`booked`/`in_progress`), so an enquiry never holds a slot; the slot is claimed at the `booked` transition (2 new pgTAP cases). Trading hours set to **09:00 to 16:30** (Mark) as whole-hour slots ending by 16:00. Added constraints: `customers.email` UNIQUE, `invoices.amount_ex_vat > 0`, `job_assessments.source` enum check, no `sent` message with a null body.
  - **Slice 1:** the furniture surcharge in the confirmation email + PDF now reads `pricing.priceOf("furniture_moving")` (no drift); added the `priceOf` helper.
  - Review also flagged (not blockers): no root `package-lock.json` so deps float between builds (a lockfile was added with Slice 2); the D-011 postcode boundary is still a `TODO`.

## Immediate next steps (suggested order)

1. **Slice 3: `/api/v1/*` + server-side pricing/surcharge enforcement** (D-003/D-011/D-012). New versioned endpoints alongside the live ones; `shared/contract/` types; the `validateBooking` successor enforces the D-011 surcharge/boundary from `serviceArea.js`, using `pricing.priceOf` for figures. Built on the now-live schema. Branch off `main`.
2. **Slice 4: backend AI** through the `messages` table (draft to approve to send): photo-assessment re-run, invoice interpretation + chasing, summaries, NL admin queries (read-only/whitelisted), re-engagement (consent-gated, Phase 4).
3. **Slice 5: Blobs to Postgres migration + client repoint + Supabase Auth** (sign-off-gated, LAST; only slice that changes live behaviour). This is also where the schema's 09:00–16:30 hours replace the live Phase 0 grid.
4. **Separate stream: Phase 1 site cutover** (blocked on Mark privacy + domain D-013): `netlify.toml` `publish = site/dist`, lock `astro.config.mjs` `site`. Independent of Phase 2.
5. **Follow-ups noted:** wire the Astro home/services price cards to `shared/config/pricing.js` (now has `priceOf`); fill the privacy data-controller slot with the D-016 address (gated on Mark + DP review); the root `package-lock.json` now exists (Slice 2) so builds are reproducible.

## Things to watch / not yet decided

- **Website contact sweep — DONE (11 June 2026).** All stale `talktoregency@gmail.com` / `intelligentcarpetcleaning.co.uk` references are now swept from the dormant Astro `site/`, `.env.example`, and the CLAUDE.md client line, on branch `chore/contact-email-and-handover` (PR #11), verified by a clean 22-page build. Only historical mentions remain in the records (DECISIONS.md D-013 and the prior-session notes above), intentionally kept as history. The `astro.config.mjs` `site` and `siteUrl` fallbacks now read `https://www.intelligentclean.co.uk`; still lock/confirm `www` vs apex at the cutover.
- **Test booking to clean up.** A live `confirm_booking` test left a record in Blobs — slot **2026-06-24 10:00** blocked + a TEST booking + index entry. Delete it (needs `NETLIFY_TOKEN` + `NETLIFY_SITE_ID`) to free the slot.
- **Workspace cost before the 14-day trial converts.** Two licensed seats (`ben@` + `mark@`). If `ben@` needs no mailbox, switch it to **Cloud Identity Free** so only `mark@` is billable. Keep billing on Mark's business card; give `mark@` an admin/recovery path (D-009 bus factor).
- **`ALLOWED_ORIGINS` now settable.** Domain confirmed + `chat.js` fallbacks fixed — set `ALLOWED_ORIGINS=https://intelligentclean.co.uk,https://www.intelligentclean.co.uk` in Netlify to close L-001 (currently fail-open).
- **`deposit` guard (hardening).** The `chat.js` calendar link renders `Deposit due: undefined` when a booking omits `deposit` — add a default/guard.

- **The Supabase schema is NOT wired to the live functions.** It is in the repo, local-first; the live `/api/chat` availability still uses the Phase 0 Blobs grid (09:00–17:00). The schema's hardened **09:00–16:30** hours only take effect when the functions move to Postgres (Slice 5). No live behaviour changed at the merge.
- **The Supabase stack runs at home, not on the work machine** (the work machine OOM'd on `supabase start`). Slice 2 verified at home (pgTAP 10/10). Local data persists in a Docker volume; `npx supabase start` / `stop` to bring it up and down.
- **Trading-hours half-hour (Mark):** Slice 2 encodes 09:00 to 16:30 as whole-hour slots ending by 16:00, so the 16:00 to 16:30 half-hour is not bookable. Confirm whether any job needs to end at the half-hour (would need a half-hour grid across the schema, system prompt, and tests).
- **D-009 local-first.** Do NOT create a hosted Supabase project under our identity; Mark owns it. Build locally; `supabase link && db push` to his project when it exists.
- **D-011 boundary open (Mark):** `serviceArea.js core_postcodes` is seeded from the Astro frontmatter with a `TODO`; settle the precise out-of-area postcode list, kept in that one file. Server-side enforcement lands in Slice 3.
- **D-016 address private:** GBP-verification + privacy layer only; never on the public site / NAP / structured data.
- **Slice 0 deferrals** (npm workspaces, build-scope `ignore`): see the D-014 addendum in DECISIONS.md; revisit at Slice 3 and at the app/site-cutover.
- **`shared/config` is `.js` (CommonJS), not `.ts`**: required by the CJS functions + the plain-Node test runner. Slice 3 contract *types* can be `.ts`.
- **Surcharge VAT assumption:** £15 + VAT (if Mark meant £15 all-in, change in `serviceArea.js` + re-grep).
- **The LIVE `index.html` is still blue** with the old stats: fix at/by the Phase 1 cutover (a live change, needs deploy sign-off).
- **`astro dev` fails in this worktree**: use `npm run build/preview --prefix site`.
- **Netlify previews + stacked PRs (L-012):** a retargeted or reopened PR does NOT get a deploy preview without a fresh commit. Plan stacked-PR verification on production (atomic-deploy + tests + probe) or force previews with a throwaway commit.
- Domain (D-013) and account ownership (D-009) still open; monorepo rename `icc-site` to `icc-platform` is cosmetic/deferred.

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
npx supabase start               # local Postgres in Docker (runs at home; Docker Desktop must be up)
npx supabase db reset            # apply supabase/migrations/
npx supabase test db             # run supabase/tests/ (pgTAP), verifies Slice 2 (10/10)
```

Phase 2 Slices 0–2 are merged into `main` (GitHub `randommonicle/icc-site`). Slice 3 branches off `main`.
