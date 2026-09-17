// D-040 operator assistant — the endpoint (operatorChat.js, Beta 4 slice 4; background
// turn D-045). The addendum's gate ORDER on POST (identity, then the bounded body, then
// configuration, then the atomic budget, and only then anything stored or started), then
// the D-045 hand-off: the row is stored BEFORE the trigger, the trigger is the ONLY fetch
// (the model endpoint is never touched here), a trigger that fails abandons the row and
// answers 503, and a trigger answered 200 (background mode not active) is logged, not
// failed. GET is the poll: own rows only, 404 for anything else, one shape per state.
// The turn itself is pinned in test/operator-turn-runner.test.js. Identity, admission and
// the store are injected.

const { test } = require("node:test");
const assert = require("node:assert");
const oc = require("../server/netlify/functions/operatorChat.js");
const { STOPPED_TEXT } = require("../server/netlify/functions/operatorTurnRunner.js");

const UID = "11111111-2222-4333-8444-555555555555";
const TID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const HEADERS = { "Access-Control-Allow-Origin": "https://www.intelligentclean.co.uk" };
const ENV = { DEPLOY_URL: "https://deadbeef--super-frangollo-c3a14a.netlify.app", URL: "https://super-frangollo-c3a14a.netlify.app" };
const T0 = Date.parse("2026-09-17T22:00:00Z");

function event(body, headers, method) {
  return { httpMethod: method || "POST", headers: Object.assign({ authorization: "Bearer jwt", "x-forwarded-for": "203.0.113.9" }, headers || {}), body: typeof body === "string" ? body : JSON.stringify(body) };
}
const user = (text) => ({ messages: [{ role: "user", content: text }] });
const okAdmin = async () => ({ ok: true, user: { id: UID, email: "mark_director@intelligentclean.co.uk" } });
const admitYes = async () => ({ admitted: true });

// The trigger: a fake fetch that records every call and answers the scripted status (or throws).
function triggerFetch(status, reject) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    if (reject) throw reject;
    return { ok: status < 400, status, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

function deps(over) {
  const o = over || {};
  const calls = { prune: [], enqueue: [], abandon: [], read: [], log: [] };
  const d = Object.assign({
    requireAdminFn: okAdmin, enforceRateLimitFn: async () => ({ ok: true }), supabase: { from() { throw new Error("the fake store never touches the client"); } },
    admit: admitYes, apiKey: "sk-test", env: ENV, nowMs: () => T0, fetchImpl: triggerFetch(202),
    log: (...a) => calls.log.push(a.join(" ")),
  }, o);
  const wrap = (name, fn) => async (...args) => { calls[name].push(args); return fn(...args); };
  d.prune = wrap("prune", o.prune || (async () => ({ pruned: 0 })));
  d.enqueue = wrap("enqueue", o.enqueue || (async () => ({ id: TID })));
  d.abandon = wrap("abandon", o.abandon || (async () => ({ abandoned: true })));
  d.read = wrap("read", o.read || (async () => ({ found: false, reason: "not_found" })));
  d.calls = calls;
  return d;
}
async function post(body, over, headers) {
  const d = deps(over);
  const res = await oc.handlePost(event(body, headers), HEADERS, d);
  return { res, json: res.body ? JSON.parse(res.body) : null, d, calls: d.calls };
}
async function get(turn, over) {
  const d = deps(over);
  const ev = Object.assign(event(null, {}, "GET"), { queryStringParameters: turn === undefined ? {} : { turn } });
  const res = await oc.handleGet(ev, HEADERS, d);
  return { res, json: res.body ? JSON.parse(res.body) : null, d, calls: d.calls };
}
const nothingStored = (calls) => calls.enqueue.length === 0 && calls.prune.length === 0;

// --- POST: gate order ------------------------------------------------------------------------

test("identity first: a non-admin gets 401/403/503 and nothing else runs (no admission, no store, no trigger)", async () => {
  for (const auth of [{ ok: false, status: 401, error: "Unauthorized" }, { ok: false, status: 403, error: "Forbidden" }, { ok: false, status: 503, error: "Auth not configured" }]) {
    let admitted = 0;
    const { res, json, d, calls } = await post(user("hi"), { requireAdminFn: async () => auth, admit: async () => { admitted++; return { admitted: true }; } });
    assert.strictEqual(res.statusCode, auth.status);
    assert.deepStrictEqual(json, { error: auth.error });
    assert.strictEqual(admitted, 0);
    assert.ok(nothingStored(calls));
    assert.strictEqual(d.fetchImpl.calls.length, 0);
  }
});

test("per-IP limiter (defence in depth) refuses before the body is read; admission untouched", async () => {
  let admitted = 0;
  const { res, d, calls } = await post("{not json", { enforceRateLimitFn: async () => ({ ok: false, retryAfter: 3600 }), admit: async () => { admitted++; return { admitted: true }; } });
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.headers["Retry-After"], "3600");
  const body = JSON.parse(res.body);
  assert.ok(!body.error.includes("01452"), "the operator is not told to phone the business");
  assert.strictEqual(body.retry_after, 3600);
  assert.strictEqual(admitted, 0);
  assert.ok(nothingStored(calls));
  assert.strictEqual(d.fetchImpl.calls.length, 0);
});

