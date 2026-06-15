// Slice 5d (D-009 secrets rule) — admin authentication via Supabase Auth.
//
// Replaces the shared ADMIN_SECRET Bearer with per-user Supabase Auth: the admin
// page signs in with email + password (Supabase Auth REST) and sends the session
// access token as `Authorization: Bearer <jwt>`. requireAdmin verifies that jwt
// server-side and checks the user is on the allowlist. This is the shared identity
// model the field app will reuse (D-012).
//
// Two layers, deliberately:
//   1. Public sign-ups are DISABLED in the Supabase project, so the only users
//      that exist are the operators created in the dashboard.
//   2. ADMIN_EMAILS is a server-side allowlist on top of that — defence in depth,
//      so a stray or accidentally-created user could never read the dashboard
//      even if signups were re-enabled.
//
// The token is verified with a publishable-key client (the standard way to check
// a user token). The publishable key is PUBLIC by design (it also sits in
// admin.html for the browser sign-in), so committing it here is fine — RLS and the
// allowlist are the controls, not key secrecy. The service-role key stays only in
// supabaseClient.js for data access and never touches this path.

const { createClient } = require("@supabase/supabase-js");

// Public publishable (anon) key — same value embedded in admin.html. Overridable
// via env for rotation. Not a secret.
const PUBLISHABLE_KEY_FALLBACK = "sb_publishable_QZ0JDjbGNtj_JEUf-qfJ4Q_mIawmFsK";

let verifyClient = null;
function getVerifyClient() {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || PUBLISHABLE_KEY_FALLBACK;
  if (!verifyClient) {
    verifyClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return verifyClient;
}

// Test seam: drop the singleton so a test can change env and re-resolve.
function _resetForTest() { verifyClient = null; }

// Comma-separated allowlist; defaults to the two known operators so the admin
// keeps working if the env var is not set. Lower-cased for case-insensitive match.
function adminEmailSet() {
  const raw = process.env.ADMIN_EMAILS
    || "mark_director@intelligentclean.co.uk,ben@intelligentclean.co.uk";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

// Verify the request's Bearer token is a valid Supabase session for an allowlisted
// admin. Returns { ok:true, user } or { ok:false, status, error }. The Supabase
// client is a parameter (default: the publishable-key singleton) so tests inject a
// fake auth.getUser and never hit the network. Fails closed throughout.
async function requireAdmin(event, supabase = getVerifyClient()) {
  const h = (event && event.headers) || {};
  const authHeader = h.authorization || h.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Unauthorized" };
  if (!supabase) return { ok: false, status: 503, error: "Auth not configured" };

  let res;
  try {
    res = await supabase.auth.getUser(token);
  } catch (e) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const user = res && res.data && res.data.user;
  if ((res && res.error) || !user || !user.email) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!adminEmailSet().has(String(user.email).toLowerCase())) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, user };
}

module.exports = { requireAdmin, adminEmailSet, getVerifyClient, _resetForTest };
