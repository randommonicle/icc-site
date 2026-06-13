// Phase 2, Slice 4e (D-020) — unit tests for the escalation -> messages draft.
// Pure logic from shared/messages.js: no DB, no network. The schema side (the
// human_handoff enum + customer-optional constraint) is proved by pgTAP in
// supabase/tests/messages_handoff_test.sql.

const { test } = require("node:test");
const assert = require("node:assert");
const { escalationToMessageDraft, HANDOFF_REASON_LABELS } = require("../shared/messages.js");

test("escalationToMessageDraft: builds a draft human_handoff with no customer", () => {
  const row = escalationToMessageDraft(
    { question: "Can I bleach my wool rug?", reason: "damage_risk", customer_name: "Jo", customer_contact: "07000 000000" },
    { messages: [{ role: "user", content: "Can I bleach my wool rug?" }] }
  );
  assert.strictEqual(row.kind, "human_handoff");
  assert.strictEqual(row.status, "draft");
  assert.strictEqual(row.ai_drafted, true);
  assert.strictEqual(row.requires_consent, false);
  assert.strictEqual(row.customer_id, null);
  assert.match(row.subject, /handoff/i);
  assert.match(row.body, /Possible damage risk/);
  assert.match(row.body, /Customer name: Jo/);
  assert.match(row.body, /Contact: 07000 000000/);
  assert.match(row.body, /bleach my wool rug/);
});

test("escalationToMessageDraft: includes a transcript and fills missing contact fields", () => {
  const row = escalationToMessageDraft(
    { question: "Q", reason: "out_of_scope" },
    { messages: [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ] }
  );
  assert.match(row.body, /Recent conversation:/);
  assert.match(row.body, /Customer: first/);     // transcript line
  assert.match(row.body, /Assistant: second/);
  assert.match(row.body, /Customer name: not given/);
  assert.match(row.body, /Contact: not given/);
});

test("escalationToMessageDraft: tolerates an unknown reason and missing fields", () => {
  const row = escalationToMessageDraft({ reason: "weird_thing" }, {});
  assert.strictEqual(row.kind, "human_handoff");
  assert.match(row.subject, /weird_thing/);       // unknown reason passed through, not dropped
  assert.match(row.body, /\(none captured\)/);    // missing question
  assert.doesNotThrow(() => escalationToMessageDraft(undefined, undefined));
});

test("escalationToMessageDraft: reads text out of block-array (image-turn) content", () => {
  const row = escalationToMessageDraft(
    { question: "Q", reason: "no_citable_source" },
    { messages: [{ role: "user", content: [{ type: "text", text: "hello" }, { type: "image" }] }] }
  );
  assert.match(row.body, /Customer: hello/);
});

test("HANDOFF_REASON_LABELS covers every escalate_to_human reason", () => {
  for (const r of ["out_of_scope", "damage_risk", "no_citable_source", "customer_request"]) {
    assert.ok(HANDOFF_REASON_LABELS[r], `label for ${r}`);
  }
});
