#!/usr/bin/env node
// Set (reset) an admin user's password through the Supabase Admin API.
//
// The admin dashboard signs in with Supabase Auth email + password (Slice 5d). Since
// 18 Sept 2026 it also has a self-service "Forgot password?" flow (D-046,
// docs/ADMIN_PASSWORD_RESET.md), which is the primary path. This script is the
// fallback for when that flow cannot be used (the reset email not arriving, the
// redirect allowlist not yet set): it resets the password with the service-role key
// from the local .env, which never leaves this machine.
//
// Usage (run from the checkout that holds the real .env, so it is read from cwd):
//   $env:ICC_NEW_PASSWORD = 'the new password'        (PowerShell)
//   node scripts/admin-set-password.js ben@intelligentclean.co.uk
//   Remove-Item Env:ICC_NEW_PASSWORD
// The password is taken from the environment, never from the command line (which
// would land in shell history), and is never printed.

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const password = process.env.ICC_NEW_PASSWORD || "";
  if (!email || !email.includes("@")) throw new Error("usage: node scripts/admin-set-password.js <admin email>  (with ICC_NEW_PASSWORD set in the environment)");
  if (password.length < 12) throw new Error("ICC_NEW_PASSWORD must be set and at least 12 characters");

  const envFile = process.env.ICC_ENV_FILE || path.join(process.cwd(), ".env");
  if (!fs.existsSync(envFile)) throw new Error(`no .env at ${envFile}; run from the checkout that holds it, or set ICC_ENV_FILE`);
  const env = loadEnv(envFile);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error(".env must carry SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const user = data.users.find((u) => (u.email || "").toLowerCase() === email);
  if (!user) throw new Error(`no Supabase Auth user with email ${email} (sign-ups are disabled; create the user in the dashboard first)`);

  const res = await sb.auth.admin.updateUserById(user.id, { password });
  if (res.error) throw res.error;
  console.log(`password updated for ${user.email} (user ${user.id}). Sign in at /admin with the new password.`);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
