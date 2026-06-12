// D-019 Citations grounding (Slice 4c) — the server-side document injection and
// citation resolution. The Anthropic response is faked (no network), so these
// exercise the real withKnowledgeDocument / collectCitations code paths the live
// chat uses. The browser-side rendering (renderCitations in index.html) is verified
// separately on a deploy preview (L-003-safe DOM, L-014 single-text contract).

const { test } = require("node:test");
const assert = require("node:assert");

const knowledge = require("../shared/config/knowledge.js");
const chat = require("../server/netlify/functions/chat.js");
const { withKnowledgeDocument, collectCitations } = chat;

test("withKnowledgeDocument prepends the citeable document to a string first turn", () => {
  const messages = [{ role: "user", content: "Can you clean a wool rug?" }];
  const out = withKnowledgeDocument(messages);
  const first = out[0].content;
  assert.ok(Array.isArray(first), "first-turn content is normalised to an array");
  assert.strictEqual(first[0].type, "document");
  assert.strictEqual(first[0].citations.enabled, true);
  assert.strictEqual(first[0].cache_control.type, "ephemeral");
  // The customer's original text is preserved, after the document.
  assert.deepStrictEqual(first[1], { type: "text", text: "Can you clean a wool rug?" });
});

test("withKnowledgeDocument prepends to an array first turn (image case) without losing blocks", () => {
  const original = [
    { type: "image", source: { type: "base64", media_type: "image/png", data: "x" } },
    { type: "text", text: "What carpet is this?" },
  ];
  const messages = [{ role: "user", content: original }];
  const out = withKnowledgeDocument(messages);
  assert.strictEqual(out[0].content[0].type, "document");
  assert.strictEqual(out[0].content[1].type, "image");
  assert.strictEqual(out[0].content[2].type, "text");
});

test("withKnowledgeDocument does not mutate the caller's messages and leaves later turns intact", () => {
  const messages = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "wool?" },
  ];
  const out = withKnowledgeDocument(messages);
  assert.strictEqual(messages[0].content, "hi", "input must not be mutated");
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[1], messages[1], "later turns are passed through unchanged");
  assert.strictEqual(out[2], messages[2]);
});

test("withKnowledgeDocument is a no-op on an empty message list", () => {
  assert.deepStrictEqual(withKnowledgeDocument([]), []);
});

test("collectCitations maps cited block indices back to KB sections, deduped", () => {
  const sec = knowledge.knowledgeSections;
  const data = {
    stop_reason: "end_turn",
    content: [
      { type: "text", text: "For wool, " },
      {
        type: "text",
        text: "the low-moisture method is the only safe approach",
        citations: [
          { type: "content_block_location", cited_text: "...", document_index: 0,
            document_title: "ICC reference", start_block_index: 2, end_block_index: 3 },
        ],
      },
      { type: "text", text: " and " },
      {
        type: "text",
        text: "we never use bleach",
        citations: [
          // same section cited twice -> must dedupe to one entry
          { type: "content_block_location", cited_text: "...", document_index: 0,
            document_title: "ICC reference", start_block_index: 2, end_block_index: 3 },
          { type: "content_block_location", cited_text: "...", document_index: 0,
            document_title: "ICC reference", start_block_index: 1, end_block_index: 2 },
        ],
      },
    ],
  };
  const out = collectCitations(data);
  assert.deepStrictEqual(out, [
    { id: sec[2].id, title: sec[2].title },
    { id: sec[1].id, title: sec[1].title },
  ]);
});

test("collectCitations returns [] for a reply with no citations", () => {
  assert.deepStrictEqual(
    collectCitations({ content: [{ type: "text", text: "Just a price, no citation." }] }),
    []
  );
  assert.deepStrictEqual(collectCitations({}), []);
  assert.deepStrictEqual(collectCitations(null), []);
});

test("collectCitations falls back to the document title when no block index is given", () => {
  const out = collectCitations({
    content: [
      { type: "text", text: "x", citations: [{ type: "char_location", document_title: "External source" }] },
    ],
  });
  assert.deepStrictEqual(out, [{ id: null, title: "External source" }]);
});
