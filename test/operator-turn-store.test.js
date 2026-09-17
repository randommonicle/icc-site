// D-045 operator assistant background turn — the turn store (operatorTurnStore.js).
//
// Unit half: each function issues exactly the statement the guard depends on — the claim
// and the record carry BOTH filters (id and status), the read carries id AND user_id, the
// prune cuts on created_at at an hour — and maps every DB outcome to a plain result
// (never a throw). The client is a fake query builder that records the chain and answers
// a scripted result, so a dropped filter fails here before it ever reaches Postgres.
//
// Integration half ([integration], ICC_SUPABASE_IT=1 with the local Docker stack): the
// CLAIM RACE the background function's guard relies on — ten independent supabase-js
// clients (ten Lambda instances) claim one queued row concurrently; exactly one gets it.
// The same test then runs the claim WITHOUT the status filter as a negative control and
// shows every racer "wins", which is the proof that the filter, not luck, makes the claim
// exclusive. Plus record-once, own-rows-only reads and the hour prune, against real rows.

const { test } = require("node:test");
const assert = require("node:assert");
const store = require("../server/netlify/functions/operatorTurnStore.js");

const UID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const TID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-09-17T22:00:00Z");
const MSGS = [{ role: "user", content: "hi" }];

// A fake supabase-js client: every from() opens one statement whose chain is recorded;
// awaiting it answers the next scripted { data, error } (or throws when told to).
function fakeClient(script) {
  const ops = [];
  const queue = Array.isArray(script) ? script.slice() : [script];
  return {
    ops,
    from(table) {
      const op = { table, chain: [] };
      ops.push(op);
      const b = {};
      for (const m of ["insert", "update", "delete", "select", "eq", "lt", "single", "maybeSingle"]) {
        b[m] = (...args) => { op.chain.push([m, ...args]); return b; };
      }
      b.then = (resolve, reject) => {
        const r = queue.length ? queue.shift() : { data: null, error: null };
        if (r && r.__throw) return Promise.reject(new Error(r.__throw)).then(resolve, reject);
        return Promise.resolve(r).then(resolve, reject);
      };
      return b;
    },
  };
}
const chainNames = (op) => op.chain.map((c) => c[0]);
const chainStep = (op, name) => op.chain.find((c) => c[0] === name);

// --- unit: the statements ---------------------------------------------------------------------

test("enqueueTurn inserts a queued row for the verified user and returns its id; junk identity never reaches the DB", async () => {
  const sb = fakeClient([{ data: { id: TID }, error: null }]);
  assert.deepStrictEqual(await store.enqueueTurn(sb, UID, MSGS), { id: TID });
  assert.strictEqual(sb.ops[0].table, "operator_turns");
  assert.deepStrictEqual(chainStep(sb.ops[0], "insert")[1], { user_id: UID, status: "queued", messages: MSGS });
  assert.deepStrictEqual(chainNames(sb.ops[0]), ["insert", "select", "single"]);

  const none = fakeClient([]);
  assert.deepStrictEqual(await store.enqueueTurn(none, "attacker", MSGS), { error: "bad_identity" });
  assert.strictEqual(none.ops.length, 0);
  assert.deepStrictEqual(await store.enqueueTurn(fakeClient([{ data: null, error: { message: "boom" } }]), UID, MSGS), { error: "unavailable" });
  assert.deepStrictEqual(await store.enqueueTurn(fakeClient([{ __throw: "fetch failed" }]), UID, MSGS), { error: "unavailable" });
  assert.deepStrictEqual(await store.enqueueTurn(fakeClient([{ data: { id: "not-a-uuid" }, error: null }]), UID, MSGS), { error: "unavailable" });
  assert.deepStrictEqual(await store.enqueueTurn(null, UID, MSGS), { error: "unavailable" });
});

test("claimTurn is ONE update filtered on id AND status = queued, returning the transcript; one row claims, zero rows does not", async () => {
  const sb = fakeClient([{ data: [{ user_id: UID, messages: MSGS }], error: null }]);
  assert.deepStrictEqual(await store.claimTurn(sb, TID, NOW), { claimed: true, userId: UID, messages: MSGS });
  const op = sb.ops[0];
  assert.strictEqual(op.table, "operator_turns");
  assert.deepStrictEqual(chainStep(op, "update")[1], { status: "running", started_at: "2026-09-17T22:00:00.000Z" });
  const eqs = op.chain.filter((c) => c[0] === "eq").map((c) => c.slice(1));
  assert.deepStrictEqual(eqs, [["id", TID], ["status", "queued"]], "both filters, or two callers could both claim");
  assert.deepStrictEqual(chainStep(op, "select")[1], "user_id, messages");

  assert.deepStrictEqual(await store.claimTurn(fakeClient([{ data: [], error: null }]), TID, NOW), { claimed: false, reason: "not_queued" });
  assert.deepStrictEqual(await store.claimTurn(fakeClient([{ data: [{ user_id: UID, messages: "not an array" }], error: null }]), TID, NOW), { claimed: false, reason: "not_queued" });
  assert.deepStrictEqual(await store.claimTurn(fakeClient([{ data: null, error: { message: "boom" } }]), TID, NOW), { claimed: false, reason: "unavailable" });
  assert.deepStrictEqual(await store.claimTurn(fakeClient([{ __throw: "fetch failed" }]), TID, NOW), { claimed: false, reason: "unavailable" });
  const none = fakeClient([]);
  assert.deepStrictEqual(await store.claimTurn(none, "../etc", NOW), { claimed: false, reason: "bad_id" });
  assert.strictEqual(none.ops.length, 0, "a junk id never reaches the DB");
});

