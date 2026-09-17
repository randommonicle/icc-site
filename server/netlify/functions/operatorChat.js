// D-040 operator assistant — POST /api/v1/operator-chat (Beta 4 slice 4).
//
// The Mark-only, read-only, descriptive AI surface: it answers questions over the
// business's own jobs / invoices / receipts / expenses / P&L through read-only tools
// (operatorTools.js, behind the readOnlyClient facade) and never takes an action. Built
// to the D-040 implementation contract (converged cross-agent review, 2026-09-13).
//
// Gate order, each one before any paid call:
//   origin policy (shared origins.js)      -> 403 in strict mode, logged in fail-open
//   requireAdmin                            -> 401 / 403 / 503 (the ONLY identity source)
//   per-IP enforceRateLimit                 -> 429 (defence in depth; fail-open as ever)
//   body: bounded, alternating history      -> 400
//   ANTHROPIC_API_KEY + Supabase configured -> 500 / 503 (no budget spent on a misconfig)
//   admitOperatorTurn (Postgres atomic)     -> 429 + Retry-After / 503 fail-closed
// Then ONE bounded turn (operatorTurnRunner.js: the model-call budget, the dispatch
// guard, the wall-clock deadline and the terminal "stopped" result all live there).
//
// Stateless: the browser holds the transcript and resends it (bounded); nothing is stored.
// The reply is one text block the admin page renders as textContent (inert).
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { getOrigin, createOriginPolicy } = require("./origins.js");
const { getClientIP, enforceRateLimit } = require("./rateLimit.js");
const { admitOperatorTurn, secondsToNextWindow } = require("./operatorAdmission.js");
const runner = require("./operatorTurnRunner.js");

const { LIMITS, deadlineMs, runOperatorTurn } = runner;

// One origin policy per function instance, like chat.js. The admin page sends a Bearer
// token, so Authorization joins the allowed request headers.
const originPolicy = createOriginPolicy({ headers: "Content-Type, Authorization", methods: "POST, OPTIONS" });

function json(statusCode, headers, obj) {
  return { statusCode, headers: Object.assign({}, headers, { "Content-Type": "application/json" }), body: JSON.stringify(obj) };
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
// fetchImpl, now, nowMs, apiKey, model, log, limits, deadline, handleTool.
async function handlePost(event, headers, deps) {
  const d = deps || {};
  const nowMs = d.nowMs || Date.now;
  // The wall-clock budget is anchored HERE, before requireAdmin (a Supabase Auth round
  // trip), the Blobs limiter and the admission RPC, so those cannot push the model calls
  // past the platform ceiling after the turn has already been charged.
  const startMs = nowMs();
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

  // 4. configuration — no budget is charged for a misconfigured deploy.
  const apiKey = d.apiKey !== undefined ? d.apiKey : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, headers, { error: "Anthropic API key not configured" });
  const supabase = d.supabase !== undefined ? d.supabase : getSupabaseAdmin();
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  // 5. the atomic turn budget, keyed on the verified user id — BEFORE the first paid call.
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

  // 6. one bounded turn.
  const result = await runOperatorTurn(v.messages, {
    apiKey, model: d.model, supabase, fetchImpl: d.fetchImpl, now: d.now, nowMs, log, limits,
    deadlineAt: startMs + (d.deadline || deadlineMs()), handleTool: d.handleTool,
  });
  if (result.kind === "failed") return json(502, headers, { error: "The assistant could not complete that turn." });
  if (result.kind === "stopped") return json(200, headers, { content: result.content, stopped: result.stopped, usage: result.usage });
  const out = { content: result.content, usage: result.usage };
  if (result.truncated) out.truncated = true;
  return json(200, headers, out);
}

exports.handler = async function (event) {
  const origin = getOrigin(event);
  const headers = originPolicy.corsHeaders(origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };
  const oc = originPolicy.check(origin);
  if (!oc.ok) return json(oc.status, headers, { error: oc.error });
  try {
    return await handlePost(event, headers, {});
  } catch (e) {
    console.log("operator-chat error:", e && e.message);
    return json(500, headers, { error: "Something went wrong." });
  }
};

// Exported for unit tests (test/operator-chat.test.js); the turn's own pieces are
// re-exported from operatorTurnRunner.js so the endpoint's tests keep one import.
exports.handlePost = handlePost;
exports.validateMessages = validateMessages;
exports.makeBudgetedCallModel = runner.makeBudgetedCallModel;
exports.makeDispatchGuard = runner.makeDispatchGuard;
exports.BudgetExhausted = runner.BudgetExhausted;
exports.deadlineMs = deadlineMs;
exports.LIMITS = LIMITS;
exports.STATIC_SYSTEM_PROMPT = runner.STATIC_SYSTEM_PROMPT;
