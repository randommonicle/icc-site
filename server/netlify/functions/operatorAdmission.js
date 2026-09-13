// D-040 operator assistant — per-operator turn admission (Beta 4 slice 2).
//
// ONE atomic Postgres statement (operator_admit, migration 20260913180000) decides
// whether this turn may spend: keyed on the requireAdmin-verified user id (never a body
// field), hourly fixed window, FAIL-CLOSED. Why not rateLimit.js: that limiter is a
// non-atomic Blobs get/set (two concurrent turns can both read count < limit) and it
// fails OPEN by design for customers (a storage blip must not block a booking). An
// operator turn is paid model spend with a human who can simply retry, so the trade-off
// flips: any doubt -> refuse. The per-IP limiter stays on the endpoint as defence in
// depth, unchanged.
//
// Result contract (operatorChat.js maps it to HTTP):
//   { admitted: true }
//   { admitted: false, reason: 'over_limit' }    a definite false from the DB  -> 429
//   { admitted: false, reason: 'unavailable' }   no client / rpc error / throw -> 503
//   { admitted: false, reason: 'ambiguous' }     NULL, non-boolean, odd shape  -> 503
//   { admitted: false, reason: 'bad_identity' }  not a uuid; the DB is not called -> 503
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const DEFAULT_LIMIT = 30; // turns per operator per hour
const WINDOW_SECONDS = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// OPERATOR_TURN_LIMIT, a positive integer; anything else falls back to the default so a
// typo in Netlify can loosen nothing below "some limit".
function turnLimit(env) {
  const raw = (env || process.env).OPERATOR_TURN_LIMIT;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 && String(n) === String(raw).trim() ? n : DEFAULT_LIMIT;
}

// Seconds until the current hourly window rolls over (for Retry-After on a 429).
function secondsToNextWindow(nowMs) {
  const s = Math.floor((nowMs == null ? Date.now() : nowMs) / 1000);
  return WINDOW_SECONDS - (s % WINDOW_SECONDS);
}

async function admitOperatorTurn(supabase, userId, limit) {
  if (!supabase || typeof supabase.rpc !== "function") return { admitted: false, reason: "unavailable" };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { admitted: false, reason: "bad_identity" };
  const lim = Number.isInteger(limit) && limit > 0 ? limit : turnLimit();
  let res;
  try {
    res = await supabase.rpc("operator_admit", { p_user_id: userId, p_limit: lim });
  } catch (e) {
    return { admitted: false, reason: "unavailable" };
  }
  if (!res || res.error) return { admitted: false, reason: "unavailable" };
  if (res.data === true) return { admitted: true };
  if (res.data === false) return { admitted: false, reason: "over_limit" };
  return { admitted: false, reason: "ambiguous" };
}

module.exports = { admitOperatorTurn, turnLimit, secondsToNextWindow, DEFAULT_LIMIT, WINDOW_SECONDS };
