// D-040 operator assistant — /api/v1/operator-chat (Beta 4 slice 4; background turn D-045).
//
// The Mark-only, read-only, descriptive AI surface: it answers questions over the
// business's own jobs / invoices / receipts / expenses / P&L through read-only tools
// (operatorTools.js, behind the readOnlyClient facade) and never takes an action. Built
// to the D-040 implementation contract (converged cross-agent review, 2026-09-13).
//
// Two verbs since D-045 (2026-09-17, L-042: the turn used to run inside this request and
// die on the 10 s synchronous ceiling on every cold start and every two-tool question):
//
//   POST  admits ONE turn and hands it to the background function. Gate order, each one
//         before anything is stored or spent:
//           origin policy (shared origins.js)      -> 403 in strict mode, logged in fail-open
//           requireAdmin                            -> 401 / 403 / 503 (the ONLY identity source)
//           per-IP enforceRateLimit                 -> 429 (defence in depth; fail-open as ever)
//           body: bounded, alternating history      -> 400
//           ANTHROPIC_API_KEY + Supabase configured -> 500 / 503 (no budget spent on a misconfig)
//           admitOperatorTurn (Postgres atomic)     -> 429 + Retry-After / 503 fail-closed
//         then: prune stale rows, store the validated transcript as a `queued`
//         operator_turns row for the verified user, trigger operatorTurn-background with
//         `{ turn_id }` over HTTPS, and answer 202 `{ turn_id }`. The row is written BEFORE
//         the trigger (the background function claims it or does nothing); a trigger that
//         fails is abandoned (`queued` -> `failed`) and answered 503, so the panel puts
//         the question back. A trigger answered 200 rather than 202 means the platform ran
//         the function synchronously (background mode not active for this deploy): it is
//         logged, and the poll still finds whatever was recorded.
//   GET   ?turn=<uuid> is the poll: requireAdmin, then the caller's OWN row only (a foreign
//         or unknown id is a 404, not a 403, so ids leak nothing), answering the state:
//         queued / running (keep polling), done (content, usage, truncated), stopped
//         (content, the stopped kind, usage) or failed (a fixed message).
//
// Stored, briefly: the transcript and the reply live in operator_turns for the life of
// the turn (pruned after an hour on every POST). The reply is one text block the admin
// page renders as textContent (inert). The turn's own bounds (model calls, tool
// dispatches, the wall-clock deadline, now anchored in the background function) live in
// operatorTurnRunner.js.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { getOrigin, createOriginPolicy } = require("./origins.js");
const { getClientIP, enforceRateLimit } = require("./rateLimit.js");
const { admitOperatorTurn, secondsToNextWindow } = require("./operatorAdmission.js");
const store = require("./operatorTurnStore.js");
const { LIMITS, STOPPED_TEXT } = require("./operatorTurnRunner.js");

// One origin policy per function instance, like chat.js. The admin page sends a Bearer
// token, so Authorization joins the allowed request headers; GET is the poll.
const originPolicy = createOriginPolicy({ headers: "Content-Type, Authorization", methods: "GET, POST, OPTIONS" });

const BACKGROUND_PATH = "/.netlify/functions/operatorTurn-background";
const TRIGGER_TIMEOUT_MS = 5000; // the platform answers 202 before the function runs, so this is a network bound only
const FAILED_TEXT = "The assistant could not complete that turn.";

function json(statusCode, headers, obj) {
  return { statusCode, headers: Object.assign({}, headers, { "Content-Type": "application/json" }), body: JSON.stringify(obj) };
}

// The site's own origin for the trigger: the unique per-deploy host first, so a branch
// deploy or a preview triggers ITS OWN background function, then the branch / production
// hosts Netlify sets at runtime (origins.js relies on the same variables), then the
// configured public URL. Never the request's Host header.
function triggerOrigin(env) {
  const e = env || process.env;
  for (const k of ["DEPLOY_URL", "DEPLOY_PRIME_URL", "URL", "PUBLIC_SITE_URL"]) {
    const v = e[k];
    if (typeof v === "string" && /^https?:\/\/\S+$/.test(v.trim())) return v.trim().replace(/\/+$/, "");
  }
  return null;
}

