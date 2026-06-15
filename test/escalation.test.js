// D-019 human escalation (Slice 4b) — the server-side tool loop, the response
// normalizer, and the escalation handler. The model is faked (no network), so
// these exercise the real loop/normalizer/handler code paths the live chat uses.

const { test } = require("node:test");
const assert = require("node:assert");

const chat = require("../server/netlify/functions/chat.js");
const {
  runAssistantTurn,
  withSingleTextBlock,
  handleTool,
  handleEscalation,
  ESCALATION_TOOL,
} = chat;

// A fake model that returns scripted responses in order; the last one repeats.
function fakeModel(responses) {
  const fn = async (messages) => {
    fn.calls.push(messages);
    return responses[Math.min(fn.calls.length - 1, responses.length - 1)];
  };
  fn.calls = [];
  return fn;
}

test("ESCALATION_TOOL names the damage-risk trigger and requires question+reason", () => {
  assert.strictEqual(ESCALATION_TOOL.name, "escalate_to_human");
  assert.match(ESCALATION_TOOL.description, /damage/i);
  assert.deepStrictEqual(ESCALATION_TOOL.input_schema.required, ["question", "reason"]);
  assert.ok(ESCALATION_TOOL.input_schema.properties.reason.enum.includes("damage_risk"));
});

test("ESCALATION_TOOL question description forbids customer PII (input minimisation, GDPR Art.5(1)(c))", () => {
  // The captured question is the ONLY field later sent to the model when drafting a
  // reply (handoffs.js draftReplyForHandoff), so it must not invite name/contact.
  const desc = ESCALATION_TOOL.input_schema.properties.question.description;
  assert.match(desc, /do NOT include/i);
  assert.match(desc, /name/i);
  assert.match(desc, /email|phone|contact/i);
});

test("runAssistantTurn returns immediately when no tool is used", async () => {
  const end = { stop_reason: "end_turn", content: [{ type: "text", text: "Hello" }] };
  const model = fakeModel([end]);
  let toolCalls = 0;
  const data = await runAssistantTurn(
    [{ role: "user", content: "hi" }],
    model,
    async () => { toolCalls++; return "x"; }
  );
  assert.strictEqual(data, end);
  assert.strictEqual(model.calls.length, 1);
  assert.strictEqual(toolCalls, 0);
});

test("runAssistantTurn resolves one tool round and feeds the result back", async () => {
  const toolUse = {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "Let me get the team to check." },
      { type: "tool_use", id: "toolu_1", name: "escalate_to_human", input: { question: "?", reason: "damage_risk" } },
    ],
  };
  const final = { stop_reason: "end_turn", content: [{ type: "text", text: "The team will confirm." }] };
  const model = fakeModel([toolUse, final]);
  const handled = [];
  const data = await runAssistantTurn(
    [{ role: "user", content: "can I bleach my wool rug?" }],
    model,
    async (tu) => { handled.push(tu); return "logged"; }
  );
  assert.strictEqual(data, final);
  assert.strictEqual(model.calls.length, 2);
  assert.strictEqual(handled.length, 1);
  assert.strictEqual(handled[0].id, "toolu_1");

  // The second model call carries the assistant tool_use turn + the user tool_result.
  const lastTwo = model.calls[1].slice(-2);
  assert.strictEqual(lastTwo[0].role, "assistant");
  assert.strictEqual(lastTwo[1].role, "user");
  assert.strictEqual(lastTwo[1].content[0].type, "tool_result");
  assert.strictEqual(lastTwo[1].content[0].tool_use_id, "toolu_1");
  assert.strictEqual(lastTwo[1].content[0].content, "logged");
});

test("runAssistantTurn is bounded — a model stuck on tool_use cannot loop forever", async () => {
  const stuck = {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t", name: "escalate_to_human", input: {} }],
  };
  const model = fakeModel([stuck]); // always tool_use
  let toolCalls = 0;
  const data = await runAssistantTurn(
    [{ role: "user", content: "x" }],
    model,
    async () => { toolCalls++; return "ok"; },
    4
  );
  // initial call + 4 rounds = 5 model calls, then it stops
  assert.strictEqual(model.calls.length, 5);
  assert.strictEqual(toolCalls, 4);
  assert.strictEqual(data.stop_reason, "tool_use");
});

test("runAssistantTurn does not crash the turn if a tool handler throws", async () => {
  const toolUse = {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t1", name: "escalate_to_human", input: {} }],
  };
  const final = { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] };
  const model = fakeModel([toolUse, final]);
  const data = await runAssistantTurn(
    [{ role: "user", content: "x" }],
    model,
    async () => { throw new Error("boom"); }
  );
  assert.strictEqual(data, final);
  // a fallback tool_result was still sent on the second call
  const toolResult = model.calls[1].slice(-1)[0].content[0];
  assert.strictEqual(toolResult.type, "tool_result");
  assert.match(toolResult.content, /01242 279590/);
});

test("withSingleTextBlock drops tool_use and breaks the paragraph where it sat (Slice 4d contract)", () => {
  const out = withSingleTextBlock({
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "Part one. " },
      { type: "tool_use", id: "x", name: "escalate_to_human", input: {} },
      { type: "text", text: "Part two." },
    ],
  });
  assert.strictEqual(out.content.length, 1);
  assert.strictEqual(out.content[0].type, "text");
  // Since Slice 4d a dropped non-text block leaves a paragraph break so the
  // surrounding sentences never glue together (matters for web_search narration).
  assert.strictEqual(out.content[0].text, "Part one. \n\nPart two.");
});

test("withSingleTextBlock leaves a single text reply intact", () => {
  const msg = { stop_reason: "end_turn", content: [{ type: "text", text: "Just text" }] };
  assert.strictEqual(withSingleTextBlock(msg).content[0].text, "Just text");
});

test("withSingleTextBlock passes an API error object through untouched", () => {
  const err = { type: "error", error: { type: "overloaded_error", message: "busy" } };
  assert.strictEqual(withSingleTextBlock(err), err);
});

test("handleEscalation returns model guidance and does not throw without a Resend key", async () => {
  const out = await handleEscalation(
    { question: "Can I steam clean sisal?", reason: "damage_risk" },
    { messages: [] },
    null // no RESEND_API_KEY -> email skipped
  );
  assert.match(out, /team/i);
  assert.match(out, /Do not attempt to answer/i);
});

test("handleTool routes escalate_to_human and rejects unknown tools", async () => {
  const esc = await handleTool(
    { name: "escalate_to_human", input: { question: "q", reason: "out_of_scope" } },
    { messages: [] },
    null
  );
  assert.match(esc, /team/i);
  const unknown = await handleTool({ name: "nope", input: {} }, { messages: [] }, null);
  assert.match(unknown, /01242 279590/);
});
