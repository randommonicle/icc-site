// Slice 5e (D-020) — the admin handoff read. fetchHandoffs is tested with a fake
// Supabase client (no network), matching the 5a test style; a guarded integration
// test reads a real row from local Supabase when ICC_SUPABASE_IT=1.

const { test } = require("node:test");
const assert = require("node:assert");

const { fetchHandoffs, handler } = require("../server/netlify/functions/handoffs.js");
const { getSupabaseAdmin, _resetForTest } = require("../server/netlify/functions/supabaseClient.js");
const { escalationToMessageDraft } = require("../shared/messages.js");

// Fake client whose select chain resolves to a fixed { data, error } result.
function fakeSupabase(result) {
  const q = {
    select() { return q; },
    eq() { return q; },
    order() { return q; },
    limit() { return Promise.resolve(result); },
  };
  return { from() { return q; } };
}

test("fetchHandoffs returns mapped rows when the client returns messages", async () => {
  const rows = [{ id: "1", created_at: "2026-06-14T00:00:00Z", subject: "Website handoff: damage", body: "Reason: ...", status: "draft", channel: "email" }];
  const out = await fetchHandoffs(fakeSupabase({ data: rows, error: null }));
  assert.strictEqual(out.configured, true);
  assert.strictEqual(out.total, 1);
  assert.strictEqual(out.handoffs[0].subject, "Website handoff: damage");
});

test("fetchHandoffs returns configured:false and empty when supabase is null", async () => {
  assert.deepStrictEqual(await fetchHandoffs(null), { handoffs: [], total: 0, configured: false });
});

test("fetchHandoffs throws on a query error (handler maps it to 500)", async () => {
  await assert.rejects(() => fetchHandoffs(fakeSupabase({ data: null, error: { message: "boom" } })), /boom/);
});

test("handler returns 401 without a valid admin Bearer (rejects before touching Supabase)", async () => {
  const prev = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = "test-secret";
  try {
    const res = await handler({ httpMethod: "GET", headers: { authorization: "Bearer wrong" } });
    assert.strictEqual(res.statusCode, 401);
  } finally {
    if (prev !== undefined) process.env.ADMIN_SECRET = prev; else delete process.env.ADMIN_SECRET;
  }
});

test("handler handles OPTIONS (200) and non-GET (405) before auth", async () => {
  assert.strictEqual((await handler({ httpMethod: "OPTIONS", headers: {} })).statusCode, 200);
  assert.strictEqual((await handler({ httpMethod: "POST", headers: {} })).statusCode, 405);
});

// Guarded integration: real local Supabase. Insert a handoff, read it back via
// fetchHandoffs, assert present, delete it (safe-smokes: leave state as found).
test("[integration] fetchHandoffs reads a real human_handoff row from local Supabase", {
  skip: process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run",
}, async () => {
  _resetForTest();
  const sb = getSupabaseAdmin();
  assert.ok(sb, "expected a Supabase client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  const draft = escalationToMessageDraft(
    { question: "[5e-IT] probe", reason: "out_of_scope", customer_name: "IT", customer_contact: "n/a" },
    { messages: [] }
  );
  const { data, error } = await sb.from("messages").insert(draft).select();
  const id = data && data[0] && data[0].id;
  try {
    assert.strictEqual(error, null, error && error.message);
    const out = await fetchHandoffs(sb);
    assert.strictEqual(out.configured, true);
    assert.ok(out.handoffs.some((h) => h.id === id), "the inserted handoff should appear in the queue");
  } finally {
    if (id) await sb.from("messages").delete().eq("id", id);
  }
});
