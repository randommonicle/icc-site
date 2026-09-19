# Admin "Forgot password?" flow: what is built and the two owner steps

**Status: built on 18 September 2026 and ridden end to end against the local Supabase stack (real GoTrue, real recovery email, real redirect). Not yet merged or deployed. On hosted it works only after the Supabase Auth redirect allowlist below is set; until then a reset link lands on the project's Site URL instead of the admin page.**

Related: [DECISIONS.md](../DECISIONS.md) D-046, [ROADMAP.md](../ROADMAP.md) Phase 2 (the "Forgot password?" item), `scripts/admin-set-password.js` (the operator-run fallback that stays).

---

## What the operator sees

1. On the admin sign-in card, enter the email address and choose **Forgot password?**. The page answers "If that address has an admin account, a reset link is on its way" whether or not the address has an account (Supabase answers 200 either way). One honest exception: Supabase's own per-address send limit answers 429 only for an address that has an account, and the page reports that as "Too many reset emails in a short time" rather than pretending a link was sent. That distinction exists in Supabase's API whatever the page says (measured on the local stack, 18 September 2026: a known address 200 then 429, an unknown address 200 twice), so the page does not create it, and with two admin addresses that are no secret it is not worth a lie to the operator.
2. The email (subject "Reset Your Password", from Supabase's mailer) carries a one-time link. Opening it lands back on `/admin` showing **Set a new password**. Enter the new password twice (at least 8 characters on the page; Supabase applies the project's own policy too) and choose **Save password**.
3. The page returns to the sign-in card with "Password updated. Sign in with it." The old password no longer works.

Links expire after an hour and work once. An expired or reused link lands on the sign-in card with "That reset link has expired or was already used. Request a new one."

