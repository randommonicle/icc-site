// Slice 5a (D-020) — the live escalation INSERT path. The Supabase client is a
// fake (no network), matching escalation.test.js's faked-model style, so these
// exercise the REAL handleEscalation / handleTool fail-open logic the live chat
// uses. A guarded integration test hits local Supabase when ICC_SUPABASE_IT=1
// (real services, no mocks — D-010) and self-skips otherwise.

const { test } = require("node:test");
const assert = require("node:assert");

const chat = require("../server/netlify/functions/chat.js");
const { handleEscalation, handleTool } = chat;
const { getSupabaseAdmin, _resetForTest } = require("../server/netlify/functions/supabaseClient.js");
const { escalationToMessageDraft } = require("../shared/messages.js");

// A fake Supabase client that records inserts. insertImpl lets a test force an
// { error } return or a throw to prove the handler fails open either way.
function fakeSupabase(insertImpl) {
  const calls = [];
  const client = {
    from(table) {
      return {
        insert: async (rows) => {
          calls.push({ table, rows });
          if (insertImpl) return insertImpl(rows);
          return { data: rows, error: null };
        },
      };
    },
  };
  client.calls = calls;
  return client;
}

const SAMPLE = {
  question: "Can I bleach a wool rug?",
  reason: "damage_risk",
  customer_name: "Sam",
  customer_contact: "sam@example.com",
};
const CTX = { messages: [{ role: "user", content: "Can I bleach a wool rug?" }] };

test("getSupabaseAdmin returns null when the env vars are absent", () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  _resetForTest();
  try {
    assert.strictEqual(getSupabaseAdmin(), null);
  } finally {
    if (url !== undefined) process.env.SUPABASE_URL = url;
    if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    _resetForTest();
  }
});

test("getSupabaseAdmin returns a client when both env vars are set", () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  _resetForTest();
  try {
    const client = getSupabaseAdmin();
    assert.ok(client && typeof client.from === "function");
  } finally {
    if (url !== undefined) process.env.SUPABASE_URL = url;
    else delete process.env.SUPABASE_URL;
    if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    _resetForTest();
  }
});

test("handleEscalation inserts the mapped human_handoff draft when a client is provided", async () => {
  const sb = fakeSupabase();
  const out = await handleEscalation(SAMPLE, CTX, null, sb);
  assert.match(out, /team/i);
  assert.strictEqual(sb.calls.length, 1);
  assert.strictEqual(sb.calls[0].table, "messages");
  // The row is exactly what the pure builder produces (single source, D-020).
  assert.deepStrictEqual(sb.calls[0].rows, escalationToMessageDraft(SAMPLE, CTX));
  assert.strictEqual(sb.calls[0].rows.kind, "human_handoff");
  assert.strictEqual(sb.calls[0].rows.status, "draft");
  assert.strictEqual(sb.calls[0].rows.customer_id, null);
  assert.match(sb.calls[0].rows.body, /bleach a wool rug/i);
});

test("handleEscalation returns guidance and does not throw when the insert returns an error", async () => {
  const sb = fakeSupabase(() => ({ data: null, error: { message: "duplicate key" } }));
  const out = await handleEscalation(SAMPLE, CTX, null, sb);
  assert.match(out, /Do not attempt to answer/i);
  assert.strictEqual(sb.calls.length, 1);
});

test("handleEscalation returns guidance and does not throw when the insert throws", async () => {
  const sb = fakeSupabase(() => { throw new Error("network down"); });
  const out = await handleEscalation(SAMPLE, CTX, null, sb);
  assert.match(out, /team/i);
});

test("handleEscalation skips the insert when no Supabase client is available", async () => {
  // null is the fail-open signal — email path unaffected, no throw, model still guided.
  const out = await handleEscalation(SAMPLE, CTX, null, null);
  assert.match(out, /team/i);
});

test("handleTool threads the Supabase client through to the escalation handler", async () => {
  const sb = fakeSupabase();
  const out = await handleTool({ name: "escalate_to_human", input: SAMPLE }, CTX, null, sb);
  assert.match(out, /team/i);
  assert.strictEqual(sb.calls.length, 1);
  assert.strictEqual(sb.calls[0].rows.kind, "human_handoff");
});

// --- Guarded integration test: real Supabase (D-010 real services, no mocks) ---
// Runs only when ICC_SUPABASE_IT=1 AND SUPABASE_URL/SERVICE_ROLE_KEY point at a
// reachable instance (the local Docker stack). Self-skips otherwise so the suite
// stays green on a machine without Docker. Inserts a real row, reads it back, and
// deletes it in a finally (safe-smokes: leave shared state exactly as found).
test("[integration] a real human_handoff row inserts against Supabase with null customer_id", {
  skip: process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run",
}, async () => {
  _resetForTest();
  const sb = getSupabaseAdmin();
  assert.ok(sb, "expected a Supabase client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  const draft = escalationToMessageDraft(
    { question: "[IT] integration probe", reason: "out_of_scope", customer_name: "IT", customer_contact: "n/a" },
    { messages: [] }
  );
  const { data, error } = await sb.from("messages").insert(draft).select();
  let id = null;
  try {
    assert.strictEqual(error, null, error && error.message);
    assert.strictEqual(data.length, 1);
    id = data[0].id;
    assert.strictEqual(data[0].customer_id, null);
    assert.strictEqual(data[0].kind, "human_handoff");
    assert.strictEqual(data[0].status, "draft");
  } finally {
    if (id) await sb.from("messages").delete().eq("id", id);
  }
});
