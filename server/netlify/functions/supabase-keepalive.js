// Scheduled Supabase keep-alive. Runs daily (the schedule lives in netlify.toml).
//
// Free-tier Supabase projects auto-pause after ~7 days of no activity. Pre-launch
// the ICC project sees effectively no real traffic, so it kept drifting toward a
// pause; this runs one cheap read a day to keep the countdown reset. Once the site
// is on its domain and taking real bookings this is redundant (live traffic keeps
// the project awake), but it is harmless to leave running.
//
// Safety / cost:
//   - READ-ONLY: a single `select id ... limit 1` against `jobs`. It writes
//     nothing and touches no PII (it does not even read a PII column).
//   - Bounded to one row, so it is trivially cheap regardless of table size.
//   - getSupabaseAdmin() null (env unset) -> no-op + log, like the other
//     scheduled function. Nothing to gate: it is a harmless read, exposed only at
//     /.netlify/functions/supabase-keepalive (no /api/* redirect).
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { getSupabaseAdmin } = require("./supabaseClient.js");

// One minimal read to register activity on the project. `supabase` is injected so
// the unit test drives it with a fake client (no network). Returns whether the
// read succeeded; a read error is surfaced so a genuinely broken project is not
// silently reported as "kept alive".
async function pingSupabase(supabase) {
  const { error } = await supabase.from("jobs").select("id").limit(1);
  if (error) throw new Error(error.message);
  return { ok: true };
}

exports.handler = async function () {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log("supabase-keepalive: Supabase not configured, skipping");
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) };
  }
  try {
    await pingSupabase(supabase);
    console.log("supabase-keepalive: ping ok");
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.log("supabase-keepalive error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "keepalive failed" }) };
  }
};

// Exported for unit tests (test/supabase-keepalive.test.js).
exports.pingSupabase = pingSupabase;
