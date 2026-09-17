// A5 / D-023 — handoff-lead retention purge (UK GDPR Art.5(1)(e)).
// Pure cutoff maths + the kind-guarded, age-bounded delete, driven by a chainable
// fake Supabase client (no network), matching the bookings-store.test.js style.

const { test } = require("node:test");
const assert = require("node:assert");

const {
  HANDOFF_LEAD_RETENTION_MONTHS,
  handoffLeadCutoffISO,
} = require("../shared/config/retention.js");
const { purgeHandoffLeads, runPurges } = require("../server/netlify/functions/purge-handoffs.js");

// A chainable, thenable fake. delete()/eq()/lt()/select() record onto `state`;
// awaiting anywhere resolves the planned {data,error}. `calls` captures the state
// so a test can assert the kind-guard and the created_at cutoff that were applied.
function fakeSupabase(plan = {}) {
  const calls = [];
  function builder(table) {
    const state = { table, op: "select", eq: [], lt: [] };
    const result = () => {
      calls.push(state);
      return plan.result || { data: [], error: null };
    };
    const b = {
      delete() { state.op = "delete"; return b; },
      select(cols) { state.select = cols; return b; },
      eq(c, v) { state.eq.push([c, v]); return b; },
      lt(c, v) { state.lt.push([c, v]); return b; },
      then(onF, onR) { return Promise.resolve().then(result).then(onF, onR); },
    };
    return b;
  }
  const client = { from(table) { return builder(table); }, _calls: calls };
  return client;
}

test("retention period is the publicly-committed 6 months", () => {
  // Pins the figure the privacy notice promises (D-023). A silent change here
  // would diverge from what customers were told, so it must trip a test.
  assert.strictEqual(HANDOFF_LEAD_RETENTION_MONTHS, 6);
});

test("handoffLeadCutoffISO subtracts the retention period (calendar months)", () => {
  const cutoff = handoffLeadCutoffISO(new Date("2026-06-19T10:00:00.000Z"));
  assert.strictEqual(cutoff, "2025-12-19T10:00:00.000Z");
});

test("handoffLeadCutoffISO rolls the year back across January", () => {
  const cutoff = handoffLeadCutoffISO(new Date("2026-02-15T00:00:00.000Z"));
  assert.strictEqual(cutoff, "2025-08-15T00:00:00.000Z");
});

test("purgeHandoffLeads deletes only kind=human_handoff older than the cutoff", async () => {
  const supabase = fakeSupabase({ result: { data: [{ id: "a" }, { id: "b" }], error: null } });
  const now = new Date("2026-06-19T10:00:00.000Z");
  const { deleted, cutoff } = await purgeHandoffLeads(supabase, now);

  assert.strictEqual(deleted, 2);
  assert.strictEqual(cutoff, "2025-12-19T10:00:00.000Z");

  const call = supabase._calls[0];
  assert.strictEqual(call.table, "messages");
  assert.strictEqual(call.op, "delete");
  // The hard kind-guard: a delete that is NOT scoped to human_handoff is a bug.
  assert.deepStrictEqual(call.eq, [["kind", "human_handoff"]]);
  // Age bound: created_at strictly before the cutoff (never current data).
  assert.deepStrictEqual(call.lt, [["created_at", "2025-12-19T10:00:00.000Z"]]);
  // select() so the deleted rows come back and can be counted.
  assert.strictEqual(call.select, "id");
});

test("purgeHandoffLeads reports zero when nothing is expired", async () => {
  const supabase = fakeSupabase({ result: { data: [], error: null } });
  const { deleted } = await purgeHandoffLeads(supabase, new Date("2026-06-19T10:00:00.000Z"));
  assert.strictEqual(deleted, 0);
});

test("purgeHandoffLeads throws on a DB error (so the handler fails loudly, not silently)", async () => {
  const supabase = fakeSupabase({ result: { data: null, error: { message: "boom" } } });
  await assert.rejects(
    () => purgeHandoffLeads(supabase, new Date("2026-06-19T10:00:00.000Z")),
    /boom/
  );
});

// D-045: the daily run also prunes operator_turns (created_at older than an hour). The
// fake answers the SAME planned result to both statements, so the second statement is
// pinned by its shape: a delete on operator_turns bounded on created_at, no kind guard.
test("runPurges prunes operator turns BEFORE the handoff leads (a handoff throw cannot skip it), and a prune failure does not fail the run", async () => {
  const supabase = fakeSupabase({ result: { data: [{ id: "a" }], error: null } });
  const lines = [];
  const out = await runPurges(supabase, new Date("2026-09-17T22:00:00.000Z"), (...a) => lines.push(a.join(" ")));
  assert.deepStrictEqual(out, { deleted: 1, turns: 1 });
  assert.strictEqual(supabase._calls.length, 2);
  const turns = supabase._calls[0];
  assert.strictEqual(turns.table, "operator_turns");
  assert.strictEqual(turns.op, "delete");
  assert.deepStrictEqual(turns.lt, [["created_at", "2026-09-17T21:00:00.000Z"]], "an hour before now");
  assert.deepStrictEqual(turns.eq, [], "no other filter: every stale turn goes, whatever its state");
  assert.ok(lines.some((l) => l === "purge-handoffs: pruned 1 operator turn(s) older than an hour"), lines.join(" | "));

  // A DB that fails both: the turns prune is logged as failed AND the handoff purge still
  // throws loudly (the regulated one), and the turns prune had already run first.
  const failing = fakeSupabase({ result: { data: null, error: { message: "boom" } } });
  const l1 = [];
  await assert.rejects(() => runPurges(failing, new Date("2026-09-17T22:00:00.000Z"), (...a) => l1.push(a.join(" "))), /boom/, "the handoff purge is the regulated one and still fails loudly");
  assert.strictEqual(failing._calls[0].table, "operator_turns", "the turns prune ran before the throw (GEMPRO: a handoff throw must not skip it)");
  assert.ok(l1.some((l) => l === "purge-handoffs: operator turns prune failed: unavailable"), l1.join(" | "));
  // Only the turns prune failing: logged, the handoff count returns, nothing throws.
  const mixed = { n: 0, from(table) { const b = fakeSupabase({ result: this.n++ === 0 ? { data: null, error: { message: "boom" } } : { data: [], error: null } }); return b.from(table); } };
  const l2 = [];
  const out2 = await runPurges(mixed, new Date("2026-09-17T22:00:00.000Z"), (...a) => l2.push(a.join(" ")));
  assert.deepStrictEqual(out2, { deleted: 0, turns: null });
  assert.ok(l2.some((l) => l === "purge-handoffs: operator turns prune failed: unavailable"), l2.join(" | "));
});
