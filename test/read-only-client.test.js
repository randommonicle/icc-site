// D-040 operator assistant — the read-only facade (readOnlyClient.js, Beta 4 slice 3).
// The addendum's acceptance test: "facade positive (real read chains) + negative
// (write/RPC/unknown rejected at every stage)". The fake below stands in for the
// supabase-js builder and RECORDS what reached it, so the negative tests can also prove
// that a refused call never touched the underlying client at all.

const { test } = require("node:test");
const assert = require("node:assert");
const util = require("node:util");
const { createReadOnlyClient, MAX_LIMIT } = require("../server/netlify/functions/readOnlyClient.js");

function fakeSupabase(response) {
  const log = [];
  function builder() {
    const b = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "limit", "insert", "update", "delete", "upsert", "neq", "in"]) {
      b[m] = (...args) => { log.push([m, ...args]); return b; };
    }
    b.then = (res, rej) => Promise.resolve(response).then(res, rej);
    return b;
  }
  return {
    log,
    from(t) { log.push(["from", t]); return builder(); },
    rpc(...a) { log.push(["rpc", ...a]); return Promise.resolve({ data: null, error: null }); },
    storage: { from() { log.push(["storage"]); } },
    auth: { getUser() { log.push(["auth"]); } },
  };
}

const ALLOW = {
  jobs: { cols: ["id", "slot_date", "status", "estimated_price_ex_vat", "deposit_status"] },
  invoices: { cols: ["id", "job_id", "status", "amount_ex_vat", "paid_at", "created_at"], rel: { jobs: { cols: ["slot_date", "deposit_ex_vat", "deposit_status"], rel: { customers: { cols: ["name"] } } } } },
  expenses: { cols: ["category", "amount", "incurred_on"] },
};

// --- positive: real read chains ------------------------------------------------

test("a full read chain reaches the client in order with the normalised projection and returns a fresh {data,error}", async () => {
  const rows = [{ id: "a", status: "paid", jobs: { slot_date: "2026-09-01", deposit_ex_vat: 24, deposit_status: "paid" } }];
  const sb = fakeSupabase({ data: rows, error: null, count: 1, status: 200 });
  const ro = createReadOnlyClient(sb, ALLOW);
  const res = await ro.from("invoices")
    .select(" id, status , jobs( slot_date, deposit_ex_vat , deposit_status ) ")
    .eq("status", "paid")
    .gte("paid_at", "2026-09-01T00:00:00Z")
    .lte("paid_at", "2026-09-30T23:59:59Z")
    .order("created_at", { ascending: false })
    .limit(10);
  assert.deepStrictEqual(sb.log, [
    ["from", "invoices"],
    ["select", "id,status,jobs(slot_date,deposit_ex_vat,deposit_status)"],
    ["eq", "status", "paid"],
    ["gte", "paid_at", "2026-09-01T00:00:00Z"],
    ["lte", "paid_at", "2026-09-30T23:59:59Z"],
    ["order", "created_at", { ascending: false }],
    ["limit", 10],
  ]);
  assert.deepStrictEqual(Object.keys(res), ["data", "error"], "nothing but data + error on the result");
  assert.deepStrictEqual(res, { data: rows, error: null });
});

