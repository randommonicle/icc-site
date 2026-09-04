# Go-live runbook — domain cutover, dedicated Resend, and search visibility

**Status: pre-launch.** The site is live and fully functional on the temporary host
`super-frangollo-c3a14a.netlify.app`, deliberately held out of Google's index by a
site-wide `noindex` header (`netlify.toml`, `TODO(prelaunch/noindex)`). The code is
SEO-ready; going live is a sequencing exercise across a few out-of-repo systems.

This is the single ordered entry point for launch. It ties together the existing
piece-docs rather than repeating them:
[LAUNCH_GBP_PROFILE.md](LAUNCH_GBP_PROFILE.md) (Google Business Profile + the ICC phone),
[LAUNCH_ICO_REGISTRATION.md](LAUNCH_ICO_REGISTRATION.md) (ICO),
[REVIEW_REQUESTS_SETUP.md](REVIEW_REQUESTS_SETUP.md) (the review engine switch-on),
and [DECISIONS.md](../DECISIONS.md) D-013 (domain) / L-001 (origins) / L-018 (Netlify env scopes).

---

## The one rule that protects Mark's email

The cutover uses **external DNS**: the domain's DNS stays at **123reg**, and only the
**website records (apex `A`, `www` `CNAME`)** change to point at Netlify. **Do not
delegate the nameservers to Netlify DNS.** Mark's Google Workspace mailboxes (the `MX`
records, including `mark_director@`) and all mail authentication (`SPF`, the Resend
`DKIM`/return-path on the `send` subdomain, the shared `_dmarc`) live in the 123reg
zone. Switching nameservers would drop every one of those until re-created, taking down
Mark's email and all booking mail. Changing only the web records leaves mail untouched.

---

## Order of operations (critical path)

Owners: **[B]** Ben, **[M]** Mark (account owner, D-009), **[C]** code (me).

```
GATE 0  Prerequisites that must clear before going public
  ├─ Privacy notice: human data-protection review           [M/B]  gates STEP 3
  ├─ ICO registration number (ZC230232 — DONE, in privacy.astro)   ✓
  └─ ICC's own 01452 phone provisioned (action A1)          [B]    gates STEP 5/6

STEP 1  Dedicated ICC Resend account                         [M/B/C]  independent of the domain
STEP 2  Domain cutover (DNS web records → Netlify)           [B]      needs GATE 0 privacy review to be near
STEP 3  Flip to indexable (remove noindex, set origins)      [C/B]    AFTER step 2 + privacy review
STEP 4  Google Search Console + Bing + submit sitemap        [B]      AFTER step 3
STEP 5  Phone swap 01242 → 01452 across the repo             [C/B]    AFTER GATE 0 phone
STEP 6  Google Business Profile + review engine switch-on    [M/B]    AFTER GATE 0 phone
```

STEP 1 (Resend) and STEP 2 (domain) both touch 123reg DNS but are independent of each
other. STEP 3 is the moment the site becomes findable, so it must not run before the
privacy review is done. Local ranking (STEP 6) is the real lever for a service-area
business and is gated on the phone, so treat the phone as the top pacing item.

---

## STEP 1 — Dedicated ICC Resend account

Decision (this session): ICC gets its **own** Resend account, business-owned (D-009),
separate from any personal account, so its sending reputation and billing are isolated.

Mechanics — the domain is already verified in the *current* Resend account, so this is a
re-verification in the new one, done without a sending gap:

1. **[M/B]** Create a Resend account at https://resend.com using Mark's business email so
   ICC owns it (D-009). Add a payment method / plan appropriate to volume (the free tier
   is 3,000/month, 100/day; booking + review mail is well inside that, but a paid plan
   removes the daily cap and improves support).
2. **[M/B]** Add the domain `intelligentclean.co.uk`. Resend's wizard shows the exact
   records to create: a `DKIM` `CNAME` (or TXT), an `SPF`/return-path entry on the
   **`send` subdomain** (matches the D-013 design), and it uses the shared `_dmarc`
   already present. **[B]** Add these at 123reg **alongside** the existing account's
   records — do not remove the old ones yet.
3. Wait for Resend to show the domain **Verified** (DNS propagation, usually minutes to a
   few hours).
