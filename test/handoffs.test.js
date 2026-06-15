// Slice 5e / 5e-2 (D-020) — the admin handoff read + the draft/send lifecycle.
// fetchHandoffs and the POST dispatcher are tested with fake clients and injected
// draft/send functions (no network), matching the 5a test style; a guarded
// integration test exercises a real local-Supabase row when ICC_SUPABASE_IT=1.

const { test } = require("node:test");
const assert = require("node:assert");

const { fetchHandoffs, handler, handlePost, updateHandoff, loadHandoffRow } = require("../server/netlify/functions/handoffs.js");
const { getSupabaseAdmin, _resetForTest } = require("../server/netlify/functions/supabaseClient.js");
const { escalationToMessageDraft } = require("../shared/messages.js");

const headers = { "Content-Type": "application/json" };
function post(bodyObj) {
  return { httpMethod: "POST", headers: {}, body: JSON.stringify(bodyObj) };
}

// Fake whose select chain resolves to a fixed { data, error } (GET-side tests).
function fakeSupabase(result) {
  const q = {
    select() { return q; },
    eq() { return q; },
    order() { return q; },
    limit() { return Promise.resolve(result); },
  };
  return { from() { return q; } };
}

// Richer fake for the POST dispatcher: supports the read chain
// (select.eq.eq.limit) and the update chain (update.eq.eq, awaited). It records
// every update payload so a test can assert what was written.
function fakeDb(row) {
  const calls = { updates: [] };
  const chain = {
    select() { return chain; },
    order() { return chain; },
    eq() { return chain; },
    limit() { return Promise.resolve({ data: row ? [row] : [], error: null }); },
    update(fields) { calls.updates.push(fields); return chain; },
    then(resolve) { resolve({ data: row ? [row] : [], error: null }); }, // makes `await chain` work
  };
  return { client: { from() { return chain; } }, calls };
}

// --- GET / fetchHandoffs (Slice 5e) -----------------------------------------

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

test("handler: OPTIONS is 200 (pre-auth); POST without auth is 401; unsupported method is 405", async () => {
  const prev = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = "test-secret";
  try {
    assert.strictEqual((await handler({ httpMethod: "OPTIONS", headers: {} })).statusCode, 200);
    assert.strictEqual((await handler({ httpMethod: "POST", headers: {}, body: "{}" })).statusCode, 401);
    assert.strictEqual((await handler({ httpMethod: "DELETE", headers: { authorization: "Bearer test-secret" } })).statusCode, 405);
  } finally {
    if (prev !== undefined) process.env.ADMIN_SECRET = prev; else delete process.env.ADMIN_SECRET;
  }
});

// --- POST dispatcher (Slice 5e-2) -------------------------------------------

test("handlePost: 503 when Supabase is not configured", async () => {
  const res = await handlePost(post({ action: "draft", id: "x" }), headers, { supabase: null });
  assert.strictEqual(res.statusCode, 503);
});

test("handlePost: 400 on a missing id", async () => {
  const { client } = fakeDb(null);
  assert.strictEqual((await handlePost(post({ action: "draft" }), headers, { supabase: client })).statusCode, 400);
});

test("handlePost: 404 when the handoff row is not found", async () => {
  const { client } = fakeDb(null);
  assert.strictEqual((await handlePost(post({ action: "handle", id: "missing" }), headers, { supabase: client })).statusCode, 404);
});

