# Admin "Forgot password?" flow: what is built and the two owner steps

**Status: built on 18 September 2026 and ridden end to end against the local Supabase stack (real GoTrue, real recovery email, real redirect). Not yet merged or deployed. On hosted it works only after the Supabase Auth redirect allowlist below is set; until then a reset link lands on the project's Site URL instead of the admin page.**

Related: [DECISIONS.md](../DECISIONS.md) D-046, [ROADMAP.md](../ROADMAP.md) Phase 2 (the "Forgot password?" item), `scripts/admin-set-password.js` (the operator-run fallback that stays).

---

## What the operator sees

1. On the admin sign-in card, enter the email address and choose **Forgot password?**. The page answers "If that address has an admin account, a reset link is on its way" whether or not the address has an account (Supabase answers 200 either way). One honest exception: Supabase's own per-address send limit answers 429 only for an address that has an account, and the page reports that as "Too many reset emails in a short time" rather than pretending a link was sent. That distinction exists in Supabase's API whatever the page says (measured on the local stack, 18 September 2026: a known address 200 then 429, an unknown address 200 twice), so the page does not create it, and with two admin addresses that are no secret it is not worth a lie to the operator.
2. The email (subject "Reset Your Password", from Supabase's mailer) carries a one-time link. Opening it lands back on `/admin` showing **Set a new password**. Enter the new password twice (at least 8 characters on the page; Supabase applies the project's own policy too) and choose **Save password**.
3. The page returns to the sign-in card with "Password updated. Sign in with it." The old password no longer works.

Links expire after an hour and work once. An expired or reused link lands on the sign-in card with "That reset link has expired or was already used. Request a new one."

Nothing here widens access: every API call still checks the signed-in email against `ADMIN_EMAILS` (`adminAuth.requireAdmin`), and sign-ups stay disabled, so a reset link can only ever reach an account that already exists. **Treat the reset email as a temporary sign-in credential.** The link carries a real one-hour session for that account (that is how every email-recovery flow works), so whoever holds the link within the hour can act as that account, with or without changing the password. The mailbox is the thing to protect; the page drops the session the moment the operator leaves the recovery card, by saving or by going back, and never logs or stores it.

---

## Owner step 1 (Ben, Supabase dashboard): the redirect allowlist

The page asks Supabase to send the operator back to **its own origin plus `/admin`**, so one build serves every host. Supabase only honours a redirect target that is on the project's allowlist; anything else silently falls back to the project **Site URL**.

Supabase dashboard → project `icc-platform` → **Authentication → URL Configuration**:

- **Redirect URLs**: add each origin the admin page is served from, exact, with the path:
  - `https://super-frangollo-c3a14a.netlify.app/admin`
  - `https://www.intelligentclean.co.uk/admin` (before or at the domain cutover)
  - `https://intelligentclean.co.uk/admin` (belt and braces: the target is computed from the origin the admin page was opened on, and Netlify sends the apex to `www` before the page runs once `www` is primary, so this entry is only reached if the page is ever served on the apex without that redirect; harmless to add)
- **Site URL**: set to `https://www.intelligentclean.co.uk` at the cutover if it is not already. It is only the fallback for this flow, but Supabase also uses it in email templates.

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
  - an expired or reused link arrives as an error fragment (`error_code=otp_expired`) and is explained on the sign-in card;
  - both fetches are time-bounded (15 s), a 429 from GoTrue has its own message, and GoTrue's own refusal text (too short for the project policy, same as the old password) is rendered as inert text (L-003).
- Pinned by `test/admin-html-syntax.test.js` ("password recovery"): the own-origin redirect, the wipe preceding the first use of the token, no logging of the token, the no-enumeration wording, the 429 branch, exactly two time-bounded fetches, and inert rendering. The pin was proven red by removing the wipe.
- Ridden on 18 September 2026 against the local stack (Postgres 17.6, GoTrue via `supabase start`, Mailpit on 54324): request, email, link, recovery card, the three refusals (too short, mismatch, same as old), the save, the old password refused, the new one signing in, and the spent link explained.