4. **[M/B]** Create a production **API key** in the new account.
5. **[B]** In Netlify → Site settings → Environment variables, replace `RESEND_API_KEY`
   with the new key. On this Personal plan add it for **all scopes**, never a specific
   scope (L-018). Keep `OPERATOR_FROM`, `CUSTOMER_FROM`, `OPERATOR_EMAIL`,
   `CUSTOMER_REPLY_TO` as they are.
6. **[B]** Trigger a redeploy (functions read env vars from the deploy snapshot, so the
   new key is inert until a fresh deploy — Deploys → Trigger deploy → Deploy site).
7. **[B]** Smoke test: place a test booking through the live site with your own email;
   confirm the customer confirmation and the operator email to Mark both arrive, and
   check the Resend dashboard of the **new** account shows the sends. Then delete the
   test job.
8. **[B]** Only after the new account is confirmed sending, remove the **old** account's
   DNS records from 123reg and decommission it. Keeping them until then means zero
   sending downtime.

Cutover risk if reversed: swapping the key before the new domain verifies, or removing
the old records first, causes silent send failures (`chat.js` now surfaces these to the
customer since `7626bfc`, but still avoid the gap).

---

## STEP 2 — Domain cutover (web records only)

1. **[B]** In Netlify → Domain management, add the custom domain
   `www.intelligentclean.co.uk` and set it as the **primary** domain, and add the apex
   `intelligentclean.co.uk` (Netlify creates the apex → www redirect automatically once
   www is primary). This matches the canonical the code already emits
   (`astro.config.mjs` `site` = `https://www.intelligentclean.co.uk`).
2. **[B]** At 123reg DNS, make **only** these web-record changes (leave `MX`, `SPF`,
   `DKIM`, `_dmarc`, and any Google site-verification `TXT` exactly as they are):
   - Remove the 123reg **parking-page** records (the A/CNAME serving the ads page).
   - **Apex** `@` / `intelligentclean.co.uk`: `A` record → **75.2.60.5** (Netlify's load
     balancer for external DNS).
   - **`www`**: `CNAME` → **`super-frangollo-c3a14a.netlify.app`**.
   - Use the exact targets **Netlify shows** when you add the domain; if they differ from
     the above, Netlify's are authoritative.
   - If 123reg allows, lower the TTL on these records an hour beforehand for a faster switch.
3. **[B]** Wait for DNS to resolve, then let Netlify provision the Let's Encrypt SSL
   certificate (automatic once the records resolve). Confirm `https://` works on both
   apex and www and that apex redirects to www.

At this point the real domain serves the site, but it is still `noindex` (STEP 3 removes that).

---

## STEP 3 — Flip to indexable

**Gate: do not run this until the privacy-notice data-protection review is done** (the
reason the pre-launch `noindex` exists — the notice should not be the first thing Google indexes).

1. **[C]** In `netlify.toml`, delete the entire final block marked
   `PRE-LAUNCH ONLY — DELETE THIS BLOCK AT THE DOMAIN CUTOVER (D-013)` — the
   `[[headers]]` for `/*` that sets `X-Robots-Tag = "noindex, nofollow"` (and its comment
   banner, `TODO(prelaunch/noindex)`). Leave the `/admin*` `noindex` header in place; the
   admin dashboard must stay out of the index.
2. **[B]** In Netlify env vars (all scopes), set:
   - `ALLOWED_ORIGINS` = `https://intelligentclean.co.uk,https://www.intelligentclean.co.uk`
     (closes L-001 — turns the chat origin check to strict).
   - `PUBLIC_SITE_URL` = `https://www.intelligentclean.co.uk` (already the default; set it explicit).
3. **[B]** Commit the `netlify.toml` change and deploy (a normal push builds; note the
   `[skip ci]` deploy trap below). Confirm the deploy actually ran, not skipped.
4. **[B/C]** Verify: `curl -sI https://www.intelligentclean.co.uk/` shows **no**
   `X-Robots-Tag: noindex` (and `/admin` still does). Confirm `robots.txt` and
   `sitemap-index.xml` resolve on the real domain.

> **`[skip ci]` deploy trap:** Netlify reads the **head** commit of a push. If the tip
> commit message contains `[skip ci]` (e.g. a handover-doc commit), Netlify skips the
> whole build even when the push also contains code — the code silently does not deploy.
> Either make the code commit the tip, or trigger a manual build (Deploys → Trigger
> deploy, or the API `POST /sites/{id}/builds`), which ignores `[skip ci]`.

---