test("handlePost draft: damage_risk is NEVER auto-drafted (D-020) and the model is not called", async () => {
  const { client, calls } = fakeDb({ id: "1", status: "draft", handoff_reason: "damage_risk", handoff_question: "Can I bleach my wool rug?" });
  let drafted = 0;
  const res = await handlePost(post({ action: "draft", id: "1" }), headers, {
    supabase: client, anthropicKey: "k", draftFn: async () => { drafted++; return "x"; },
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(drafted, 0, "the model must not be called for a damage_risk handoff");
  assert.strictEqual(calls.updates.length, 0);
});

test("handlePost draft: customer_request is not draftable either (they asked for a person)", async () => {
  const { client } = fakeDb({ id: "1", status: "draft", handoff_reason: "customer_request", handoff_question: "Q" });
  let drafted = 0;
  const res = await handlePost(post({ action: "draft", id: "1" }), headers, {
    supabase: client, anthropicKey: "k", draftFn: async () => { drafted++; return "x"; },
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(drafted, 0);
});

test("handlePost draft: a soft reason drafts, stores it, and sends ONLY the question to the model", async () => {
  const { client, calls } = fakeDb({
    id: "1", status: "draft", handoff_reason: "out_of_scope",
    handoff_question: "Where can I recycle an old rug?",
    customer_contact: "jane@x.com", body: "Reason...\nContact: jane@x.com\nQuestion: ...",
  });
  let seenQuestion = null;
  const res = await handlePost(post({ action: "draft", id: "1" }), headers, {
    supabase: client, anthropicKey: "k",
    draftFn: async (q) => { seenQuestion = q; return "Here is a suggested reply."; },
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(JSON.parse(res.body).draft, "Here is a suggested reply.");
  assert.strictEqual(seenQuestion, "Where can I recycle an old rug?"); // only the question, no name/contact/transcript
  assert.deepStrictEqual(calls.updates.at(-1), { draft_reply: "Here is a suggested reply." });
});

test("handlePost draft: 502 when no Anthropic key is configured", async () => {
  const { client } = fakeDb({ id: "1", status: "draft", handoff_reason: "out_of_scope", handoff_question: "Q" });
  assert.strictEqual((await handlePost(post({ action: "draft", id: "1" }), headers, { supabase: client, anthropicKey: "" })).statusCode, 502);
});

test("handlePost draft: fail-closed (502, nothing stored) when the model call throws", async () => {
  const { client, calls } = fakeDb({ id: "1", status: "draft", handoff_reason: "out_of_scope", handoff_question: "Q" });
  const res = await handlePost(post({ action: "draft", id: "1" }), headers, {
    supabase: client, anthropicKey: "k", draftFn: async () => { throw new Error("boom"); },
  });
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(calls.updates.length, 0);
});

test("handlePost send: requires a real email, else 400 and nothing sent", async () => {
  const { client } = fakeDb({ id: "1", status: "draft", customer_contact: "call me on 07700 900000" });
  let sent = 0;
  const res = await handlePost(post({ action: "send", id: "1", reply: "Hello" }), headers, {
    supabase: client, resendKey: "k", sendFn: async () => { sent++; },
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(sent, 0);
});

test("handlePost send: an empty reply is rejected", async () => {
  const { client } = fakeDb({ id: "1", status: "draft", customer_contact: "jane@x.com" });
  assert.strictEqual((await handlePost(post({ action: "send", id: "1", reply: "   " }), headers, { supabase: client, resendKey: "k", sendFn: async () => {} })).statusCode, 400);
});

test("handlePost send: emails the customer, then marks the row sent", async () => {
  const { client, calls } = fakeDb({ id: "1", status: "draft", handoff_reason: "out_of_scope", customer_contact: "Email jane@x.com please" });
  const seen = {};
  const res = await handlePost(post({ action: "send", id: "1", reply: "Your answer." }), headers, {
    supabase: client, resendKey: "k",
    sendFn: async (to, reply) => { seen.to = to; seen.reply = reply; },
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(seen.to, "jane@x.com");
  assert.strictEqual(seen.reply, "Your answer.");
  const last = calls.updates.at(-1);
  assert.strictEqual(last.status, "sent");
  assert.strictEqual(last.draft_reply, "Your answer.");
  assert.ok(last.sent_at, "sent_at is stamped");
});

test("handlePost send: a send failure does NOT mark the row sent (fail-closed)", async () => {
  const { client, calls } = fakeDb({ id: "1", status: "draft", customer_contact: "jane@x.com" });
  const res = await handlePost(post({ action: "send", id: "1", reply: "x" }), headers, {
    supabase: client, resendKey: "k", sendFn: async () => { throw new Error("resend down"); },
  });
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(calls.updates.length, 0, "no status change when the email did not go");
});

test("handlePost: an already-sent handoff is 409 (no re-send)", async () => {
  const { client } = fakeDb({ id: "1", status: "sent", customer_contact: "jane@x.com" });
  assert.strictEqual((await handlePost(post({ action: "send", id: "1", reply: "x" }), headers, { supabase: client, resendKey: "k", sendFn: async () => {} })).statusCode, 409);
});

test("handlePost handle: marks the handoff approved (the manual path, incl. damage_risk)", async () => {
  const { client, calls } = fakeDb({ id: "1", status: "draft", handoff_reason: "damage_risk" });
  const res = await handlePost(post({ action: "handle", id: "1" }), headers, { supabase: client });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.updates.at(-1).status, "approved");
  assert.ok(calls.updates.at(-1).approved_at);
});

test("handlePost: an unknown action is 400", async () => {
  const { client } = fakeDb({ id: "1", status: "draft" });
  assert.strictEqual((await handlePost(post({ action: "frobnicate", id: "1" }), headers, { supabase: client })).statusCode, 400);
});

// --- Guarded integration: real local Supabase -------------------------------
// Insert a handoff, read it back, approve it via updateHandoff, confirm the
// status persisted, then delete (safe-smokes: leave state as found).
test("[integration] handoff round-trips through local Supabase (insert, read, approve, delete)", {
  skip: process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run",
}, async () => {
  _resetForTest();
  const sb = getSupabaseAdmin();
  assert.ok(sb, "expected a Supabase client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  const draft = escalationToMessageDraft(
    { question: "[5e2-IT] probe", reason: "out_of_scope", customer_name: "IT", customer_contact: "it@example.com" },
    { messages: [] }
  );
  const { data, error } = await sb.from("messages").insert(draft).select();
  const id = data && data[0] && data[0].id;
  try {
    assert.strictEqual(error, null, error && error.message);
    const row = await loadHandoffRow(sb, id);
    assert.ok(row, "the inserted handoff should load");
    assert.strictEqual(row.handoff_reason, "out_of_scope");
    assert.strictEqual(row.customer_contact, "it@example.com");
    await updateHandoff(sb, id, { status: "approved", approved_at: new Date().toISOString() });
    const after = await loadHandoffRow(sb, id);
    assert.strictEqual(after.status, "approved");
  } finally {
    if (id) await sb.from("messages").delete().eq("id", id);
  }
});
