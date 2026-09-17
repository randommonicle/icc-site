// D-045 operator assistant background turn — the Netlify BACKGROUND function that runs
// one admitted turn (the `-background` suffix is what makes it one: the platform answers
// 202 to the caller at once and gives this handler up to 15 minutes, so the turn is no
// longer cut off by the 10 s synchronous ceiling that L-042 recorded).
//
// Who calls it: POST /api/v1/operator-chat (operatorChat.js), after its six gates and the
// atomic admission have passed and it has stored the validated transcript as a `queued`
// operator_turns row. The body is `{ "turn_id": "<uuid>" }` and nothing else.
//
// The guard, because this URL is public: nothing runs until claimTurn's compare-and-set
// (`queued` -> `running`, filtered on id AND status) hands back exactly one row. A row
// exists only because the gated endpoint wrote it, its id is a v4 uuid, and a second call
// with the same id (a replay, a platform retry of the async invocation, a guess) matches
// zero rows and spends nothing. That claim is the primary spend defence here; the per-IP
// cap and the per-operator budget stay on the endpoint that creates rows, and the
// ANTHROPIC key is checked before the claim so a misconfigured deploy claims nothing.
//
// The deadline is anchored at THIS function's entry (the cold start of the function that
// admitted the turn no longer counts against it) and the result is recorded once, with
// recordTurn's own compare-and-set, so the first terminal state stands. Anything thrown
// while the row is `running` is recorded as `failed`: a row is never left `running` by
// this code (a killed process still can; the endpoint prunes rows after an hour and the
// admin page gives up at 90 s).
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { getSupabaseAdmin } = require("./supabaseClient.js");
const store = require("./operatorTurnStore.js");
const { runOperatorTurn, deadlineMs } = require("./operatorTurnRunner.js");

function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// deps (all injectable for the tests): supabase, apiKey, claim, record, runTurn, nowMs,
// now, log, fetchImpl, model, deadline, limits.
async function handleBackground(event, deps) {
  const d = deps || {};
  const nowMs = d.nowMs || Date.now;
  const entryMs = nowMs();
  const log = d.log || console.log;
  const claim = d.claim || store.claimTurn;
  const record = d.record || store.recordTurn;
  const runTurn = d.runTurn || runOperatorTurn;

  if (event.httpMethod !== "POST") return reply(405, { error: "Method Not Allowed" });
  let body;
  try { body = JSON.parse(event.body); } catch (e) { return reply(400, { error: "Invalid JSON" }); }
  const id = body && body.turn_id;
  if (!store.isUuid(id)) return reply(400, { error: "turn_id must be a uuid" });

  // Configuration before the claim: a deploy without the key claims nothing, so the row
  // stays queued for the prune rather than being burnt as a failed turn.
  const apiKey = d.apiKey !== undefined ? d.apiKey : process.env.ANTHROPIC_API_KEY;
  const supabase = d.supabase !== undefined ? d.supabase : getSupabaseAdmin();
  if (!apiKey || !supabase) {
    log("operator turn not run: misconfigured deploy", !apiKey ? "no ANTHROPIC_API_KEY" : "no Supabase", id);
    return reply(500, { error: "misconfigured" });
  }

  const c = await claim(supabase, id, entryMs);
  if (!c.claimed) {
    log("operator turn not claimed:", c.reason, id);
    return reply(200, { ok: true, claimed: false, reason: c.reason });
  }

  let outcome;
  try {
    const result = await runTurn(c.messages, {
      apiKey, model: d.model, supabase, fetchImpl: d.fetchImpl, now: d.now, nowMs, log, limits: d.limits,
      deadlineAt: entryMs + (d.deadline || deadlineMs()), handleTool: d.handleTool,
    });
    if (result && result.kind === "done") outcome = { kind: "done", result: { content: result.content, usage: result.usage, truncated: result.truncated === true } };
    else if (result && result.kind === "stopped") outcome = { kind: "stopped", result: { content: result.content, usage: result.usage, stopped: result.stopped } };
    else outcome = { kind: "failed", result: result && result.usage ? { usage: result.usage } : null };
  } catch (e) {
    log("operator turn crashed:", e && e.message);
    outcome = { kind: "failed", result: null };
  }

  const r = await record(supabase, id, outcome, nowMs());
  if (r.recorded) log("operator turn recorded:", outcome.kind, "ms=" + (nowMs() - entryMs), id);
  else log("operator turn record failed:", r.reason, outcome.kind, id);
  return reply(200, { ok: true, claimed: true, kind: outcome.kind, recorded: r.recorded === true });
}

exports.handler = async function (event) {
  try {
    return await handleBackground(event, {});
  } catch (e) {
    console.log("operator-turn-background error:", e && e.message);
    return reply(500, { error: "Something went wrong." });
  }
};

// Exported for unit tests (test/operator-turn-background.test.js).
exports.handleBackground = handleBackground;
