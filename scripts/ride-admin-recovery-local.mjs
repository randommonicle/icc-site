#!/usr/bin/env node
// Ride the admin "Forgot password?" flow (D-046) against the LOCAL Supabase stack.
//
// admin.html hard-codes the hosted Supabase URL and publishable key, so the flow cannot be
// ridden locally as checked in. This script (1) reads the local stack's URL and keys from
// `supabase status` (never prints them), refusing anything that is not 127.0.0.1/localhost,
// (2) creates or resets a throwaway local user, (3) writes a copy of admin.html with the
// local URL and key swapped in, under the OS temp dir, and (4) serves that copy on
// http://127.0.0.1:3000 for every path. The local allowlist already carries
// http://127.0.0.1:3000/admin (supabase/config.toml, additional_redirect_urls).
//
// Then, in a browser: open http://127.0.0.1:3000/admin, enter the throwaway address, choose
// Forgot password; read the email at http://127.0.0.1:54324 (Mailpit); follow its link; set a
// new password; sign in with it. Ctrl-C in the terminal stops the server and deletes the
// throwaway user and the page copy; if the server was killed some other way (a signal from
// Git Bash does not reach a Windows node process), `--cleanup` does the same tidy-up alone.
// Run from the repo root: node scripts/ride-admin-recovery-local.mjs [--cleanup]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const PAGE = path.join(os.tmpdir(), "icc-admin-recovery-ride.html");
const USER = { email: "ride@icc.test", password: "OldRidePassword1" };

const env = {};
for (const line of execFileSync("npx", ["supabase", "status", "-o", "env"], { cwd: ROOT, encoding: "utf8", shell: true }).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const API = env.API_URL, PUB = env.PUBLISHABLE_KEY, SECRET = env.SECRET_KEY;
if (!API || !PUB || !SECRET) { console.error("local stack keys not found; is `npx supabase start` up?"); process.exit(1); }
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(API)) { console.error("refusing: API_URL is not the local stack"); process.exit(1); }

const admin = { apikey: SECRET, Authorization: "Bearer " + SECRET, "Content-Type": "application/json" };
async function findUser() {
  const r = await fetch(API + "/auth/v1/admin/users?page=1&per_page=100", { headers: admin });
  return ((await r.json()).users || []).find((u) => u.email === USER.email);
}
async function ensureUser() {
  let r = await fetch(API + "/auth/v1/admin/users", { method: "POST", headers: admin, body: JSON.stringify({ email: USER.email, password: USER.password, email_confirm: true }) });
  if (r.status === 422) {
    const u = await findUser();
    if (!u) throw new Error("user exists but is not listed");
    r = await fetch(API + "/auth/v1/admin/users/" + u.id, { method: "PUT", headers: admin, body: JSON.stringify({ password: USER.password }) });
  }
  if (!r.ok) throw new Error("user setup failed: " + r.status);
}
async function cleanup() {
  const u = await findUser().catch(() => null);
  if (u) await fetch(API + "/auth/v1/admin/users/" + u.id, { method: "DELETE", headers: admin }).catch(() => {});
  fs.rmSync(PAGE, { force: true });
  console.log("\nthrowaway user and page copy removed");
}

// Ending by returning from the module (no process.exit after an awaited fetch): on Windows
// exiting with a closing network handle trips a libuv assertion.
if (process.argv.includes("--cleanup")) {
  await cleanup();
} else {
  await ensureUser();
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  const swapped = html
    .replace(/const SUPABASE_URL = "https:\/\/[a-z0-9]+\.supabase\.co";/, 'const SUPABASE_URL = "' + API + '";')
    .replace(/const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_[A-Za-z0-9_-]+";/, 'const SUPABASE_PUBLISHABLE_KEY = "' + PUB + '";');
  if (swapped === html || !swapped.includes(API)) { console.error("could not swap the Supabase constants; admin.html changed shape"); await cleanup(); process.exitCode = 1; }
  else {
    fs.writeFileSync(PAGE, swapped);
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(fs.readFileSync(PAGE));
    });
    server.listen(3000, "127.0.0.1", () => {
      console.log("ride: user " + USER.email + " (current password " + USER.password + ")");
      console.log("ride: open http://127.0.0.1:3000/admin ; emails at http://127.0.0.1:54324 ; Ctrl-C to stop and clean up");
    });
    process.on("SIGINT", () => { server.close(); cleanup(); });
  }
}
