#!/usr/bin/env node
// The hosted Supabase Auth URL configuration for the admin "Forgot password?" flow (D-046,
// docs/ADMIN_PASSWORD_RESET.md owner step 1) as one command, through the Supabase
// Management API rather than the dashboard or `supabase config push` (which has no dry run
// and would send the whole local [auth] section: sign-ups on, a 127.0.0.1 Site URL, the
// local email rate limit; see TODO(supabase/config-push-remotes) in supabase/config.toml).
//
//   node scripts/supabase-auth-config.mjs            dry run: GET, report, print the body it WOULD send
//   node scripts/supabase-auth-config.mjs --apply    GET, refuse unless sign-ups are off, PATCH the
//                                                    two fields, GET again and prove the values landed
//   --site-url <url>   the Site URL to set (default: the .netlify.app host; the real domain at cutover)
//   --replace          set uri_allow_list to exactly the admin URLs (default: union with what is there)
//   --disable-signups  also send disable_signup: true. The 19 Sept 2026 dry run read
//                      disable_signup = false on the hosted project although the docs had said
//                      sign-ups were off since June; with this flag the PATCH is the fix and the
//                      read-back must show true.
//   --ref <ref>        another project ref (default: icc-platform)
//
// The token: a Supabase personal access token (supabase.com, account menu, Access Tokens) read
// from SUPABASE_ACCESS_TOKEN in the environment or in the .env of the current directory (or
// ICC_ENV_FILE). It is never printed. It is an account-wide credential: revoke it on the same
// dashboard page when the step is done, or keep it for the cutover and say so in the handover.
//
// The GET answers every auth setting, including secrets (smtp_pass, hook secrets, provider
// secrets), so this script never prints the raw response: only the named, non-secret fields
// in REPORTED_FIELDS. Field names verified against the Management API's OpenAPI document
// (https://api.supabase.com/api/v1-json, read 19 Sept 2026): GET/PATCH /v1/projects/{ref}/config/auth,
// response schema AuthConfigResponse_Output, body schema UpdateAuthConfigBody, bearer auth.
// Run from the repo root.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const API_BASE = "https://api.supabase.com";
export const PROJECT_REF = "qzcfgpfvzpynnjgriqqn"; // icc-platform, London (D-009 addendum)
export const DEFAULT_SITE_URL = "https://super-frangollo-c3a14a.netlify.app";

// The admin page asks GoTrue to send the operator back to its own origin plus /admin
// (admin.html, the recover call), so every host the page is served from needs an exact
// entry. The deploy-preview entry uses a single `*`: Supabase's glob `*` matches any run of
// NON-separator characters (the separators are `.` and `/`), so the matched host can only be
// `<something>--super-frangollo-c3a14a.netlify.app`; the docs' `**` form would also match an
// attacker's host whose PATH carried that suffix. (supabase.com/docs/guides/auth/redirect-urls)
export const ADMIN_REDIRECTS = Object.freeze([
  "https://super-frangollo-c3a14a.netlify.app/admin",
  "https://www.intelligentclean.co.uk/admin",
  "https://intelligentclean.co.uk/admin",
  "https://*--super-frangollo-c3a14a.netlify.app/admin",
]);

// What the report prints. Nothing secret-shaped goes on this list (see the header).
export const REPORTED_FIELDS = Object.freeze([
  "site_url",
  "uri_allow_list",
  "disable_signup",
  "external_email_enabled",
  "mailer_autoconfirm",
  "mailer_otp_exp",
  "mailer_secure_email_change_enabled",
  "password_min_length",
  "rate_limit_email_sent",
  "smtp_host",
  "smtp_sender_name",
  "mailer_subjects_recovery",
]);

// Secret-shaped names in the response schema (smtp_pass, *_secret, *_secrets, sms_*_auth_token,
// sms_*_api_key, sms_*_access_key); password_min_length and rate_limit_token_refresh are not.
const SECRET_NAME = /secret|smtp_pass|auth_token|api_key|access_key|private/i;

