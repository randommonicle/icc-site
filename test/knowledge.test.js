// Knowledge single-source (D-006) — parity + L-009 guardrails.
//
// Slice 4a extracted the carpet-science and time-estimate prose out of the
// chat.js system prompt into shared/config/knowledge.js. The byte-identity of the
// ASSEMBLED prompt vs the pre-refactor original was proven once against git HEAD
// at build time (so the L-002 prompt-cache prefix is unchanged). These tests are
// the going-forward guards: the generated blocks stay wired into the prompt, the
// section structure holds, and the L-009 claims that bit us cannot silently
// return. When a fact legitimately changes, update knowledge.js deliberately
// (knowing it re-warms the L-002 cache, which is correct for a real change).

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

test("knowledge blocks are wired into the assembled system prompt", () => {
  assert.ok(
    chat.STATIC_SYSTEM_PROMPT.includes(knowledge.knowledgeBlock()),
    "carpet-science block missing from STATIC_SYSTEM_PROMPT"
  );
  assert.ok(
    chat.STATIC_SYSTEM_PROMPT.includes(knowledge.timeEstimatesBlock()),
    "time-estimates block missing from STATIC_SYSTEM_PROMPT"
  );
});

test("knowledgeBlock carries the six sections in prompt order", () => {
  const block = knowledge.knowledgeBlock();
  const headings = [
    "TEXATHERM SYSTEM:",
    "PRODUCTS AND CHEMICALS:",
    "CARPET TYPE AND METHOD:",
    "STAIN GUIDANCE:",
    "WHAT ICC WON'T DO:",
    "DIY vs PROFESSIONAL:",
  ];
  let pos = -1;
  for (const h of headings) {
    const i = block.indexOf(h);
    assert.ok(i > pos, `heading out of order or missing: ${h}`);
    pos = i;
  }
  assert.ok(block.startsWith("TEXATHERM SYSTEM:"));
  assert.ok(
    block.endsWith("For wool or natural fibres, DIY machines can cause permanent damage.")
  );
  // Sections are joined by exactly one blank line — never a doubled blank.
  assert.ok(!block.includes("\n\n\n"), "unexpected doubled blank line between sections");
});

test("L-009 guardrails: correct machine model, no refuted claims", () => {
  const block = knowledge.knowledgeBlock();
  assert.ok(block.includes("EMV 401"), "correct machine model (EMV 401) must be present");
  assert.ok(!block.includes("EMV 409"), "wrong machine model (EMV 409) must never appear");
  assert.ok(!/\d+\s*dB/i.test(block), "no decibel figure may be quoted");
  // The WoolSafe and decibel claims appear ONLY inside the instruction NOT to make
  // them — assert those prohibitions survive so a future edit can't quietly drop
  // the guardrails (L-009).
  assert.ok(
    block.includes('never call them "WoolSafe approved"'),
    "WoolSafe-approved prohibition must be present"
  );
  assert.ok(
    block.includes("never quote a noise or decibel figure"),
    "decibel prohibition must be present"
  );
});

test("assembled prompt carries no refuted machine model or decibel figure", () => {
  assert.ok(!chat.STATIC_SYSTEM_PROMPT.includes("EMV 409"));
  assert.ok(!/\d+\s*dB/i.test(chat.STATIC_SYSTEM_PROMPT));
});