## STEP 4 — Search Console, Bing, sitemap

1. **[B]** Google Search Console (https://search.google.com/search-console): add a
   **Domain property** for `intelligentclean.co.uk` and verify with the `TXT` record it
   gives you (add at 123reg — does not affect email). A domain property covers apex, www,
   http and https in one.
2. **[B]** Submit the sitemap: `https://www.intelligentclean.co.uk/sitemap-index.xml`.
3. **[B]** Request indexing (URL Inspection) for the key pages: home, services, book,
   and the area pages.
4. **[B]** Bing Webmaster Tools (https://www.bing.com/webmasters): import the property
   from Search Console (one click) and submit the same sitemap. Covers Bing + DuckDuckGo.

Indexing is not instant. Expect days for first coverage and weeks to months for
meaningful ranking on a new domain; reviews (STEP 6) are the biggest accelerant.

---

## STEP 5 — Phone swap 01242 → 01452

**Gate: ICC's own 01452 number is provisioned (action A1).** Until then the site keeps
`01242 279590` on purpose (it works and reaches Mark) — do not swap to a placeholder.

**[C]** When the number exists, swap it in one pass across every ICC customer-facing
surface (NAP must change in lockstep). Targets, per
[LAUNCH_GBP_PROFILE.md](LAUNCH_GBP_PROFILE.md):

- `site/src/pages/{privacy,contact,book}.astro`
- `site/src/layouts/BaseLayout.astro` — the LocalBusiness `telephone` (in `+44` format)
- `server/netlify/functions/{chat,handoffs,bookingDecision}.js` — the system prompt and
  the email/PDF "call us" fallbacks
- `test/{bookings-chat,escalation,handoffs}.test.js` — these assert the number, so they
  swap in lockstep (grep the repo for `279590` and `01242` to catch every one)
- Leave the root `index.html` (the retained Blobs-era rollback) as-is; Regency keeps 01242 279590.

Run `node --test` + `npm run build --prefix site` green before deploying.

---

## STEP 6 — Google Business Profile + review engine

**[M/B]** Create and verify the GBP from [LAUNCH_GBP_PROFILE.md](LAUNCH_GBP_PROFILE.md)
(service-area business, address hidden, the new 01452 number as primary, correct primary
category, service areas, photos). This is the single biggest local-ranking lever.

**[C] Before switching the engine on**, update the privacy notice (Fix 3 in
[PRIVACY_REVIEW_2026-09.md](PRIVACY_REVIEW_2026-09.md)): add The SMS Works to the
processor list and a review-request purpose + lawful basis. Sending review emails/texts
before the notice discloses them is a UK GDPR Art 13 gap.

**[B]** Then switch on the review engine per
[REVIEW_REQUESTS_SETUP.md](REVIEW_REQUESTS_SETUP.md): set `GOOGLE_REVIEW_URL` (the
`g.page/r/...` short link from the GBP) and `SMSWORKS_API_KEY` in Netlify, redeploy, and
smoke-test to yourself.

---

## Post-launch verification checklist

- [ ] `https://` valid on apex + www; apex 301-redirects to www; `http` → `https`.
- [ ] `curl -sI https://www.intelligentclean.co.uk/` has **no** `noindex`; `/admin` still does.
- [ ] `robots.txt` and `sitemap-index.xml` resolve on the real domain; sitemap URLs are all `www.`.
- [ ] Canonical, `og:url` on a live page resolve to the `www.` domain.
- [ ] A real on-time test booking confirms; both emails arrive from the **new** Resend account; test job deleted.
- [ ] Search Console: domain verified, sitemap submitted, no coverage errors.
- [ ] (After STEP 5) the live phone everywhere is the 01452 number.
- [ ] (After STEP 6) GBP verified; a review-request smoke to yourself sends email + SMS.

## Rollback

- The `super-frangollo-c3a14a.netlify.app` host keeps working throughout; nothing forces
  traffic to the custom domain until DNS resolves.
- Resend: keep the old account and its DNS records until the new one is verified and a
  test send passes (STEP 1.8); revert `RESEND_API_KEY` + redeploy to fall back.
- Indexing: re-add the `noindex` block to `netlify.toml` and redeploy to pull back out of
  the index if needed.
- Bookings store: `BOOKINGS_STORE` unset + redeploy reverts bookings to the legacy Blobs
  path (the existing D-021 rollback), independent of this cutover.