test("a bad body is a 400 before any budget is spent or anything stored", async () => {
  const cases = [
    ["{not json", /Invalid JSON/],
    [{}, /1 to 20 turns/],
    [{ messages: [] }, /1 to 20 turns/],
    [{ messages: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) }, /1 to 20 turns/],
    [{ messages: [{ role: "assistant", content: "x" }] }, /alternate/],
    [{ messages: [{ role: "user", content: "x" }, { role: "user", content: "y" }] }, /alternate/],
    [{ messages: [{ role: "user", content: "x" }, { role: "assistant", content: "y" }] }, /last message must be from the user/],
    [{ messages: [{ role: "user", content: "" }] }, /non-empty string/],
    [{ messages: [{ role: "user", content: [{ type: "text", text: "x" }] }] }, /non-empty string/],
    [{ messages: [{ role: "user", content: "x".repeat(4001) }] }, /at most 4000/],
  ];
  for (const [body, re] of cases) {
    let admitted = 0;
    const { res, json, calls } = await post(body, { admit: async () => { admitted++; return { admitted: true }; } });
    assert.strictEqual(res.statusCode, 400, JSON.stringify(body).slice(0, 60));
    assert.match(json.error, re);
    assert.strictEqual(admitted, 0);
    assert.ok(nothingStored(calls));
  }
});

test("a misconfigured deploy (no API key / no Supabase / no site URL) fails before admission, so no budget is charged", async () => {
  let admitted = 0;
  const count = async () => { admitted++; return { admitted: true }; };
  const a = await post(user("hi"), { apiKey: "", admit: count });
  assert.strictEqual(a.res.statusCode, 500);
  const b = await post(user("hi"), { supabase: null, admit: count });
  assert.strictEqual(b.res.statusCode, 503);
  const c = await post(user("hi"), { env: {}, admit: count });
  assert.strictEqual(c.res.statusCode, 503);
  assert.match(c.json.error, /Site URL/);
  assert.strictEqual(admitted, 0);
});

test("admission is keyed on the verified user id, never a body field, and runs before anything is stored", async () => {
  const seen = [];
  let stored = 0;
  const { res, calls } = await post({ messages: [{ role: "user", content: "hi" }], user_id: "attacker", email: "x@y" }, {
    admit: async (sb, id) => { seen.push(id); assert.strictEqual(stored, 0, "nothing stored before admission"); return { admitted: true }; },
    enqueue: async () => { stored++; return { id: TID }; },
  });
  assert.strictEqual(res.statusCode, 202);
  assert.deepStrictEqual(seen, [UID]);
  assert.strictEqual(stored, 1);
  assert.strictEqual(calls.enqueue[0][1], UID, "the row belongs to the verified user");
});

test("over_limit => 429 with Retry-After to the next hour window; unavailable/ambiguous/bad_identity => 503; nothing stored or triggered in any case", async () => {
  const t = Date.parse("2026-09-13T12:40:00Z");
  const over = await post(user("hi"), { admit: async () => ({ admitted: false, reason: "over_limit" }), nowMs: () => t });
  assert.strictEqual(over.res.statusCode, 429);
  assert.strictEqual(over.res.headers["Retry-After"], "1200");
  assert.strictEqual(over.json.retry_after, 1200);
  assert.match(over.json.error, /about 20 minutes/);
  assert.ok(nothingStored(over.calls));
  assert.strictEqual(over.d.fetchImpl.calls.length, 0);
  for (const reason of ["unavailable", "ambiguous", "bad_identity"]) {
    const r = await post(user("hi"), { admit: async () => ({ admitted: false, reason }) });
    assert.strictEqual(r.res.statusCode, 503, reason);
    assert.match(r.json.error, /turn budget could not be checked/);
    assert.ok(nothingStored(r.calls));
    assert.strictEqual(r.d.fetchImpl.calls.length, 0);
  }
});

// --- POST: the hand-off -----------------------------------------------------------------------

