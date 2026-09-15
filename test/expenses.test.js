// D-039 expenses endpoint (expenses.js). Fake Supabase (chainable) so these exercise the
// real REST routing, server-side validation (category enum, positive 2dp amount), the
// Postgres-error mapping (42P01 and PostgREST's PGRST205 -> 503 not-set-up, 23503 FK -> 400),
// and the period filter.

const { test } = require("node:test");
const assert = require("node:assert");

const exp = require("../server/netlify/functions/expenses.js");
const HEADERS = { "Content-Type": "application/json" };

// Chainable fake: records table/op/payload/filters; handler(state) returns {data,error}.
// select/insert/update terminate in .limit() (a real Promise); the delete chain (.delete()
// .eq()) is awaited directly, so the builder is thenable too.
function fakeSupabase(handler) {
  const calls = [];
  function builder(state) {
    const b = {
      select() { if (!state.op) state.op = "select"; return b; },
      insert(row) { state.op = "insert"; state.payload = row; return b; },
      update(patch) { state.op = "update"; state.payload = patch; return b; },
      delete() { state.op = "delete"; return b; },
      eq(col, val) { state.filters.push(["eq", col, val]); return b; },
      gte(col, val) { state.filters.push(["gte", col, val]); return b; },
      lte(col, val) { state.filters.push(["lte", col, val]); return b; },
      order() { return b; },
      limit() { calls.push(state); return Promise.resolve(handler(state) || { data: null, error: null }); },
      then(res) { calls.push(state); res(handler(state) || { data: null, error: null }); },
    };
    return b;
  }
  const sb = { from(table) { return builder({ table, op: null, payload: null, filters: [] }); } };
  sb.calls = calls;
  return sb;
}

function evt(method, o = {}) {
  return { httpMethod: method, body: o.body ? JSON.stringify(o.body) : undefined, queryStringParameters: o.qs || {} };
}
async function parse(res) { return { status: res.statusCode, body: JSON.parse(res.body) }; }

const OK = () => ({ data: [], error: null });
const VALID = { incurred_on: "2026-09-13", category: "fuel", amount: 42.5 };

test("POST 503s when Supabase is not configured", async () => {
  const res = await parse(await exp.handlePost(evt("POST", { body: VALID }), HEADERS, { supabase: null }));
  assert.strictEqual(res.status, 503);
});

test("POST create inserts a valid expense", async () => {
  const sb = fakeSupabase((s) => (s.op === "insert" ? { data: [{ id: "e1", ...s.payload }], error: null } : OK()));
  const res = await parse(await exp.handlePost(evt("POST", { body: VALID }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.expense.category, "fuel");
  assert.strictEqual(res.body.expense.amount, 42.5);
});

test("POST rejects an unknown category server-side (400, no DB hit)", async () => {
  let hit = false;
  const sb = fakeSupabase(() => { hit = true; return OK(); });
  const res = await parse(await exp.handlePost(evt("POST", { body: { ...VALID, category: "wine" } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /category/);
  assert.strictEqual(hit, false, "a bad category never reaches the database");
});

test("POST rejects a non-positive amount", async () => {
  const sb = fakeSupabase(OK);
  const res = await parse(await exp.handlePost(evt("POST", { body: { ...VALID, amount: 0 } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /amount/);
});

test("POST rounds the amount to 2dp server-side", async () => {
  const sb = fakeSupabase((s) => ({ data: [{ id: "e1", ...s.payload }], error: null }));
  const res = await parse(await exp.handlePost(evt("POST", { body: { ...VALID, amount: 10.129 } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.expense.amount, 10.13);
});

test("POST maps a missing table (42P01) to a clean 503, not a 500", async () => {
  const sb = fakeSupabase(() => ({ data: null, error: { code: "42P01", message: 'relation "expenses" does not exist' } }));
  const res = await parse(await exp.handlePost(evt("POST", { body: VALID }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 503);
  assert.match(res.body.error, /not set up yet/i);
});

test("GET maps PostgREST's PGRST205 (table not in its schema cache) to the same 503", async () => {
  // What the live seam actually emits for a never-created table (verified 2026-09-15 against
  // hosted, L-040): PostgREST answers PGRST205 itself and Postgres is never asked, so a
  // mapping that only knows 42P01 500s. The admin panel's first call is this GET.
  const sb = fakeSupabase(() => ({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.expenses' in the schema cache" } }));
  const res = await parse(await exp.handleGet(evt("GET"), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 503);
  assert.match(res.body.error, /not set up yet/i);
});

test("POST maps a bad job_id FK (23503) to a 400", async () => {
  const sb = fakeSupabase(() => ({ data: null, error: { code: "23503", message: "foreign key violation" } }));
  const res = await parse(await exp.handlePost(evt("POST", { body: { ...VALID, job_id: "nope" } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /job/i);
});

test("GET lists expenses, and a from/to period filters incurred_on inclusively", async () => {
  const sb = fakeSupabase((s) => ({ data: [{ id: "e1" }], error: null }));
  const res = await parse(await exp.handleGet(evt("GET", { qs: { from: "2026-09-01", to: "2026-09-30" } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.expenses.length, 1);
  const filters = sb.calls[0].filters;
  assert.ok(filters.some((f) => f[0] === "gte" && f[1] === "incurred_on" && f[2] === "2026-09-01"), "lower bound inclusive");
  assert.ok(filters.some((f) => f[0] === "lte" && f[1] === "incurred_on" && f[2] === "2026-09-30"), "upper bound inclusive");
});

test("GET rejects a half-specified period (only from) with 400", async () => {
  const sb = fakeSupabase(OK);
  const res = await parse(await exp.handleGet(evt("GET", { qs: { from: "2026-09-01" } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 400);
});

test("PATCH updates an existing expense", async () => {
  const sb = fakeSupabase((s) => (s.op === "update" ? { data: [{ id: "e1", ...s.payload }], error: null } : OK()));
  const res = await parse(await exp.handlePatch(evt("PATCH", { body: { id: "e1", amount: 99 } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.expense.amount, 99);
});

test("PATCH 404s when the expense does not exist", async () => {
  const sb = fakeSupabase(() => ({ data: [], error: null }));
  const res = await parse(await exp.handlePatch(evt("PATCH", { body: { id: "gone", amount: 5 } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 404);
});

test("PATCH 400s with no id", async () => {
  const sb = fakeSupabase(OK);
  const res = await parse(await exp.handlePatch(evt("PATCH", { body: { amount: 5 } }), HEADERS, { supabase: sb }));
  assert.strictEqual(res.status, 400);
});

test("DELETE removes by id, and 400s with no id", async () => {
  const sb = fakeSupabase(() => ({ data: null, error: null }));
  const ok = await parse(await exp.handleDelete(evt("DELETE", { qs: { id: "e1" } }), HEADERS, { supabase: sb }));
  assert.strictEqual(ok.status, 200);
  const bad = await parse(await exp.handleDelete(evt("DELETE", {}), HEADERS, { supabase: sb }));
  assert.strictEqual(bad.status, 400);
});
