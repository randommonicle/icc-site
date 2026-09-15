// D-040 operator assistant — turn admission (operatorAdmission.js, Beta 4 slice 2).
//
// Unit half: the helper's fail-closed mapping over a fake rpc — the ONLY outcome that
// admits is a literal `true`; a literal `false` is over_limit (429); everything else
// (no client, error, throw, NULL, a string) refuses without admitting, and a non-uuid
// identity never reaches the DB. Limit parsing from OPERATOR_TURN_LIMIT.
//
// Integration half ([integration], ICC_SUPABASE_IT=1 with the local Docker stack): the
// acceptance test the D-040 addendum requires — the LAST-SLOT RACE. Ten independent
// supabase-js clients (standing in for ten Netlify Lambda instances) fire operator_admit
// concurrently with one slot left; exactly one is admitted. This is what a Blobs
// get/set limiter cannot guarantee and why the counter is a Postgres statement.

const { test } = require("node:test");
const assert = require("node:assert");
const { admitOperatorTurn, turnLimit, secondsToNextWindow, DEFAULT_LIMIT } = require("../server/netlify/functions/operatorAdmission.js");

const UID = "11111111-2222-4333-8444-555555555555";

// A fake client whose rpc resolves/rejects as instructed and records its calls.
function fakeClient(behaviour) {
  const calls = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push({ fn, args });
      if (behaviour.throws) throw new Error(behaviour.throws);
      return behaviour.result;
    },
  };
}

// --- unit: the fail-closed mapping ------------------------------------------

test("admits ONLY on a literal true from the DB", async () => {
  const sb = fakeClient({ result: { data: true, error: null } });
  assert.deepStrictEqual(await admitOperatorTurn(sb, UID, 5), { admitted: true });
  assert.deepStrictEqual(sb.calls, [{ fn: "operator_admit", args: { p_user_id: UID, p_limit: 5 } }]);
});

test("a literal false is over_limit (the 429 path), not unavailable", async () => {
  const sb = fakeClient({ result: { data: false, error: null } });
  assert.deepStrictEqual(await admitOperatorTurn(sb, UID, 5), { admitted: false, reason: "over_limit" });
});

test("NULL, a truthy string, an object: ambiguous, never admitted", async () => {
  for (const data of [null, undefined, "true", "t", 1, { ok: true }, [true]]) {
    const sb = fakeClient({ result: { data, error: null } });
    assert.deepStrictEqual(await admitOperatorTurn(sb, UID, 5), { admitted: false, reason: "ambiguous" }, "data=" + JSON.stringify(data));
  }
});

test("an rpc error, a thrown rpc, an empty response: unavailable (the 503 path)", async () => {
  // PGRST202 is what PostgREST returns for a function it cannot find (the live shape of
  // migration 20260913180000 not applied, verified 2026-09-15); any error refuses, so the
  // code is not consulted, but the fake should still speak the seam's dialect (L-040).
  assert.deepStrictEqual(await admitOperatorTurn(fakeClient({ result: { data: null, error: { code: "PGRST202", message: "Could not find the function public.operator_admit" } } }), UID, 5),
    { admitted: false, reason: "unavailable" });
  assert.deepStrictEqual(await admitOperatorTurn(fakeClient({ throws: "fetch failed" }), UID, 5),
    { admitted: false, reason: "unavailable" });
  assert.deepStrictEqual(await admitOperatorTurn(fakeClient({ result: undefined }), UID, 5),
    { admitted: false, reason: "unavailable" });
  // An error alongside data:true still refuses — the error wins.
  assert.deepStrictEqual(await admitOperatorTurn(fakeClient({ result: { data: true, error: { message: "x" } } }), UID, 5),
    { admitted: false, reason: "unavailable" });
});

test("no client / a client without rpc: unavailable, nothing called", async () => {
  assert.deepStrictEqual(await admitOperatorTurn(null, UID, 5), { admitted: false, reason: "unavailable" });
  assert.deepStrictEqual(await admitOperatorTurn({}, UID, 5), { admitted: false, reason: "unavailable" });
});

test("a non-uuid identity is refused BEFORE the DB is called (identity comes from requireAdmin, never a body)", async () => {
  for (const bad of ["", "mark", "11111111-2222-4333-8444-55555555555", 42, null, undefined, { id: UID }]) {
    const sb = fakeClient({ result: { data: true, error: null } });
    assert.deepStrictEqual(await admitOperatorTurn(sb, bad, 5), { admitted: false, reason: "bad_identity" }, "id=" + JSON.stringify(bad));
    assert.strictEqual(sb.calls.length, 0, "rpc must not be called for " + JSON.stringify(bad));
  }
});