export function parseArgs(argv) {
  const out = { apply: false, replace: false, disableSignups: false, siteUrl: DEFAULT_SITE_URL, ref: PROJECT_REF, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--replace") out.replace = true;
    else if (a === "--disable-signups") out.disableSignups = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--site-url") out.siteUrl = String(argv[++i] || "").trim();
    else if (a === "--ref") out.ref = String(argv[++i] || "").trim();
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!/^https:\/\/[^\s,/]+$/.test(out.siteUrl)) throw new Error("--site-url must be an https origin with no path and no comma");
  if (!/^[a-z]{20}$/.test(out.ref)) throw new Error("--ref must be a 20-letter project ref");
  return out;
}

export function loadToken(envFile, processEnv = process.env) {
  const fromEnv = String(processEnv.SUPABASE_ACCESS_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  if (!envFile || !fs.existsSync(envFile)) throw new Error("SUPABASE_ACCESS_TOKEN is not set and no .env was found; add one line `SUPABASE_ACCESS_TOKEN=<token>` to the repo-root .env (git-ignored)");
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*?)\s*$/);
    if (m) {
      const v = m[1].replace(/^"|"$/g, "");
      if (v) return v;
    }
  }
  throw new Error(`SUPABASE_ACCESS_TOKEN is not set in ${envFile}; add one line \`SUPABASE_ACCESS_TOKEN=<token>\` (no space after the =)`);
}

export function splitAllowList(s) {
  return String(s == null ? "" : s).split(",").map((x) => x.trim()).filter(Boolean);
}

// Union by default: nothing already on the list is dropped by this script, the report shows
// every pre-existing entry so the operator can prune by hand; --replace sets exactly ours.
export function mergeAllowList(current, wanted = ADMIN_REDIRECTS, { replace = false } = {}) {
  const out = [];
  for (const u of replace ? wanted : [...splitAllowList(current), ...wanted]) if (!out.includes(u)) out.push(u);
  return out;
}

export function buildPatchBody(config, { siteUrl = DEFAULT_SITE_URL, replace = false, disableSignups = false } = {}) {
  const body = { site_url: siteUrl, uri_allow_list: mergeAllowList(config && config.uri_allow_list, ADMIN_REDIRECTS, { replace }).join(",") };
  if (disableSignups) body.disable_signup = true;
  return body;
}

// The one hard stop: with sign-ups on, a stranger could plant a `#access_token=...&type=recovery`
// fragment for an account of their own on the admin page; sign-ups being off is what keeps
// that inert (docs/ADMIN_PASSWORD_RESET.md). Only a literal true passes.
export function refusal(config) {
  if (!config || typeof config !== "object") return "no auth config was read";
  if (config.disable_signup !== true) return `sign-ups are NOT disabled on the hosted project (disable_signup = ${JSON.stringify(config.disable_signup)}); turn them off in the dashboard (Authentication, Providers, Email) before this flow is used`;
  return null;
}

export function recoveryTemplateState(config) {
  const t = config && config.mailer_templates_recovery_content;
  if (t == null || String(t).trim() === "") return "not customised (Supabase's own template)";
  return String(t).includes("{{ .ConfirmationURL }}") ? "customised, carries {{ .ConfirmationURL }}" : "customised and DOES NOT carry {{ .ConfirmationURL }}: a reset link would never deliver the session to the page";
}

export function warnings(config) {
  const out = [];
  if (config.external_email_enabled === false) out.push("external_email_enabled is false: the email provider is off, no recovery email can go out");
  if (Number(config.mailer_otp_exp) !== 3600) out.push(`mailer_otp_exp is ${JSON.stringify(config.mailer_otp_exp)} seconds, the page and the doc say an hour (3600)`);
  if (/DOES NOT/.test(recoveryTemplateState(config))) out.push("the recovery email template does not carry {{ .ConfirmationURL }}");
  if (config.mailer_autoconfirm === true) out.push("mailer_autoconfirm is true (new accounts would not need to confirm email; moot while sign-ups are off)");
  return out;
}