test("filters may be applied in any order and repeated; order() without opts is ascending by PostgREST default", async () => {
  const sb = fakeSupabase({ data: [], error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  const res = await ro.from("expenses").select("category,amount").gte("incurred_on", "2026-09-01").lte("incurred_on", "2026-09-30").gte("amount", 1).order("incurred_on").limit(MAX_LIMIT);
  assert.deepStrictEqual(sb.log.slice(2), [
    ["gte", "incurred_on", "2026-09-01"], ["lte", "incurred_on", "2026-09-30"], ["gte", "amount", 1], ["order", "incurred_on"], ["limit", MAX_LIMIT],
  ]);
  assert.deepStrictEqual(res, { data: [], error: null });
});

test("a nested embed passes only where the allowlist spells out that depth (invoices -> jobs -> customers.name)", async () => {
  const sb = fakeSupabase({ data: [], error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  await ro.from("invoices").select("id,jobs(slot_date,customers(name))").limit(5);
  assert.deepStrictEqual(sb.log[1], ["select", "id,jobs(slot_date,customers(name))"]);
  // The same relation is NOT reachable from a table whose allowlist does not name it.
  rejects(() => ro.from("jobs").select("id,customers(name)"), /relation 'customers' is not allowlisted on jobs/);
});

test("a DB error comes back reduced to {code, message}; no details/hint/builder leak; data is null", async () => {
  const sb = fakeSupabase({ data: null, error: { code: "42P01", message: "relation missing", details: "internal", hint: "secret" } });
  const ro = createReadOnlyClient(sb, ALLOW);
  const res = await ro.from("jobs").select("id").limit(1);
  assert.deepStrictEqual(res, { data: null, error: { code: "42P01", message: "relation missing" } });
});

test("a non-array data payload never leaks through (defensive: only arrays or null)", async () => {
  const sb = fakeSupabase({ data: { sneaky: true }, error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  assert.deepStrictEqual(await ro.from("jobs").select("id").limit(1), { data: [], error: null });
});

test("each chain step is a new immutable object: branching from a shared prefix does not cross-contaminate", async () => {
  const sb = fakeSupabase({ data: [], error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  const base = ro.from("jobs").select("id,status");
  await base.eq("status", "booked").limit(5);
  await base.eq("status", "completed").limit(5);
  const eqs = sb.log.filter((e) => e[0] === "eq");
  assert.deepStrictEqual(eqs, [["eq", "status", "booked"], ["eq", "status", "completed"]]);
});

// --- negative: rejected at every stage, and the client is never touched ---------

function rejects(fn, re) {
  assert.throws(fn, (e) => e instanceof Error && /^readOnlyClient: /.test(e.message) && re.test(e.message), "expected " + re);
}

test("the root exposes only from(): rpc / storage / auth / insert / anything else throws, client untouched", () => {
  const sb = fakeSupabase({ data: [], error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  for (const p of ["rpc", "storage", "auth", "insert", "update", "delete", "upsert", "channel", "schema", "url", "headers", "select"]) {
    rejects(() => ro[p], new RegExp("'" + p + "' is not permitted"));
  }
  rejects(() => ro.from("customers"), /table 'customers' is not allowlisted/);
  rejects(() => ro.from("operator_rate"), /not allowlisted/);
  rejects(() => ro.from(), /not allowlisted/);
  assert.deepStrictEqual(sb.log, [], "nothing reached the client");
});

test("before select: only select() exists; writes, filters and await are all refused", () => {
  const sb = fakeSupabase({ data: [], error: null });
  const t = createReadOnlyClient(sb, ALLOW).from("jobs");
  for (const p of ["insert", "update", "delete", "upsert", "rpc", "eq", "limit", "then", "url"]) {
    rejects(() => t[p], new RegExp("'" + p + "' is not permitted"));
  }
  assert.deepStrictEqual(sb.log, []);
});

test("select(): '*', unknown columns, aliases, casts, hints, nesting and non-allowlisted relations are all refused", () => {
  const sb = fakeSupabase({ data: [], error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  const bad = [
    ["*", /bad column token/],
    ["", /explicit column list/],
    ["id,*", /bad column token/],
    ["id,customer_id", /'jobs.customer_id' is not allowlisted/],
    ["alias:id", /bad column token/],
    ["id::text", /bad column token/],
    ["id,jobs(slot_date)", /relation 'jobs' is not allowlisted on jobs/],
  ];
  for (const [proj, re] of bad) rejects(() => ro.from("jobs").select(proj), re);
  const badInv = [
    ["id,customers(name)", /relation 'customers' is not allowlisted/],
    ["id,jobs!inner(slot_date)", /bad relation token/],
    ["id,jobs(customers(email))", /'invoices.jobs.customers.email' is not allowlisted/],
    ["id,jobs(customers(name,notes))", /'invoices.jobs.customers.notes' is not allowlisted/],
    ["id,jobs(deposit_status,invoices(id))", /relation 'invoices' is not allowlisted on invoices.jobs/],
    ["id,jobs()", /explicit column list/],
    ["id,jobs(address)", /'invoices.jobs.address' is not allowlisted/],
    ["id,jobs(slot_date", /unbalanced/],
    ["id,jobs(*)", /bad column token/],
  ];
  for (const [proj, re] of badInv) rejects(() => ro.from("invoices").select(proj), re);
  assert.deepStrictEqual(sb.log, [], "a refused projection never reaches the client");
});

test("after select: writes, rpc, re-select, unknown methods throw; filters on non-allowlisted columns throw", () => {
  const sb = fakeSupabase({ data: [], error: null });
  const q = createReadOnlyClient(sb, ALLOW).from("jobs").select("id,status");
  for (const p of ["insert", "update", "delete", "upsert", "rpc", "select", "neq", "in", "like", "or", "csv", "single", "url"]) {
    rejects(() => q[p], new RegExp("'" + p + "' is not permitted"));
  }
  rejects(() => q.eq("customer_id", "x"), /eq\(\) column 'customer_id' is not allowlisted/);
  rejects(() => q.gte("address", "x"), /gte\(\) column 'address'/);
  rejects(() => q.order("notes"), /order\(\) column 'notes'/);
  rejects(() => q.eq("status = 'x' or 1=1", "y"), /is not allowlisted/);
  // Deeper in the chain the same holds.
  const deeper = q.eq("status", "booked").order("slot_date");
  for (const p of ["insert", "delete", "rpc"]) rejects(() => deeper[p], new RegExp("'" + p + "'"));
  assert.deepStrictEqual(sb.log, []);
});

test("limit(): must be an integer 1..MAX_LIMIT, and a query cannot run without one", async () => {
  const sb = fakeSupabase({ data: [], error: null });
  const q = createReadOnlyClient(sb, ALLOW).from("jobs").select("id");
  for (const n of [0, -1, 1.5, "10", null, undefined, MAX_LIMIT + 1, Infinity]) {
    rejects(() => q.limit(n), /limit must be an integer/);
  }
  await assert.rejects(async () => { await q; }, /a \.limit\(\) is required/);
  await assert.rejects(async () => { await q.eq("status", "booked"); }, /a \.limit\(\) is required/);
  assert.deepStrictEqual(sb.log, [], "an unbounded query never reaches the client");
});

test("the facade is immutable and introspection does not trip the guard", () => {
  const sb = fakeSupabase({ data: [], error: null });
  const ro = createReadOnlyClient(sb, ALLOW);
  const q = ro.from("jobs").select("id");
  rejects(() => { ro.from = () => {}; }, /immutable/);
  rejects(() => { q.eq = () => {}; }, /immutable/);
  assert.doesNotThrow(() => util.inspect(ro));
  assert.doesNotThrow(() => util.inspect(q));
  assert.doesNotThrow(() => JSON.stringify(q));
  assert.strictEqual(q[Symbol.toStringTag], undefined);
  assert.strictEqual("insert" in q, false);
  assert.strictEqual("eq" in q, true);
});

test("construction fails without a client or an allowlist", () => {
  rejects(() => createReadOnlyClient(null, ALLOW), /client with from\(\) is required/);
  rejects(() => createReadOnlyClient({}, ALLOW), /client with from\(\) is required/);
  rejects(() => createReadOnlyClient(fakeSupabase({}), null), /allowlist is required/);
});
