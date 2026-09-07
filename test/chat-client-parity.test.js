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

test("both booking clients surface an operator-email failure, not only the customer one (L-029)", () => {
  // The server reports emailStatus.{operator,customer}. A booking that failed to notify
  // Mark (operator email) must NOT still tell the customer "and to our team" / "Mark will
  // confirm personally"; BOTH failure fields have to gate the confirmation copy, in the
  // live client and the retained rollback. A .customer-only gate is the bug this catches.
  assert.match(chatFn, /emailStatus:\s*\{\s*operator/, "chat.js must send emailStatus.operator");
  const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  for (const [name, src] of [["book.astro", bookAstro], ["index.html", indexHtml]]) {
    assert.match(src, /emailStatus\.operator/, name + " must read emailStatus.operator, not only .customer");
    assert.match(src, /emailStatus\.customer/, name + " must read emailStatus.customer");
  }
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

test("the photo upload input stays keyboard-reachable, not display:none", () => {
  // display:none removes the file input from the tab order, so keyboard-only users
  // cannot open the picker (WCAG 2.1.1). It must use the visually-hidden pattern so it
  // stays focusable while the styled <label> remains the visible trigger.
  const m = bookAstro.match(/id="imageUpload"[^>]*style="([^"]*)"/);
  assert.ok(m, "the imageUpload input must exist with an inline style");
  assert.doesNotMatch(m[1], /display:\s*none/, "keep the visually-hidden pattern, not display:none");
});

// --- index.html rollback: BOOKING_READY parser parity (added 2026-09-07) ----
// The retained index.html rollback silently kept the pre-fix non-greedy BOOKING_READY
// parser after book.astro was hardened on 2026-09-07 — exactly the drift this file
// exists to catch, which the emailStatus-only check above could not see (it never read
// the parser). These lock the rollback's parser to book.astro's and run index.html's
// actual extractor against the nested quote_lines payload that broke in production.
const EXTRACTOR_RE = /\/\* __BOOKING_READY_EXTRACTOR__ \*\/([\s\S]*?)\/\* __END_BOOKING_READY_EXTRACTOR__ \*\//;
const indexHtmlSrc = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");

test("index.html's BOOKING_READY extractor is byte-identical to book.astro's (rollback parser parity)", () => {
  const inBook = bookAstro.match(EXTRACTOR_RE);
  const inIndex = indexHtmlSrc.match(EXTRACTOR_RE);
  assert.ok(inBook, "book.astro must wrap extractBookingReady in the parity markers");
  assert.ok(inIndex, "index.html (the rollback) must carry the same marker-wrapped extractor");
  assert.strictEqual(
    inIndex[1],
    inBook[1],
    "the rollback's parser has drifted from book.astro — port the change into index.html, or delete index.html per this file's header comment"
  );
});

test("index.html's extractor parses a nested quote_lines payload (extract-and-run)", () => {
  const m = indexHtmlSrc.match(EXTRACTOR_RE);
  assert.ok(m, "index.html must carry the marker-wrapped extractor");
  const extractBookingReady = new Function(m[1] + "\nreturn extractBookingReady;")();
  const payload =
    'Confirming now.\n\nBOOKING_READY:{"name":"Ben Test","slots_needed":4,' +
    '"quote_lines":[{"code":"large_room","qty":1},{"code":"stairs_to_13","qty":1}],' +
    '"estimated_price":"£280","deposit":"£28"}\n\nYou are all booked in.';
  const b = extractBookingReady(payload);
  assert.ok(b, "must return a parsed booking, not null");
  assert.strictEqual(b.name, "Ben Test");
  assert.ok(Array.isArray(b.quote_lines) && b.quote_lines.length === 2, "quote_lines must survive intact");
  assert.strictEqual(extractBookingReady("BOOKING_READY:{}"), null, "an empty object must be rejected");
  assert.strictEqual(extractBookingReady("no marker here at all"), null, "no marker must return null");
});

test("index.html no longer uses the truncating .match(/BOOKING_READY:/) capture", () => {
  assert.ok(
    !indexHtmlSrc.includes(".match(/BOOKING_READY:"),
    "the rollback must use extractBookingReady(), not the non-greedy regex that shipped the 2026-09-06 outage"
  );
  assert.ok(indexHtmlSrc.includes("extractBookingReady("), "index.html must call extractBookingReady()");
});

// --- index.html rollback: privacy-notice parity (added 2026-09-07) -----------
// L-035 again, for the privacy notice: index.html shipped a Phase-0 DRAFT with [to confirm]
// placeholders while privacy.astro was the go-live version. Ported 2026-09-07. The notice
// cannot be byte-identical (Astro layout vs plain HTML), so guard the facts that would be
// materially wrong if the rollback's copy went stale, not the wrapper.
const privacyAstroSrc = fs.readFileSync(path.join(repoRoot, "site", "src", "pages", "privacy.astro"), "utf8");

test("index.html's privacy notice ships no unfilled placeholders", () => {
  // '[to confirm' is the correct pattern; 'to confirm]' gave a false negative on the real
  // placeholders, which read '[to confirm: ...]'.
  assert.ok(!indexHtmlSrc.includes("[to confirm"), "the rollback must not ship a draft privacy notice with placeholders");
});

test("index.html's privacy notice carries the go-live controller + ICO facts", () => {
  for (const fact of ["ZC230232", "Mark McClymont"]) {
    assert.ok(privacyAstroSrc.includes(fact), `privacy.astro (the source of truth) must state ${fact}`);
    assert.ok(indexHtmlSrc.includes(fact), `the index.html rollback notice must also state ${fact}`);
  }
});

test("index.html's privacy 'Last updated' date matches the served notice", () => {
  const m = privacyAstroSrc.match(/Last updated:\s*(\d{1,2} \w+ \d{4})/);
  assert.ok(m, "privacy.astro must carry a 'Last updated: <date>' line");
  assert.ok(indexHtmlSrc.includes("Last updated: " + m[1]), `the rollback notice's 'Last updated' must match privacy.astro (${m[1]})`);
});

test("index.html carries ICC's own phone number, not the old Regency line", () => {
  // Ben's call, 2026-09-07: the rollback shows ICC's 01452, not Regency's 01242 (D-034).
  assert.ok(!indexHtmlSrc.includes("01242"), "the rollback must not carry the old 01242 Regency number anywhere");
  assert.ok(indexHtmlSrc.includes("01452 452356"), "the rollback must carry ICC's 01452 452356");
});