// The only view of the response that is ever printed.
export function summarise(config) {
  const out = {};
  for (const k of REPORTED_FIELDS) {
    if (SECRET_NAME.test(k)) continue; // belt and braces: REPORTED_FIELDS is reviewed, this is the guard
    out[k] = config[k] === undefined ? "(absent)" : config[k];
  }
  out.recovery_template = recoveryTemplateState(config);
  out.field_count = Object.keys(config).length;
  return out;
}

export function formatReport(config, body, { apply, ref }) {
  const s = summarise(config);
  const lines = [`Supabase auth config for project ${ref} (GET ${API_BASE}/v1/projects/${ref}/config/auth, ${s.field_count} fields; only these are printed):`];
  for (const k of REPORTED_FIELDS) lines.push(`  ${(k + ":").padEnd(36)} ${s[k] === "" ? "(empty)" : String(s[k])}`);
  lines.push(`  ${"recovery template:".padEnd(36)} ${s.recovery_template}`);
  const existing = splitAllowList(config.uri_allow_list);
  if (existing.length) lines.push(`  pre-existing allowlist entries (kept unless --replace): ${existing.join(" | ")}`);
  lines.push("Checks:");
  const stop = refusal(config);
  lines.push(stop ? `  STOP ${stop}` : "  OK   sign-ups are disabled (disable_signup = true)");
  for (const w of warnings(config)) lines.push(`  WARN ${w}`);
  lines.push(apply ? "PATCH body (sending now):" : "PATCH body (DRY RUN, nothing sent; add --apply to send exactly this):");
  lines.push(`  site_url:       ${body.site_url}`);
  lines.push(`  uri_allow_list: ${body.uri_allow_list}`);
  if (body.disable_signup === true) lines.push("  disable_signup: true");
  return lines.join("\n");
}

async function request(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    // The error body is Supabase's, not the config; safe to show its message, never the token.
    const msg = json && (json.message || json.error) ? (json.message || json.error) : text.slice(0, 200);
    throw new Error(`${method} ${url} answered ${res.status}: ${msg}`);
  }
  if (!json || typeof json !== "object") throw new Error(`${method} ${url} answered ${res.status} with a non-JSON body`);
  return json;
}

export async function main(argv = process.argv.slice(2), { fetchImpl } = {}) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log("usage: node scripts/supabase-auth-config.mjs [--apply] [--replace] [--disable-signups] [--site-url <https origin>] [--ref <ref>]");
    return 0;
  }
  const envFile = process.env.ICC_ENV_FILE || path.join(process.cwd(), ".env");
  const token = loadToken(envFile);
  const url = `${API_BASE}/v1/projects/${opts.ref}/config/auth`;
  const get = fetchImpl ? fetchImpl : (m, u, t, b) => request(m, u, t, b);

  const before = await get("GET", url, token);
  const body = buildPatchBody(before, { siteUrl: opts.siteUrl, replace: opts.replace, disableSignups: opts.disableSignups });
  console.log(formatReport(before, body, { apply: opts.apply, ref: opts.ref }));

  if (!opts.apply) return 0;
  // With --disable-signups the PATCH itself is the fix, so the check moves to the read-back.
  const stop = opts.disableSignups ? null : refusal(before);
  if (stop) {
    console.error(`REFUSED: ${stop}`);
    return 2;
  }
  await get("PATCH", url, token, body);
  const after = await get("GET", url, token);
  const landed = after.site_url === body.site_url
    && splitAllowList(after.uri_allow_list).join(",") === splitAllowList(body.uri_allow_list).join(",")
    && (!opts.disableSignups || after.disable_signup === true);
  console.log("Read back after the PATCH:");
  console.log(`  site_url:       ${after.site_url}`);
  console.log(`  uri_allow_list: ${after.uri_allow_list}`);
  if (opts.disableSignups) console.log(`  disable_signup: ${JSON.stringify(after.disable_signup)}`);
  console.log(landed ? "  every value matches what was sent." : "  MISMATCH: the read-back differs from the body sent; check the dashboard before relying on the flow.");
  return landed ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((e) => {
    console.error("FAILED:", e && e.message ? e.message : e);
    process.exitCode = 1;
  });
}
