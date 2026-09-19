// [hosted] The Supabase Auth settings the admin relies on, read from the HOSTED project.
//
// Slice 5d's first layer ("public sign-ups are DISABLED in the Supabase project",
// adminAuth.js) was recorded as done on 15 June 2026 and repeated in five places, but
// nothing ever read it back. The first live read (19 Sept 2026, scripts/supabase-auth-config.mjs
// dry run, confirmed by this endpoint) found disable_signup = false. The ADMIN_EMAILS
// allowlist and RLS-with-no-policies held, so nothing was exposed, but the D-046 argument
// that a planted recovery fragment is inert rests on this flag. This test is the read-back
// the claim never had: it hits GoTrue's PUBLIC settings endpoint (no secret, the publishable
// key that already sits in admin.html) and self-skips unless ICC_HOSTED_IT=1, because it
// needs the network and the hosted project. It is RED until the flag is flipped; run it
// after the flip and at every launch check:
//   ICC_HOSTED_IT=1 node --test test/hosted-auth-settings.test.js

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const HOSTED_URL = "https://qzcfgpfvzpynnjgriqqn.supabase.co"; // icc-platform (public, also in admin.html)

function publishableKeyFromAdminPage() {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const m = html.match(/const SUPABASE_PUBLISHABLE_KEY = "(sb_publishable_[A-Za-z0-9_-]+)"/);
  assert.ok(m, "admin.html carries the publishable key");
  return m[1];
}

test("[hosted] sign-ups are disabled and the email provider is on (GoTrue /auth/v1/settings)", {
  skip: process.env.ICC_HOSTED_IT === "1" ? false : "set ICC_HOSTED_IT=1 to read the hosted project's public auth settings",
}, async () => {
  const res = await fetch(HOSTED_URL + "/auth/v1/settings", { headers: { apikey: publishableKeyFromAdminPage() }, signal: AbortSignal.timeout(15000) });
  assert.strictEqual(res.status, 200, "the public settings endpoint answers with the publishable key");
  const s = await res.json();
  assert.strictEqual(s.external && s.external.email, true, "the email provider must be on or no reset email can go out");
  assert.strictEqual(s.mailer_autoconfirm, false, "email confirmation stays required");
  assert.strictEqual(s.disable_signup, true, "public sign-ups must be DISABLED on the hosted project (Authentication, Sign In / Providers, 'Allow new users to sign up' off; or scripts/supabase-auth-config.mjs --apply --disable-signups). Read false on 19 Sept 2026.");
});