// The replayed transcript: 1..maxHistory text-only messages, alternating user/assistant,
// starting and ending with the user. Anything else is a 400 (before any budget is spent).
function validateMessages(raw, limits) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > limits.maxHistory) {
    return { error: "messages must hold 1 to " + limits.maxHistory + " turns" };
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (!m || typeof m !== "object" || m.role !== expected) return { error: "messages must alternate user/assistant, starting with the user" };
    if (typeof m.content !== "string" || !m.content.trim() || m.content.length > limits.maxMessageChars) {
      return { error: "each message must be a non-empty string of at most " + limits.maxMessageChars + " characters" };
    }
    out.push({ role: m.role, content: m.content });
  }
  if (out[out.length - 1].role !== "user") return { error: "the last message must be from the user" };
  return { messages: out };
}

// deps (all injectable for the tests): requireAdminFn, enforceRateLimitFn, supabase, admit,
// apiKey, nowMs, log, limits, enqueue, prune, abandon, fetchImpl, env.
async function handlePost(event, headers, deps) {
  const d = deps || {};
  const nowMs = d.nowMs || Date.now;
  const limits = Object.assign({}, LIMITS, d.limits || {});
  const log = d.log || console.log;

  // 1. identity — the only source of who is asking (never a body field).
  const auth = await (d.requireAdminFn || requireAdmin)(event);
  if (!auth.ok) return json(auth.status, headers, { error: auth.error });

  // 2. per-IP, defence in depth (fail-open, same limiter as every other spend path).
  const ip = getClientIP(event);
  const rl = await (d.enforceRateLimitFn || enforceRateLimit)(ip, "rl:opchat", limits.perIpPerHour);
  if (!rl.ok) {
    // Not tooManyResponse(): its copy tells the caller to phone the business, which is
    // the wrong line for the operator.
    return { statusCode: 429, headers: Object.assign({}, headers, { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter || 3600) }),
      body: JSON.stringify({ error: "Too many requests from this connection. Wait a little and try again.", retry_after: rl.retryAfter || 3600 }) };
  }

  // 3. body, bounded.
  let body;
  try { body = JSON.parse(event.body); } catch (e) { return json(400, headers, { error: "Invalid JSON" }); }
  const v = validateMessages(body && body.messages, limits);
  if (v.error) return json(400, headers, { error: v.error });

  // 4. configuration — no budget is charged for a misconfigured deploy. The key is checked
  // here although the model is called elsewhere: a turn admitted into a deploy without
  // the key would only ever be recorded as failed.
  const apiKey = d.apiKey !== undefined ? d.apiKey : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, headers, { error: "Anthropic API key not configured" });
  const supabase = d.supabase !== undefined ? d.supabase : getSupabaseAdmin();
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const origin = triggerOrigin(d.env);
  if (!origin) return json(503, headers, { error: "Site URL not configured" });

  // 5. the atomic turn budget, keyed on the verified user id — BEFORE anything is stored.
  const admission = await (d.admit || admitOperatorTurn)(supabase, auth.user && auth.user.id);
  if (!admission.admitted) {
    if (admission.reason === "over_limit") {
      const retry = secondsToNextWindow(nowMs());
      return { statusCode: 429, headers: Object.assign({}, headers, { "Content-Type": "application/json", "Retry-After": String(retry) }),
        body: JSON.stringify({ error: "You have used this hour's assistant turns. Try again in about " + Math.ceil(retry / 60) + " minutes.", retry_after: retry }) };
    }
    log("operator admission refused:", admission.reason);
    return json(503, headers, { error: "The assistant is unavailable right now (turn budget could not be checked)." });
  }

  // 6. store the turn (after pruning what an hour has made stale; a failed prune is logged,
  // never fatal), then trigger the background function with the row id and nothing else.
  const pr = await (d.prune || store.pruneTurns)(supabase, nowMs());
  if (pr.error) log("operator turns prune failed:", pr.error);
  const q = await (d.enqueue || store.enqueueTurn)(supabase, auth.user && auth.user.id, v.messages);
  if (q.error) {
    log("operator turn enqueue failed:", q.error);
    return json(503, headers, { error: "The assistant is unavailable right now (the turn could not be queued)." });
  }
  let status = null;
  try {
    const res = await (d.fetchImpl || fetch)(origin + BACKGROUND_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turn_id: q.id }),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    status = res && res.status;
  } catch (e) {
    log("operator turn trigger failed:", e && e.message, q.id);
  }
  if (status === 200) {
    // The platform ran the function synchronously instead of queueing it: the turn has
    // run (or been cut off) inside the trigger call. Not a failure of this turn, but the
    // deploy is not in background mode and L-042 is back; say so in the log.
    log("operator turn trigger answered 200, not 202: background mode is not active for this deploy", q.id);
  } else if (status !== 202) {
    if (status !== null) log("operator turn trigger answered", status, q.id);
    const ab = await (d.abandon || store.abandonTurn)(supabase, q.id, nowMs());
    if (!ab.abandoned) log("operator turn abandon failed:", ab.reason, q.id);
    return json(503, headers, { error: "The assistant is unavailable right now (the turn could not be started)." });
  }
  return json(202, headers, { turn_id: q.id });
}