test("recordTurn is ONE update filtered on id AND status = running with the terminal state; a non-terminal kind is refused before the DB", async () => {
  const sb = fakeClient([{ data: [{ id: TID }], error: null }]);
  const outcome = { kind: "done", result: { content: [{ type: "text", text: "Two jobs." }], usage: { model_calls: 2, tool_calls: 1 }, truncated: false } };
  assert.deepStrictEqual(await store.recordTurn(sb, TID, outcome, NOW), { recorded: true });
  const op = sb.ops[0];
  assert.deepStrictEqual(chainStep(op, "update")[1], { status: "done", result: outcome.result, finished_at: "2026-09-17T22:00:00.000Z" });
  assert.deepStrictEqual(op.chain.filter((c) => c[0] === "eq").map((c) => c.slice(1)), [["id", TID], ["status", "running"]]);

  assert.deepStrictEqual(await store.recordTurn(fakeClient([{ data: [], error: null }]), TID, { kind: "failed" }, NOW), { recorded: false, reason: "not_running" });
  const failed = fakeClient([{ data: [{ id: TID }], error: null }]);
  await store.recordTurn(failed, TID, { kind: "failed" }, NOW);
  assert.strictEqual(chainStep(failed.ops[0], "update")[1].result, null, "a failed turn stores no result");
  for (const kind of ["queued", "running", "bogus", undefined]) {
    const none = fakeClient([]);
    assert.deepStrictEqual(await store.recordTurn(none, TID, { kind }, NOW), { recorded: false, reason: "bad_outcome" }, String(kind));
    assert.strictEqual(none.ops.length, 0);
  }
  assert.deepStrictEqual(await store.recordTurn(fakeClient([{ data: null, error: { message: "boom" } }]), TID, { kind: "done", result: {} }, NOW), { recorded: false, reason: "unavailable" });
});

test("abandonTurn moves a still-queued row to failed (id AND status = queued); a claimed or terminal row is left alone", async () => {
  const sb = fakeClient([{ data: [{ id: TID }], error: null }]);
  assert.deepStrictEqual(await store.abandonTurn(sb, TID, NOW), { abandoned: true });
  const op = sb.ops[0];
  assert.deepStrictEqual(chainStep(op, "update")[1], { status: "failed", finished_at: "2026-09-17T22:00:00.000Z" });
  assert.deepStrictEqual(op.chain.filter((c) => c[0] === "eq").map((c) => c.slice(1)), [["id", TID], ["status", "queued"]], "only a queued row, or a running turn's result would be overwritten");
  assert.deepStrictEqual(await store.abandonTurn(fakeClient([{ data: [], error: null }]), TID, NOW), { abandoned: false, reason: "not_queued" });
  assert.deepStrictEqual(await store.abandonTurn(fakeClient([{ data: null, error: { message: "boom" } }]), TID, NOW), { abandoned: false, reason: "unavailable" });
  const none = fakeClient([]);
  assert.deepStrictEqual(await store.abandonTurn(none, "nope", NOW), { abandoned: false, reason: "bad_id" });
  assert.strictEqual(none.ops.length, 0);
});

test("readTurn selects by id AND user_id (own rows only) and maps found / not_found / unavailable", async () => {
  const row = { status: "done", result: { content: [] }, created_at: "c", started_at: "s", finished_at: "f" };
  const sb = fakeClient([{ data: row, error: null }]);
  assert.deepStrictEqual(await store.readTurn(sb, TID, UID), { found: true, status: "done", result: { content: [] }, createdAt: "c", startedAt: "s", finishedAt: "f" });
  const op = sb.ops[0];
  assert.deepStrictEqual(chainStep(op, "select")[1], "status, result, created_at, started_at, finished_at");
  assert.deepStrictEqual(op.chain.filter((c) => c[0] === "eq").map((c) => c.slice(1)), [["id", TID], ["user_id", UID]], "scoped to the caller, or one admin reads another's turn");
  assert.ok(chainStep(op, "maybeSingle"));

  assert.deepStrictEqual(await store.readTurn(fakeClient([{ data: null, error: null }]), TID, UID), { found: false, reason: "not_found" });
  assert.deepStrictEqual(await store.readTurn(fakeClient([{ data: null, error: { message: "boom" } }]), TID, UID), { found: false, reason: "unavailable" });
  const none = fakeClient([]);
  assert.deepStrictEqual(await store.readTurn(none, "nope", UID), { found: false, reason: "bad_id" });
  assert.deepStrictEqual(await store.readTurn(none, TID, "nope"), { found: false, reason: "bad_identity" });
  assert.strictEqual(none.ops.length, 0);
});