test("happy path: prune, store the validated transcript for the verified user, trigger the background function with the id only, answer 202", async () => {
  const messages = [{ role: "user", content: "How many jobs this week?" }, { role: "assistant", content: "Three." }, { role: "user", content: "And next week?" }];
  const { res, json, d, calls } = await post({ messages });
  assert.strictEqual(res.statusCode, 202);
  assert.deepStrictEqual(json, { turn_id: TID });
  assert.deepStrictEqual(calls.prune[0].slice(1), [T0]);
  assert.strictEqual(calls.enqueue.length, 1);
  assert.deepStrictEqual(calls.enqueue[0].slice(1), [UID, messages]);
  assert.ok(calls.prune.length === 1 && calls.enqueue.length === 1);
  assert.strictEqual(d.fetchImpl.calls.length, 1, "the trigger is the only fetch");
  const call = d.fetchImpl.calls[0];
  assert.strictEqual(call.url, ENV.DEPLOY_URL + oc.BACKGROUND_PATH, "this deploy's own background function");
  assert.strictEqual(call.init.method, "POST");
  assert.deepStrictEqual(call.body, { turn_id: TID }, "the id and nothing else: the transcript travels through the row, not the trigger");
  assert.ok(call.init.signal, "the trigger call is time-bounded");
  assert.ok(!call.url.includes("anthropic"), "the model is never called here");
  assert.strictEqual(calls.abandon.length, 0);
});

test("the row is stored BEFORE the trigger: an enqueue failure is a 503 with no trigger and no abandon", async () => {
  const { res, json, d, calls } = await post(user("hi"), { enqueue: async () => ({ error: "unavailable" }) });
  assert.strictEqual(res.statusCode, 503);
  assert.match(json.error, /could not be queued/);
  assert.strictEqual(d.fetchImpl.calls.length, 0);
  assert.strictEqual(calls.abandon.length, 0);
  assert.ok(calls.log.some((l) => l === "operator turn enqueue failed: unavailable"));
});

test("a trigger that throws or answers anything but 202/200 abandons the row (queued -> failed) and answers 503, so the panel puts the question back", async () => {
  const boom = Object.assign(new Error("fetch failed"), { name: "TypeError" });
  for (const [fetchImpl, expectLog] of [[triggerFetch(0, boom), "operator turn trigger failed: fetch failed " + TID], [triggerFetch(500), "operator turn trigger answered 500 " + TID], [triggerFetch(404), "operator turn trigger answered 404 " + TID]]) {
    const { res, json, calls } = await post(user("hi"), { fetchImpl });
    assert.strictEqual(res.statusCode, 503);
    assert.match(json.error, /could not be started/);
    assert.deepStrictEqual(calls.abandon[0].slice(1), [TID, T0]);
    assert.ok(calls.log.includes(expectLog), calls.log.join(" | "));
  }
  const ab = await post(user("hi"), { fetchImpl: triggerFetch(500), abandon: async () => ({ abandoned: false, reason: "unavailable" }) });
  assert.strictEqual(ab.res.statusCode, 503);
  assert.ok(ab.calls.log.some((l) => l === "operator turn abandon failed: unavailable " + TID));
});

test("a trigger answered 200 (the platform ran the function synchronously) still answers 202 and logs that background mode is not active", async () => {
  const { res, json, calls } = await post(user("hi"), { fetchImpl: triggerFetch(200) });
  assert.strictEqual(res.statusCode, 202);
  assert.deepStrictEqual(json, { turn_id: TID });
  assert.strictEqual(calls.abandon.length, 0);
  assert.ok(calls.log.some((l) => l.startsWith("operator turn trigger answered 200, not 202: background mode is not active")), calls.log.join(" | "));
});

test("a failed prune is logged and never fatal", async () => {
  const { res, calls } = await post(user("hi"), { prune: async () => ({ error: "unavailable" }) });
  assert.strictEqual(res.statusCode, 202);
  assert.ok(calls.log.some((l) => l === "operator turns prune failed: unavailable"));
});

test("triggerOrigin: the per-deploy host first, then the branch/prime host, then URL, then PUBLIC_SITE_URL; slashes stripped, junk ignored, null when none", () => {
  assert.strictEqual(oc.triggerOrigin({ DEPLOY_URL: "https://a.netlify.app/", DEPLOY_PRIME_URL: "https://b.netlify.app", URL: "https://c", PUBLIC_SITE_URL: "https://d" }), "https://a.netlify.app");
  assert.strictEqual(oc.triggerOrigin({ DEPLOY_PRIME_URL: "https://b.netlify.app", URL: "https://c" }), "https://b.netlify.app");
  assert.strictEqual(oc.triggerOrigin({ URL: "https://c.netlify.app", PUBLIC_SITE_URL: "https://d" }), "https://c.netlify.app");
  assert.strictEqual(oc.triggerOrigin({ PUBLIC_SITE_URL: "https://www.intelligentclean.co.uk/" }), "https://www.intelligentclean.co.uk");
  assert.strictEqual(oc.triggerOrigin({ DEPLOY_URL: "not a url", URL: " https://c " }), "https://c");
  assert.strictEqual(oc.triggerOrigin({}), null);
  assert.strictEqual(oc.triggerOrigin({ DEPLOY_URL: "javascript:alert(1)" }), null);
});

