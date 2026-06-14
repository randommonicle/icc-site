// Server-side Supabase admin client (service role). Slice 5a / D-020.
//
// getSupabaseAdmin() returns a singleton service-role client when SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY are BOTH set, else null. Callers treat null as
// "Supabase not wired" and fail open — e.g. the escalation handler still emails
// Mark, which stays the guaranteed path (L-004). So the operational backend can
// be enabled by setting two env vars in Netlify, with no code change, and the
// merge is a production no-op until they are set.
//
// The service-role key bypasses Row Level Security, so it is SERVER-SIDE ONLY and
// never reaches the browser (secrets rule, D-009). createClient does no network
// I/O at construction, so building the client is cheap and safe to memoise.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { createClient } = require("@supabase/supabase-js");

let cached = null;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

// Test seam: drop the singleton so a test can change the env vars and re-resolve.
function _resetForTest() {
  cached = null;
}

module.exports = { getSupabaseAdmin, _resetForTest };