test("pruneTurns deletes rows created more than an hour before now and reports the count", async () => {
  const sb = fakeClient([{ data: [{ id: "a" }, { id: "b" }], error: null }]);
  assert.deepStrictEqual(await store.pruneTurns(sb, NOW), { pruned: 2 });
  const op = sb.ops[0];
  assert.deepStrictEqual(chainNames(op), ["delete", "lt", "select"]);
  assert.deepStrictEqual(chainStep(op, "lt").slice(1), ["created_at", "2026-09-17T21:00:00.000Z"]);
  assert.strictEqual(store.RETENTION_MS, 60 * 60 * 1000);
  assert.deepStrictEqual(await store.pruneTurns(fakeClient([{ data: null, error: { message: "boom" } }]), NOW), { error: "unavailable" });
});

test("isUuid accepts the v4 shape only", () => {
  assert.strictEqual(store.isUuid(TID), true);
  for (const bad of ["", "x", TID + "1", TID.replace("-", ""), 42, null, undefined, "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE"]) assert.strictEqual(store.isUuid(bad), false, String(bad));
});

// --- integration: the claim race and the row semantics against real Postgres -------------------
// safe-smokes: uses its own synthetic user ids and deletes only those rows before and after.

const IT_SKIP = process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run";
const IT_USER = "00000000-0000-4000-8000-00000000d0d0";
const IT_OTHER = "00000000-0000-4000-8000-00000000d0d1";

function itClients() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must point at the local stack");
  return () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

test("[integration] claim race: ten independent clients, one queued row, exactly one claims; without the status filter every racer wins", { skip: IT_SKIP }, async () => {
  const mk = itClients();
  const admin = mk();
  const cleanup = async () => { await admin.from("operator_turns").delete().in("user_id", [IT_USER, IT_OTHER]); };
  await cleanup();
  try {
    const q = await store.enqueueTurn(admin, IT_USER, MSGS);
    assert.ok(q.id, JSON.stringify(q));

    // Ten Lambda instances race for the same row.
    const results = await Promise.all(Array.from({ length: 10 }, mk).map((c) => store.claimTurn(c, q.id, Date.now())));
    const won = results.filter((r) => r.claimed);
    assert.strictEqual(won.length, 1, "exactly one instance claims the row: " + JSON.stringify(results));
    assert.deepStrictEqual(won[0].messages, MSGS);
    assert.strictEqual(results.filter((r) => !r.claimed && r.reason === "not_queued").length, 9, "the other nine get a definite not_queued");

    // Negative control (the proof this test can fail): the SAME update without the status
    // filter, which is what a dropped `.eq("status", "queued")` would run. Every racer wins.
    const q2 = await store.enqueueTurn(admin, IT_USER, MSGS);
    const loose = await Promise.all(Array.from({ length: 10 }, mk).map((c) =>
      c.from("operator_turns").update({ status: "running", started_at: new Date().toISOString() }).eq("id", q2.id).select("user_id, messages")));
    assert.strictEqual(loose.filter((r) => !r.error && r.data.length === 1).length, 10, "without the status filter all ten 'claim' the row, so the filter is the guard");

    // Record once: the first terminal state stands.
    const done = { kind: "done", result: { content: [{ type: "text", text: "Two jobs." }], usage: { model_calls: 2, tool_calls: 1 }, truncated: false } };
    assert.deepStrictEqual(await store.recordTurn(mk(), q.id, done, Date.now()), { recorded: true });
    assert.deepStrictEqual(await store.recordTurn(mk(), q.id, { kind: "failed" }, Date.now()), { recorded: false, reason: "not_running" });

    // Own rows only: the owner reads it, another admin gets not_found.
    const mine = await store.readTurn(mk(), q.id, IT_USER);
    assert.strictEqual(mine.found, true);
    assert.strictEqual(mine.status, "done");
    assert.deepStrictEqual(mine.result, done.result);
    assert.ok(mine.startedAt && mine.finishedAt);
    assert.deepStrictEqual(await store.readTurn(mk(), q.id, IT_OTHER), { found: false, reason: "not_found" });

    // The prune: an hour-old row goes, a fresh one stays.
    const old = await admin.from("operator_turns").insert({ user_id: IT_OTHER, status: "done", messages: MSGS, created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }).select("id").single();
    assert.strictEqual(old.error, null, old.error && old.error.message);
    const pr = await store.pruneTurns(mk(), Date.now());
    assert.ok(pr.pruned >= 1, JSON.stringify(pr));
    const { data: left } = await admin.from("operator_turns").select("id, user_id").in("user_id", [IT_USER, IT_OTHER]);
    assert.ok(!left.some((r) => r.id === old.data.id), "the two-hour-old row was pruned");
    assert.ok(left.some((r) => r.id === q.id), "the fresh row stays");
  } finally {
    await cleanup();
  }
});