// --- GET: the poll ----------------------------------------------------------------------------

test("the poll requires an admin (401/403 before any read) and a uuid turn (400 before any read)", async () => {
  for (const auth of [{ ok: false, status: 401, error: "Unauthorized" }, { ok: false, status: 403, error: "Forbidden" }]) {
    const { res, json, calls } = await get(TID, { requireAdminFn: async () => auth });
    assert.strictEqual(res.statusCode, auth.status);
    assert.deepStrictEqual(json, { error: auth.error });
    assert.strictEqual(calls.read.length, 0);
  }
  for (const bad of [undefined, "", "nope", "../x", TID + "1"]) {
    const { res, calls } = await get(bad);
    assert.strictEqual(res.statusCode, 400, String(bad));
    assert.strictEqual(calls.read.length, 0);
  }
});

test("the read is scoped to the caller's own user id; unknown or foreign is a 404 that says nothing more; a store outage is a 503", async () => {
  const nf = await get(TID);
  assert.strictEqual(nf.res.statusCode, 404);
  assert.deepStrictEqual(nf.json, { error: "No such turn." });
  assert.deepStrictEqual(nf.calls.read[0].slice(1), [TID, UID], "id AND the verified user id");
  const bad = await get(TID, { read: async () => ({ found: false, reason: "bad_id" }) });
  assert.strictEqual(bad.res.statusCode, 404);
  const down = await get(TID, { read: async () => ({ found: false, reason: "unavailable" }) });
  assert.strictEqual(down.res.statusCode, 503);
  assert.match(down.json.error, /could not be read/);
});

test("one shape per state: queued / running keep the panel polling; done, stopped and failed map onto the panel's three branches", async () => {
  const usage = { model_calls: 2, tool_calls: 1 };
  const content = [{ type: "text", text: "£75.00" }];
  const shape = async (row) => (await get(TID, { read: async () => Object.assign({ found: true }, row) })).json;
  assert.deepStrictEqual(await shape({ status: "queued", result: null }), { status: "queued" });
  assert.deepStrictEqual(await shape({ status: "running", result: null }), { status: "running" });
  assert.deepStrictEqual(await shape({ status: "done", result: { content, usage, truncated: false } }), { status: "done", content, usage });
  assert.deepStrictEqual(await shape({ status: "done", result: { content, usage, truncated: true } }), { status: "done", content, usage, truncated: true });
  assert.deepStrictEqual(await shape({ status: "stopped", result: { content: [{ type: "text", text: STOPPED_TEXT.deadline }], usage, stopped: "deadline" } }),
    { status: "stopped", stopped: "deadline", content: [{ type: "text", text: STOPPED_TEXT.deadline }], usage });
  assert.deepStrictEqual(await shape({ status: "stopped", result: { usage, stopped: "model_calls" } }),
    { status: "stopped", stopped: "model_calls", content: [{ type: "text", text: STOPPED_TEXT.model_calls }], usage }, "a stored stopped result without content still carries the fixed line");
  assert.deepStrictEqual(await shape({ status: "failed", result: null }), { status: "failed", error: "The assistant could not complete that turn." });
  const failed = await shape({ status: "failed", result: { usage } });
  assert.ok(!JSON.stringify(failed).includes("model_calls"), "a failed turn leaks no detail to the panel");
});

// --- the wrapper handler: CORS + method + strict origin ---------------------------------------

test("handler: OPTIONS carries the operator CORS contract (Authorization allowed, GET and POST), PUT is 405, strict mode refuses a foreign origin on both verbs before auth", async () => {
  const opt = await oc.handler({ httpMethod: "OPTIONS", headers: { origin: "https://www.intelligentclean.co.uk" } });
  assert.strictEqual(opt.statusCode, 200);
  assert.strictEqual(opt.headers["Access-Control-Allow-Headers"], "Content-Type, Authorization");
  assert.strictEqual(opt.headers["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");
  const put = await oc.handler({ httpMethod: "PUT", headers: {} });
  assert.strictEqual(put.statusCode, 405);

  // Strict mode is a module-load decision (like chat.js), so load a fresh copy under it.
  const path = require.resolve("../server/netlify/functions/operatorChat.js");
  const saved = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = "https://www.intelligentclean.co.uk";
  delete require.cache[path];
  try {
    const strict = require(path);
    for (const method of ["POST", "GET"]) {
      const res = await strict.handler({ httpMethod: method, headers: { origin: "https://evil.example.com", authorization: "Bearer x" }, body: "{}", queryStringParameters: { turn: TID } });
      assert.strictEqual(res.statusCode, 403, method);
      assert.deepStrictEqual(JSON.parse(res.body), { error: "Forbidden origin" });
    }
  } finally {
    if (saved === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = saved;
    delete require.cache[path];
  }
});
