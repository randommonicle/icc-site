// D-045 operator assistant background turn — the background function
// (operatorTurn-background.js). What it must and must not do: run a turn ONLY after a
// claim matched (a bad body, a junk id, a misconfigured deploy or an unclaimed row runs
// nothing and records nothing); anchor the deadline at its own entry; record the runner's
// result once in the shape the poll returns; and turn a throw mid-turn into a recorded
// `failed`, never a row left `running`. claim, record and the runner are injected.

const { test } = require("node:test");
const assert = require("node:assert");
const bg = require("../server/netlify/functions/operatorTurn-background.js");
const { deadlineMs } = require("../server/netlify/functions/operatorTurnRunner.js");

const UID = "11111111-2222-4333-8444-555555555555";
const TID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MSGS = [{ role: "user", content: "What did I take in September?" }];
const T0 = Date.parse("2026-09-17T22:00:00Z");
const DONE = { kind: "done", content: [{ type: "text", text: "£75.00" }], usage: { model_calls: 2, tool_calls: 1 } };

function event(body, method) {
  return { httpMethod: method || "POST", headers: {}, body: typeof body === "string" ? body : JSON.stringify(body) };
}

// Every injected function is recorded (args as given) whether or not the test overrides it.
function deps(over) {
  const o = over || {};
  const calls = { claim: [], record: [], run: [], log: [] };
  const wrap = (name, fn) => async (...args) => { calls[name].push(args); return fn(...args); };
  const d = Object.assign({
    supabase: { from() { throw new Error("the fake store never touches the client"); } },
    apiKey: "sk-test",
    nowMs: () => T0,
    now: "2026-09-17T22:00:00Z",
    log: (...a) => calls.log.push(a.join(" ")),
  }, o);
  d.claim = wrap("claim", o.claim || (async () => ({ claimed: true, userId: UID, messages: MSGS })));
  d.record = wrap("record", o.record || (async () => ({ recorded: true })));
  d.runTurn = wrap("run", o.runTurn || (async () => DONE));
  d.calls = calls;
  return d;
}
async function run(body, over, method) {
  const d = deps(over);
  const res = await bg.handleBackground(event(body, method), d);
  return { res, json: res.body ? JSON.parse(res.body) : null, d, calls: d.calls };
}

test("nothing runs on a non-POST, a bad body or a junk id: no claim, no run, no record", async () => {
  for (const [body, method, status] of [[{ turn_id: TID }, "GET", 405], ["{not json", "POST", 400], [{}, "POST", 400], [{ turn_id: "nope" }, "POST", 400], [{ turn_id: 42 }, "POST", 400]]) {
    const { res, calls } = await run(body, {}, method);
    assert.strictEqual(res.statusCode, status, JSON.stringify(body) + " " + method);
    assert.strictEqual(calls.claim.length, 0);
    assert.strictEqual(calls.run.length, 0);
    assert.strictEqual(calls.record.length, 0);
  }
});

test("a misconfigured deploy (no API key / no Supabase) claims nothing, so the row is left for the prune, not burnt", async () => {
  for (const over of [{ apiKey: "" }, { supabase: null }]) {
    const { res, calls } = await run({ turn_id: TID }, over);
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(calls.claim.length, 0);
    assert.strictEqual(calls.run.length, 0);
    assert.ok(calls.log.some((l) => l.startsWith("operator turn not run: misconfigured deploy")));
  }
});

test("an unclaimed row (a replay, a retry, a guessed id) runs nothing and records nothing", async () => {
  for (const reason of ["not_queued", "unavailable"]) {
    const { res, json, calls } = await run({ turn_id: TID }, { claim: async () => ({ claimed: false, reason }) });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(json, { ok: true, claimed: false, reason });
    assert.strictEqual(calls.run.length, 0);
    assert.strictEqual(calls.record.length, 0);
    assert.ok(calls.log.some((l) => l === "operator turn not claimed: " + reason + " " + TID));
  }
});

test("a claimed row runs the stored transcript with the deadline anchored at entry and records the done result in the poll's shape", async () => {
  let t = T0;
  const { res, json, calls } = await run({ turn_id: TID }, {
    nowMs: () => t,
    runTurn: async () => { t += 6500; return Object.assign({}, DONE, { truncated: true }); },
  });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(json, { ok: true, claimed: true, kind: "done", recorded: true });
  assert.strictEqual(calls.claim.length, 1);
  assert.deepStrictEqual(calls.claim[0].slice(1), [TID, T0], "claimed by id at entry time");
  assert.strictEqual(calls.run.length, 1);
  assert.deepStrictEqual(calls.run[0][0], MSGS, "the STORED transcript, not a body field");
  const o = calls.run[0][1];
  assert.strictEqual(o.apiKey, "sk-test");
  assert.strictEqual(o.deadlineAt, T0 + deadlineMs(), "anchored at THIS function's entry, with the default deadline");
  assert.strictEqual(calls.record.length, 1);
  assert.deepStrictEqual(calls.record[0].slice(1), [TID, { kind: "done", result: { content: DONE.content, usage: DONE.usage, truncated: true } }, T0 + 6500]);
  assert.ok(calls.log.some((l) => l.startsWith("operator turn recorded: done ms=6500")), calls.log.join(" | "));
});

test("an explicit deadline dep overrides the default; a stopped result is recorded with its kind; a failed result carries usage only", async () => {
  const text = "That took too long to answer in one turn. Ask something narrower.";
  const stopped = await run({ turn_id: TID }, { deadline: 30000, runTurn: async () => ({ kind: "stopped", stopped: "deadline", content: [{ type: "text", text }], usage: { model_calls: 1, tool_calls: 1 } }) });
  assert.strictEqual(stopped.calls.run[0][1].deadlineAt, T0 + 30000);
  assert.deepStrictEqual(stopped.calls.record[0][2], { kind: "stopped", result: { content: [{ type: "text", text }], usage: { model_calls: 1, tool_calls: 1 }, stopped: "deadline" } });

  const failed = await run({ turn_id: TID }, { runTurn: async () => ({ kind: "failed", usage: { model_calls: 1, tool_calls: 0 } }) });
  assert.deepStrictEqual(failed.calls.record[0][2], { kind: "failed", result: { usage: { model_calls: 1, tool_calls: 0 } } });
  assert.deepStrictEqual(failed.json, { ok: true, claimed: true, kind: "failed", recorded: true });
});

test("a throw mid-turn is recorded as failed (the row is never left running by this code) and the message is logged, not stored", async () => {
  const { res, json, calls } = await run({ turn_id: TID }, { runTurn: async () => { throw new Error("socket hang up"); } });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(json, { ok: true, claimed: true, kind: "failed", recorded: true });
  assert.deepStrictEqual(calls.record[0][2], { kind: "failed", result: null });
  assert.ok(calls.log.some((l) => l === "operator turn crashed: socket hang up"));
});

test("a record that does not land is logged as such, with the kind, and the handler still answers", async () => {
  const { json, calls } = await run({ turn_id: TID }, { record: async () => ({ recorded: false, reason: "not_running" }) });
  assert.deepStrictEqual(json, { ok: true, claimed: true, kind: "done", recorded: false });
  assert.ok(calls.log.some((l) => l === "operator turn record failed: not_running done " + TID), calls.log.join(" | "));
  assert.ok(!calls.log.some((l) => l.startsWith("operator turn recorded:")));
});

test("the exported handler is a Lambda-style function: with no API key in the environment it answers 500 without throwing", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = await bg.handler(event({ turn_id: TID }));
    assert.strictEqual(res.statusCode, 500);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