// deps (all injectable for the tests): requireAdminFn, supabase, read.
async function handleGet(event, headers, deps) {
  const d = deps || {};
  const auth = await (d.requireAdminFn || requireAdmin)(event);
  if (!auth.ok) return json(auth.status, headers, { error: auth.error });
  const id = event.queryStringParameters && event.queryStringParameters.turn;
  if (!store.isUuid(id)) return json(400, headers, { error: "turn must be a uuid" });
  const supabase = d.supabase !== undefined ? d.supabase : getSupabaseAdmin();
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  const t = await (d.read || store.readTurn)(supabase, id, auth.user && auth.user.id);
  if (!t.found) {
    if (t.reason === "unavailable") return json(503, headers, { error: "The assistant is unavailable right now (the turn could not be read)." });
    return json(404, headers, { error: "No such turn." });
  }
  const r = t.result || {};
  if (t.status === "done") {
    const out = { status: "done", content: r.content, usage: r.usage };
    if (r.truncated === true) out.truncated = true;
    return json(200, headers, out);
  }
  if (t.status === "stopped") {
    const kind = r.stopped === "deadline" ? "deadline" : "model_calls";
    return json(200, headers, { status: "stopped", stopped: kind, content: r.content || [{ type: "text", text: STOPPED_TEXT[kind] }], usage: r.usage });
  }
  if (t.status === "failed") return json(200, headers, { status: "failed", error: FAILED_TEXT });
  return json(200, headers, { status: t.status === "running" ? "running" : "queued" });
}

exports.handler = async function (event) {
  const origin = getOrigin(event);
  const headers = originPolicy.corsHeaders(origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") return { statusCode: 405, headers, body: "Method Not Allowed" };
  const oc = originPolicy.check(origin);
  if (!oc.ok) return json(oc.status, headers, { error: oc.error });
  try {
    return event.httpMethod === "GET" ? await handleGet(event, headers, {}) : await handlePost(event, headers, {});
  } catch (e) {
    console.log("operator-chat error:", e && e.message);
    return json(500, headers, { error: "Something went wrong." });
  }
};

// Exported for unit tests (test/operator-chat.test.js).
exports.handlePost = handlePost;
exports.handleGet = handleGet;
exports.validateMessages = validateMessages;
exports.triggerOrigin = triggerOrigin;
exports.BACKGROUND_PATH = BACKGROUND_PATH;
exports.LIMITS = LIMITS;
