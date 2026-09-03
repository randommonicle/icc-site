// Guard: the live Astro chat client (site/src/pages/book.astro) must keep handling
// everything the server sends. This exists because it once did not. The Phase 1
// cutover (PR #49) replaced the index.html client with book.astro and silently
// dropped two shipped features: the CONVERSATION_END goodbye handling (PR #21) and
// the citation provenance captions (Slices 4c/4d, D-019). The server kept sending
// both, so customers saw a raw CONVERSATION_END marker in the chat and never saw
// the "Based on ICC's expert guidance" captions the grounding work was built for.
//
// Nothing in the suite exercised the browser-side client, so the regression was
// invisible for a month. These are static assertions over the source rather than a
// DOM test: the goal is to fail loudly the next time the two clients drift, not to
// simulate a browser. index.html is the retained rollback (CLAUDE.md) and stays in
// the comparison for exactly that reason — if it is ever deleted, delete this file
// with it rather than weakening the parity check.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const bookAstro = fs.readFileSync(path.join(repoRoot, "site", "src", "pages", "book.astro"), "utf8");
const chatFn = fs.readFileSync(path.join(repoRoot, "server", "netlify", "functions", "chat.js"), "utf8");
const guidesDir = path.join(repoRoot, "site", "src", "content", "guides");

test("the server still instructs the model to emit CONVERSATION_END", () => {
  // If this ever fails the marker was renamed or dropped server-side, and the
  // client assertions below are then testing for a marker that no longer exists.
  assert.match(chatFn, /CONVERSATION_END/, "chat.js must still define the goodbye marker");
});

test("book.astro strips CONVERSATION_END before display", () => {
  assert.match(
    bookAstro,
    /replace\(\/CONVERSATION_END\/g,\s*""\)/,
    "book.astro must strip the marker, or the customer sees it verbatim in the chat"
  );
});

test("book.astro closes the conversation on a goodbye instead of nagging", () => {
  assert.match(bookAstro, /function endConversation\(/, "book.astro needs endConversation()");
  assert.match(
    bookAstro,
    /if\(conversationEnded\)\s*endConversation\(\)/,
    "a detected CONVERSATION_END must actually call endConversation()"
  );
  assert.match(
    bookAstro,
    /if\(!conversationClosed\)\{\s*btn\.disabled=false/,
    "a closed conversation must not re-enable the input"
  );
});

test("book.astro reads the citations payload the server attaches", () => {
  assert.match(
    chatFn,
    /citations:\s*citations/,
    "chat.js must still attach citations to the response"
  );
  assert.match(
    bookAstro,
    /Array\.isArray\(d\.citations\)/,
    "book.astro must read d.citations off the response"
  );
  assert.match(bookAstro, /function renderCitations\(/, "book.astro needs renderCitations()");
  assert.match(
    bookAstro,
    /Based on ICC's expert guidance/,
    "the KB provenance caption is the customer-visible half of D-019"
  );
});

test("book.astro renders the provisional outcome the server sends (D-027)", () => {
  // The server flags a held (late-finish) booking with provisional:true; the client must
  // read it and NOT tell the customer the slot is confirmed/secured (the F1 class of bug).
  assert.match(chatFn, /provisional,/, "chat.js must send the provisional flag in the booking response");
  assert.match(bookAstro, /bookData\.provisional/, "book.astro must read bookData.provisional");
  assert.match(bookAstro, /provisionally held/, "the held-booking copy must be present");
});

test("citations render as DOM nodes, never innerHTML (L-003)", () => {
  const start = bookAstro.indexOf("function renderCitations(");
  assert.ok(start > -1, "renderCitations must exist");
  const body = bookAstro.slice(start, bookAstro.indexOf("\nfunction ", start + 1));
  assert.doesNotMatch(
    body,
    /innerHTML/,
    "renderCitations must build nodes, so a prompt-injected citation title stays inert"
  );
});

test("every KB guide slug maps to a care guide that exists", () => {
  // A slug with no matching guide would send a customer who clicked a provenance
  // caption to a 404, which is worse than the inert label it replaced.
  const block = bookAstro.match(/const KB_GUIDE_SLUGS=\{([\s\S]*?)\};/);
  assert.ok(block, "book.astro must define KB_GUIDE_SLUGS");
  const slugs = [...block[1].matchAll(/:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(slugs.length > 0, "expected at least one KB section to map to a guide");
  const existing = new Set(
    fs.readdirSync(guidesDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""))
  );
  for (const slug of slugs) {
    assert.ok(existing.has(slug), `KB_GUIDE_SLUGS points at /guides/${slug}/ but no such guide exists`);
  }
});

test("the chat transcript is announced to screen readers", () => {
  assert.match(
    bookAstro,
    /id="chatMessages"[^>]*aria-live="polite"/,
    "the message list needs a live region, or the conversation is silent to a screen reader"
  );
});

test("book.astro's inline script parses", () => {
  // Same reasoning as admin-html-syntax.test.js: one syntax error in the single
  // inline block takes the whole booking chat down, not just the edited feature.
  const m = bookAstro.match(/<script is:inline>([\s\S]*?)<\/script>/);
  assert.ok(m, "book.astro has an inline script block");
  assert.doesNotThrow(() => { new Function(m[1]); }, "inline script must be syntactically valid");
});
