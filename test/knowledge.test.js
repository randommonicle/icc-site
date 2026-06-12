// Knowledge single-source (D-006) — restructure parity + L-009 guardrails.
//
// Slice 4a extracted the carpet-science prose out of the chat.js system prompt into
// shared/config/knowledge.js. Slice 4c (D-019 Citations) then split that source in
// two: the factual `knowledgeSections` now feed a CITEABLE document (built by
// knowledgeDocument(), passed to the Claude API by chat.js), while the L-009 CLAIM
// RULES became a SYSTEM-PROMPT instruction block (guardrailsBlock()) — because a
// safety rule buried in a citeable document can be quoted but not relied on to
// constrain the model. These tests guard that split: the guardrails are wired into
// the prompt and the facts are not; the document round-trips one block per section;
// and the L-009 claims that bit us cannot silently return.

const { test } = require("node:test");
const assert = require("node:assert");

const knowledge = require("../shared/config/knowledge.js");
const chat = require("../server/netlify/functions/chat.js");

test("timeEstimatesBlock is byte-identical to the frozen reference", () => {
  const frozen = `TIME ESTIMATES - MINIMUM ONE HOUR PER ROOM:
Always advise customers that each average-sized room requires a minimum of one hour, including set-up time.
Texatherm low-moisture: 30-45 minutes cleaning + 15-20 minutes set-up = approximately 1 hour per room minimum.
Wet extraction: 45-60 minutes cleaning + set-up = approximately 1 hour per room minimum.
Stairs and landings: 30-45 minutes.
A typical 3-bedroom house (lounge, 3 bedrooms, hallway, stairs) should be estimated at 5-6 hours total.
When calculating slot requirements, always round up to the nearest hour and add 1 hour buffer for travel and set-up.`;
  assert.strictEqual(knowledge.timeEstimatesBlock(), frozen);
});

test("Slice 4c restructure: guardrails + time estimates are in the prompt, facts are NOT", () => {
  // The guardrail/grounding rules and the operational time estimates stay inline.
  assert.ok(
    chat.STATIC_SYSTEM_PROMPT.includes(knowledge.guardrailsBlock()),
    "guardrails block missing from STATIC_SYSTEM_PROMPT"
  );
  assert.ok(
    chat.STATIC_SYSTEM_PROMPT.includes(knowledge.timeEstimatesBlock()),
    "time-estimates block missing from STATIC_SYSTEM_PROMPT"
  );
  // The carpet-science facts have MOVED to the citeable document — they must no
  // longer be concatenated into the system prompt (that was the whole point of 4c).
  assert.ok(
    !chat.STATIC_SYSTEM_PROMPT.includes(knowledge.knowledgeBlock()),
    "carpet-science facts must NOT be inline in the prompt after the 4c restructure"
  );
});

test("knowledgeSections carry the six sections in teaching order", () => {
  const ids = knowledge.knowledgeSections.map((s) => s.id);
  assert.deepStrictEqual(ids, [
    "texatherm_system",
    "products_and_chemicals",
    "carpet_type_and_method",
    "stain_guidance",
    "what_icc_wont_do",
    "diy_vs_professional",
  ]);
  const block = knowledge.knowledgeBlock();
  assert.ok(block.startsWith("TEXATHERM SYSTEM:"));
  assert.ok(
    block.endsWith("For wool or natural fibres, these machines can cause permanent damage.")
  );
  assert.ok(!block.includes("\n\n\n"), "unexpected doubled blank line between sections");
});

test("DIY vs professional covers rented machines without naming a brand (Mark, June 2026)", () => {
  // Mark: a large share of corrective jobs are DIY/rental-machine damage, including
  // machines hired from supermarkets/DIY stores — but we must NOT name the brand.
  const block = knowledge.knowledgeBlock();
  assert.ok(/rent|hire/i.test(block), "must cover rented/hire machines, not only home DIY");
  assert.ok(!/rug\s*doctor/i.test(block), "must never name a specific rental brand");
});

test("guardrailsBlock carries every L-009 claim rule as an instruction", () => {
  const g = knowledge.guardrailsBlock();
  assert.ok(g.includes("EMV 401"), "correct machine model (EMV 401) must be stated");
  assert.ok(!g.includes("EMV 409"), "wrong machine model (EMV 409) must never appear");
  assert.ok(
    g.includes('never call them "WoolSafe approved"'),
    "WoolSafe-approved prohibition must be present"
  );
  assert.ok(g.includes("decibel"), "decibel prohibition must be present");
  assert.ok(g.includes("exothermic"), "exothermic prohibition must be present");
  assert.ok(g.includes('"kills 99.9%"'), "kills-99.9% prohibition must be present");
  // The grounding + escalation directive (the citations half of D-019) is here too.
  assert.ok(g.includes("escalate_to_human"), "grounding/escalation directive must be present");
});

test("the citeable facts contain no refuted claim and no relocated rule wording", () => {
  const block = knowledge.knowledgeBlock();
  assert.ok(block.includes("EMV 401"), "correct machine model (EMV 401) must be present in the facts");
  assert.ok(!block.includes("EMV 409"), "wrong machine model (EMV 409) must never appear");
  assert.ok(!/\d+\s*dB/i.test(block), "no decibel figure may be quoted");
  // The rule wording moved to guardrailsBlock(); the document must be pure fact, so
  // the prohibitions must NOT appear in the citeable text (else they could be cited
  // as if they were reference claims rather than enforced as rules).
  assert.ok(!block.includes("WoolSafe"), "WoolSafe wording must not be in the citeable facts");
  assert.ok(!block.includes("decibel"), "decibel wording must not be in the citeable facts");
  assert.ok(!block.includes("exothermic"), "exothermic wording must not be in the citeable facts");
});

test("knowledgeDocument() is a citeable custom-content document, one block per section", () => {
  const doc = knowledge.knowledgeDocument();
  assert.strictEqual(doc.type, "document");
  assert.strictEqual(doc.source.type, "content");
  assert.strictEqual(doc.citations.enabled, true);
  assert.strictEqual(doc.cache_control.type, "ephemeral", "document must be cache_control'd (L-002)");
  assert.ok(typeof doc.title === "string" && doc.title.length > 0, "document needs a title");
  // One content block per section, in order, so a citation's block index maps back.
  assert.strictEqual(doc.source.content.length, knowledge.knowledgeSections.length);
  doc.source.content.forEach((blk, i) => {
    assert.strictEqual(blk.type, "text");
    assert.strictEqual(blk.text, knowledge.knowledgeSections[i].text);
  });
});

test("assembled prompt carries no refuted machine model or decibel figure", () => {
  assert.ok(!chat.STATIC_SYSTEM_PROMPT.includes("EMV 409"));
  assert.ok(!/\d+\s*dB/i.test(chat.STATIC_SYSTEM_PROMPT));
});