test("limit: an explicit positive integer wins; otherwise OPERATOR_TURN_LIMIT; otherwise the default", async () => {
  const saved = process.env.OPERATOR_TURN_LIMIT;
  try {
    delete process.env.OPERATOR_TURN_LIMIT;
    let sb = fakeClient({ result: { data: true, error: null } });
    await admitOperatorTurn(sb, UID);
    assert.strictEqual(sb.calls[0].args.p_limit, DEFAULT_LIMIT, "default when unset");

    process.env.OPERATOR_TURN_LIMIT = "7";
    sb = fakeClient({ result: { data: true, error: null } });
    await admitOperatorTurn(sb, UID);
    assert.strictEqual(sb.calls[0].args.p_limit, 7, "env value used");

    sb = fakeClient({ result: { data: true, error: null } });
    await admitOperatorTurn(sb, UID, 3);
    assert.strictEqual(sb.calls[0].args.p_limit, 3, "explicit argument beats env");

    sb = fakeClient({ result: { data: true, error: null } });
    await admitOperatorTurn(sb, UID, 0);
    assert.strictEqual(sb.calls[0].args.p_limit, 7, "a non-positive explicit limit falls back to env");
  } finally {
    if (saved === undefined) delete process.env.OPERATOR_TURN_LIMIT; else process.env.OPERATOR_TURN_LIMIT = saved;
  }
});

test("turnLimit parses only a clean positive integer; anything else is the default (a typo loosens nothing)", () => {
  assert.strictEqual(turnLimit({ OPERATOR_TURN_LIMIT: "12" }), 12);
  assert.strictEqual(turnLimit({ OPERATOR_TURN_LIMIT: " 12 " }), 12);
  assert.strictEqual(turnLimit({}), DEFAULT_LIMIT);
  for (const bad of ["0", "-5", "abc", "12abc", "1e3", "", "Infinity", "3.5"]) {
    assert.strictEqual(turnLimit({ OPERATOR_TURN_LIMIT: bad }), DEFAULT_LIMIT, "value=" + JSON.stringify(bad));
  }
});

test("secondsToNextWindow counts down to the hour boundary", () => {
  // 1_700_000_400 s = 472_222 h + 1_200 s, so 2_400 s remain in that hour.
  assert.strictEqual(secondsToNextWindow(1_700_000_400 * 1000), 2400);
  assert.strictEqual(secondsToNextWindow(3600 * 1000 * 1000), 3600, "exactly on the boundary: a full window");
  assert.strictEqual(secondsToNextWindow(3600 * 1000 * 1000 - 1000), 1, "one second before the boundary");
});

// --- integration: the last-slot race against real Postgres --------------------
// safe-smokes: uses its own synthetic user ids and deletes only those rows before and
// after. The seed row is written for the CURRENT hour; if the test starts within two
// seconds of an hour boundary it waits, so the race cannot straddle two windows.

const IT_SKIP = process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run";
const IT_USER = "00000000-0000-4000-8000-00000000c0de";

function utcHourStart(nowMs) {
  const d = new Date(nowMs);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

test("[integration] last-slot race: ten independent clients, one slot left, exactly one admitted", { skip: IT_SKIP }, async () => {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must point at the local stack");
  const mk = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = mk();

  // Never straddle an hour boundary.
  const toBoundary = secondsToNextWindow(Date.now());
  if (toBoundary <= 2) await new Promise((r) => setTimeout(r, (toBoundary + 1) * 1000));

  const LIMIT = 5;
  const cleanup = async () => { await admin.from("operator_rate").delete().eq("user_id", IT_USER); };
  await cleanup();
  try {
    // Seed: one slot left in the current window.
    const seed = await admin.from("operator_rate").insert({ user_id: IT_USER, window_start: utcHourStart(Date.now()), count: LIMIT - 1 });
    assert.strictEqual(seed.error, null, seed.error && seed.error.message);

    // Ten independent instances race for it.
    const clients = Array.from({ length: 10 }, mk);
    const results = await Promise.all(clients.map((c) => admitOperatorTurn(c, IT_USER, LIMIT)));
    const admitted = results.filter((r) => r.admitted).length;
    const refused = results.filter((r) => !r.admitted && r.reason === "over_limit").length;
    assert.strictEqual(admitted, 1, "exactly one instance wins the last slot: " + JSON.stringify(results));
    assert.strictEqual(refused, 9, "the other nine get a definite over_limit, not unavailable/ambiguous");

    // The counter stopped at the limit; nobody over-counted.
    const { data } = await admin.from("operator_rate").select("count").eq("user_id", IT_USER);
    assert.deepStrictEqual(data.map((r) => r.count), [LIMIT]);

    // And a fresh window for the same user admits again (the limit is per hour, not for ever).
    await cleanup();
    assert.deepStrictEqual(await admitOperatorTurn(mk(), IT_USER, LIMIT), { admitted: true });
  } finally {
    await cleanup();
  }
});
