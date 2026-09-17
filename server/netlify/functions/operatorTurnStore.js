// D-045 operator assistant background turn — the turn store (operator_turns, migration
// 20260917220000). The ONLY module that knows the table. Five writes and one read, each a
// single PostgREST statement through the service-role client:
//
//   enqueueTurn  insert a `queued` row for the requireAdmin-verified user (the endpoint,
//                AFTER operator_admit has charged the turn)
//   claimTurn    update `queued` -> `running` filtered on id AND status, returning the
//                transcript: exactly one caller ever gets a row back, so the background
//                function runs a turn only after this matched (its URL is public; the row
//                is the guard, and a replay, a platform retry or a guessed id matches
//                nothing and spends nothing)
//   recordTurn   update `running` -> done | stopped | failed filtered on id AND status, so
//                the first terminal state stands
//   abandonTurn  update `queued` -> `failed` filtered on id AND status: the endpoint could
//                not start the background function, so the row must never be claimable
//   readTurn     the poll: select filtered on id AND user_id (own rows only)
//   pruneTurns   delete rows older than RETENTION_MS (the endpoint calls it on every start,
//                the way operator_admit prunes stale windows)
//
// Every function answers a plain result object and never throws on a DB error: the
// callers map "unavailable" to a log line plus the honest client message. Ids are checked
// as v4-shaped uuids before the DB is asked, so a junk id costs nothing.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const TABLE = "operator_turns";
const RETENTION_MS = 60 * 60 * 1000; // an hour: a turn is delivered within the client's 90 s cap or abandoned
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TERMINAL = new Set(["done", "stopped", "failed"]);

function iso(ms) { return new Date(ms).toISOString(); }
function isUuid(v) { return typeof v === "string" && UUID_RE.test(v); }

async function enqueueTurn(supabase, userId, messages) {
  if (!supabase || typeof supabase.from !== "function") return { error: "unavailable" };
  if (!isUuid(userId)) return { error: "bad_identity" };
  let res;
  try {
    res = await supabase.from(TABLE).insert({ user_id: userId, status: "queued", messages }).select("id").single();
  } catch (e) {
    return { error: "unavailable" };
  }
  if (!res || res.error || !res.data || !isUuid(res.data.id)) return { error: "unavailable" };
  return { id: res.data.id };
}

async function claimTurn(supabase, id, nowMs) {
  if (!supabase || typeof supabase.from !== "function") return { claimed: false, reason: "unavailable" };
  if (!isUuid(id)) return { claimed: false, reason: "bad_id" };
  let res;
  try {
    res = await supabase.from(TABLE)
      .update({ status: "running", started_at: iso(nowMs == null ? Date.now() : nowMs) })
      .eq("id", id)
      .eq("status", "queued")
      .select("user_id, messages");
  } catch (e) {
    return { claimed: false, reason: "unavailable" };
  }
  if (!res || res.error) return { claimed: false, reason: "unavailable" };
  const rows = Array.isArray(res.data) ? res.data : [];
  if (rows.length !== 1) return { claimed: false, reason: "not_queued" };
  const row = rows[0];
  if (!Array.isArray(row.messages)) return { claimed: false, reason: "not_queued" };
  return { claimed: true, userId: row.user_id, messages: row.messages };
}

// outcome: { kind: "done" | "stopped" | "failed", result?: object }
async function recordTurn(supabase, id, outcome, nowMs) {
  if (!supabase || typeof supabase.from !== "function") return { recorded: false, reason: "unavailable" };
  if (!isUuid(id)) return { recorded: false, reason: "bad_id" };
  if (!outcome || !TERMINAL.has(outcome.kind)) return { recorded: false, reason: "bad_outcome" };
  const patch = { status: outcome.kind, result: outcome.result == null ? null : outcome.result, finished_at: iso(nowMs == null ? Date.now() : nowMs) };
  let res;
  try {
    res = await supabase.from(TABLE).update(patch).eq("id", id).eq("status", "running").select("id");
  } catch (e) {
    return { recorded: false, reason: "unavailable" };
  }
  if (!res || res.error) return { recorded: false, reason: "unavailable" };
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.length === 1 ? { recorded: true } : { recorded: false, reason: "not_running" };
}

// The endpoint could not start the background function after queueing: the row goes
// `queued` -> `failed` so the poll (if any) is told, and nothing can claim it later.
async function abandonTurn(supabase, id, nowMs) {
  if (!supabase || typeof supabase.from !== "function") return { abandoned: false, reason: "unavailable" };
  if (!isUuid(id)) return { abandoned: false, reason: "bad_id" };
  let res;
  try {
    res = await supabase.from(TABLE)
      .update({ status: "failed", finished_at: iso(nowMs == null ? Date.now() : nowMs) })
      .eq("id", id)
      .eq("status", "queued")
      .select("id");
  } catch (e) {
    return { abandoned: false, reason: "unavailable" };
  }
  if (!res || res.error) return { abandoned: false, reason: "unavailable" };
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.length === 1 ? { abandoned: true } : { abandoned: false, reason: "not_queued" };
}

async function readTurn(supabase, id, userId) {
  if (!supabase || typeof supabase.from !== "function") return { found: false, reason: "unavailable" };
  if (!isUuid(id)) return { found: false, reason: "bad_id" };
  if (!isUuid(userId)) return { found: false, reason: "bad_identity" };
  let res;
  try {
    res = await supabase.from(TABLE)
      .select("status, result, created_at, started_at, finished_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  } catch (e) {
    return { found: false, reason: "unavailable" };
  }
  if (!res || res.error) return { found: false, reason: "unavailable" };
  if (!res.data) return { found: false, reason: "not_found" };
  const r = res.data;
  return { found: true, status: r.status, result: r.result == null ? null : r.result, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at };
}

async function pruneTurns(supabase, nowMs) {
  if (!supabase || typeof supabase.from !== "function") return { error: "unavailable" };
  const before = iso((nowMs == null ? Date.now() : nowMs) - RETENTION_MS);
  let res;
  try {
    res = await supabase.from(TABLE).delete().lt("created_at", before).select("id");
  } catch (e) {
    return { error: "unavailable" };
  }
  if (!res || res.error) return { error: "unavailable" };
  return { pruned: Array.isArray(res.data) ? res.data.length : 0 };
}

module.exports = { enqueueTurn, claimTurn, recordTurn, abandonTurn, readTurn, pruneTurns, isUuid, TABLE, RETENTION_MS };