Nothing here widens access: every API call still checks the signed-in email against `ADMIN_EMAILS` (`adminAuth.requireAdmin`), and with sign-ups disabled on the project a reset link can only ever reach an account that already exists. **That second half is an owner setting, not a fact of the code: the first live read of the hosted project (19 September 2026) found sign-ups ENABLED, against what had been recorded since June (L-044); they were turned off the same afternoon by the scripted owner step below (`--apply --disable-signups`, on Ben's yes), which also set the Site URL and the four admin redirect URLs. `test/hosted-auth-settings.test.js` (`ICC_HOSTED_IT=1`) reads the flag back and is green; a red straight after a change is GoTrue reloading (under a minute).** **Treat the reset email as a temporary sign-in credential.** The link carries a real one-hour session for that account (that is how every email-recovery flow works), so whoever holds the link within the hour can act as that account, with or without changing the password. The mailbox is the thing to protect; the page drops the session the moment the operator leaves the recovery card, by saving or by going back, and never logs or stores it.

---

## Owner step 1 (Ben): the Site URL and the redirect allowlist

Two routes to the same two settings. The scripted one is the intended route (19 September 2026); the dashboard one below it is the fallback and the place to read the three settings the script only reports.

### Route A: one command through the Management API (scripted, 19 Sept 2026)

`scripts/supabase-auth-config.mjs` does the step through the Supabase Management API (`GET`/`PATCH /v1/projects/qzcfgpfvzpynnjgriqqn/config/auth`; field names verified against the API's own OpenAPI document on 19 September 2026). It needs a Supabase **personal access token**: supabase.com, account menu, **Access Tokens**, generate one (name it, e.g. `icc auth config`), then add one line to the git-ignored `.env` in the repo root, `SUPABASE_ACCESS_TOKEN=` followed immediately by the token (no space, never into chat). The token is account-wide: revoke it on the same page once the step is done, or keep it for the domain cutover and record which in the handover.

```powershell
node scripts/supabase-auth-config.mjs
```

The dry run GETs the live config and prints only the fields that matter (Site URL, allowlist, sign-ups, email provider, OTP expiry, minimum password length, the per-address email rate limit, whether the recovery template is customised and still carries `{{ .ConfirmationURL }}`), the checks, and the exact body it would send. It never prints the raw response, which carries the project's SMTP password and every provider and hook secret. Read the output, then:

```powershell
node scripts/supabase-auth-config.mjs --apply
```

`--apply` sends a PATCH with exactly two fields, `site_url` (default `https://super-frangollo-c3a14a.netlify.app`; at the cutover run it again with `--site-url https://www.intelligentclean.co.uk`) and `uri_allow_list` (the four admin URLs below, added to whatever is already on the list, nothing dropped; `--replace` sets exactly the four), then GETs again and prints the two values back, exit 0 only when both match. It **refuses** (exit 2, nothing sent) unless `disable_signup` reads a literal `true`, because sign-ups being off is what keeps a stranger's planted recovery fragment inert on the admin page; a WARN line, not a refusal, for an OTP expiry other than 3600 s, a customised recovery template without `{{ .ConfirmationURL }}`, or the email provider being off. No redeploy is needed; Supabase reads the allowlist at request time.

The wildcard entry is `https://*--super-frangollo-c3a14a.netlify.app/admin` with a single `*` on purpose: in Supabase's redirect globs `*` matches any run of non-separator characters and the separators are `.` and `/` (supabase.com/docs/guides/auth/redirect-urls), so the matched host can only be a real `<deploy>--super-frangollo-c3a14a.netlify.app` preview or branch host. The docs' own Netlify example uses `**`, which matches any sequence including `/` and would also accept an attacker's host whose path carried the suffix; do not "upgrade" it.

### Route B: the dashboard (fallback, and where the three assumed settings are read)

The page asks Supabase to send the operator back to **its own origin plus `/admin`**, so one build serves every host. Supabase only honours a redirect target that is on the project's allowlist; anything else silently falls back to the project **Site URL**.

Supabase dashboard → project `icc-platform` → **Authentication → URL Configuration**:

- **Redirect URLs**: add each origin the admin page is served from, exact, with the path:
  - `https://super-frangollo-c3a14a.netlify.app/admin`
  - `https://www.intelligentclean.co.uk/admin` (before or at the domain cutover)
  - `https://intelligentclean.co.uk/admin` (belt and braces: the target is computed from the origin the admin page was opened on, and Netlify sends the apex to `www` before the page runs once `www` is primary, so this entry is only reached if the page is ever served on the apex without that redirect; harmless to add)
  - `https://*--super-frangollo-c3a14a.netlify.app/admin` for Netlify deploy previews and branch deploys, which serve the admin page on their own origins (Supabase accepts `*` wildcards in this list; confirm the exact syntax in the dashboard's help text when adding it).
- **Site URL**: check it **before** the flow is first used on hosted, not at the cutover. It is where a reset link lands when the requesting origin is not on the list above, carrying the session in the URL fragment, so it must be a host ICC controls: today that is `https://super-frangollo-c3a14a.netlify.app`; at the cutover it becomes `https://www.intelligentclean.co.uk`. Never a host that serves anything third-party (the review of 18 September noted a stale comment in `netlify.toml` still describing the real domain as a parking page with third-party ads; the parking record was removed on 30 July and the domain resolves to nothing today, but the point stands for any host the Site URL names).
- While there, confirm three settings the flow assumes, which cannot be read from the repo: **Authentication → Providers → Email**: "Allow new users to sign up" is off (it is what makes a planted `#access_token=...&type=recovery` link from a stranger's account inert on this page); **Authentication → Email Templates → Reset password** still uses `{{ .ConfirmationURL }}` (a `{{ .TokenHash }}` template would never deliver the session to the page); **Authentication → Email**: the email OTP expiry is 3600 seconds (the page and this document say "an hour"; older projects default to 86400).

No redeploy is needed for this step; the allowlist is read by Supabase at request time.

The local stack mirrors this: `supabase/config.toml` lists `http://127.0.0.1:3000/admin` in `additional_redirect_urls`, which is what the 18 September ride used.

## Owner step 2 (Ben, optional but recommended before relying on it): the email sender

Recovery emails go out through Supabase's **built-in mailer**, which is meant for development: it is rate-limited to a handful of emails an hour per project (the local stack's `[auth.rate_limit] email_sent = 2` mirrors the hosted default) and sends from a generic Supabase address that spam filters may not like. Two admins resetting a password on the same afternoon is inside the limit; a filter eating the email is the likelier failure.

To make it production-grade: Supabase dashboard → **Authentication → SMTP Settings** → enable custom SMTP with the SMTP details Resend shows in its own dashboard (the username is fixed and the password is a Resend API key from the ICC account; take the host and port from there rather than from memory) and a sender on the verified `intelligentclean.co.uk` domain. Then **Authentication → Email Templates → Reset password** can carry ICC wording. Neither is needed for the flow to function.

---

## If it does not work

- **The link lands on the site's home page (or the `.netlify.app` root) instead of the admin card:** the origin is not on the redirect allowlist (owner step 1). The token is in that page's URL fragment for up to an hour; open a fresh link after fixing the allowlist rather than pasting the old one about.
- **No email arrives:** check spam, then the Supabase dashboard's Auth logs for the send; the built-in mailer's hourly cap answers 429, which the page reports as "Too many reset emails in a short time".
- **"That reset link has expired or was already used":** request a new one; links are single-use and expire after an hour.
- **Everything else fails:** `scripts/admin-set-password.js` still resets a password from the checkout that holds the real `.env` (service role, never printed). It is the fallback, not the primary path.

---

## How it is built (for whoever touches it next)

- All in `admin.html`, in the block headed `// --- Password recovery`, using the same raw GoTrue REST as the sign-in (no supabase-js on the page):
  - the request is `POST {SUPABASE_URL}/auth/v1/recover?redirect_to=<origin>/admin` with the email in the body and the publishable key as `apikey`;
  - the link GoTrue emails is `/auth/v1/verify?...&type=recovery&redirect_to=...`; on success GoTrue redirects to `redirect_to` with the session in the URL fragment (`#access_token=...&type=recovery`), the implicit flow, because the page sends no PKCE challenge;
  - at load the page reads that fragment once, wipes it from the address bar and history with `history.replaceState` before anything else runs, keeps the token in a variable only, and spends it on one `PUT {SUPABASE_URL}/auth/v1/user` with the new password; the token is never logged or stored;
  - an expired or reused link arrives as an error fragment (`error_code=otp_expired`) and is explained on the sign-in card; any other fragment type (`invite`, `magiclink`) is wiped and ignored, so a dashboard invite link landing on `/admin` shows a plain sign-in card (operators are created with a password, so nothing uses those here);
  - the fragment is read by the last statement of the script, inside a `try`, so a throw there is reported on the sign-in card and can never leave the rest of the page half-initialised;
  - both fetches are time-bounded (15 s; the page's older fetches are not, yet), a 429 from GoTrue has its own message, an address GoTrue refuses (400/422) says "Check the email address", and GoTrue's own refusal text on the save (too short for the project policy, same as the old password) is rendered as inert text (L-003).
- Pinned statically by `test/admin-html-syntax.test.js` ("password recovery": the own-origin redirect, the wipe preceding the first use of the token, no sink named in the block, the clears on leaving the card, the non-committal success note, the 429 and 400 branches, exactly two time-bounded fetches, inert rendering in the block and in `showLoginError`, the init call as the last statement) and behaviourally by `test/admin-recovery-behaviour.test.js`, which runs the page's real inline script in `node:vm` with a stub DOM, fetch, location and history (the token is still empty at the instant of the wipe; Back, the save, the client and GoTrue refusals, the terminal 401, the reset request's URL and branches, a throwing handler, and a sink recorder that must stay empty). The static pin was proven red by removing the wipe; the behavioural test by a reviewer's mutation (a `return` before the clears) that the static pins let through.
- Ridden on 18 September 2026 against the local stack (Postgres 17.6, GoTrue via `supabase start`, Mailpit on 54324): request, email, link, recovery card, the three refusals (too short, mismatch, same as old), the save, the old password refused, the new one signing in, and the spent link explained. The ride is repeatable: `node scripts/ride-admin-recovery-local.mjs` creates a throwaway local user and serves a copy of `admin.html` with the local Supabase URL and key swapped in (the checked-in page hard-codes the hosted ones), on `http://127.0.0.1:3000`; `--cleanup` removes the user and the copy.
