// The scheduled Supabase keep-alive read (pre-launch anti-auto-pause). Exercised
// with a fake client (no network): it issues exactly one bounded read and
// surfaces a read error rather than falsely reporting success.

const { test } = require("node:test");
const assert = require("node:assert");

const { pingSupabase } = require("../server/netlify/functions/supabase-keepalive.js");

// Fake recording the query it received and returning a fixed { data, error }.
function fakeSupabase(result) {
  const calls = { table: null, selected: null, limited: null };
  const chain = {
    select(cols) { calls.selected = cols; return chain; },
    limit(n) { calls.limited = n; return Promise.resolve(result); },
  };
  return { client: { from(t) { calls.table = t; return chain; } }, calls };
}

test("pingSupabase issues one bounded read against jobs", async () => {
  const fake = fakeSupabase({ data: [{ id: "x" }], error: null });
  const out = await pingSupabase(fake.client);
  assert.deepEqual(out, { ok: true });
  assert.equal(fake.calls.table, "jobs");
  assert.equal(fake.calls.selected, "id");
  assert.equal(fake.calls.limited, 1);
});

test("pingSupabase throws on a read error (a broken project is not 'kept alive')", async () => {
  const fake = fakeSupabase({ data: null, error: { message: "connection refused" } });
  await assert.rejects(() => pingSupabase(fake.client), /connection refused/);
});
