// Guard: the booking client must extract the BOOKING_READY payload even though it
// now carries a nested quote_lines array (D-004 structured pricing). The shipped
// non-greedy regex /BOOKING_READY:(\{[\s\S]*?\})/ captured only up to the FIRST inner
// brace (the end of the first quote_lines object), so JSON.parse threw and
// processBooking was never called: every structured-pricing booking silently failed
// to confirm. Found on the 2026-09-06 post-deploy live ride, not by the unit suite,
// because handleBooking is tested server-side with a pre-parsed object and nothing
// exercised the browser-side parse of the new payload shape.
//
// book.astro's booking script is `is:inline` (it cannot import — see the comment at
// the top of the script), so the extractor lives inline. Like chat-client-parity,
// these are assertions over the source, but here we pull the exact inline function
// out and RUN it, so the shipped browser code is the thing under test.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const bookAstro = fs.readFileSync(path.join(repoRoot, "site", "src", "pages", "book.astro"), "utf8");
const chatFn = fs.readFileSync(path.join(repoRoot, "server", "netlify", "functions", "chat.js"), "utf8");

// Pull the marker-delimited extractor out of the inline script and materialise it as
// a callable function, so we test the actual code the browser runs.
function loadInlineExtractor() {
  const m = bookAstro.match(
    /\/\* __BOOKING_READY_EXTRACTOR__ \*\/([\s\S]*?)\/\* __END_BOOKING_READY_EXTRACTOR__ \*\//
  );
  assert.ok(m, "book.astro must wrap extractBookingReady in the parity markers");
  return new Function(m[1] + "\nreturn extractBookingReady;")();
}
const extractBookingReady = loadInlineExtractor();

// The exact shape the assistant emits post-D-004: a nested quote_lines array, and
// trailing prose after the payload. This is the string that broke in production.
const REAL_PAYLOAD =
  'Brilliant, thanks Ben. Confirming that now.\n\n' +
  'BOOKING_READY:{"name":"Ben Test","phone":"07700 900123","email":"ben.graham240689@gmail.com",' +
  '"address":"10 Test Road, Cheltenham, GL51 0AA","postcode":"GL51 0AA","date":"2026-09-14",' +
  '"start_time":"09:30","slots_needed":4,"furniture_moving":false,"pets":false,' +
  '"quote_lines":[{"code":"large_room","qty":1},{"code":"hallway","qty":1},' +
  '{"code":"stairs_to_13","qty":1},{"code":"stain","qty":1}],' +
  '"estimated_price":"£280","deposit":"£28"}\n\nYou\'re all booked in, Ben.';

test("prove-it-can-fail: the old non-greedy regex truncates the quote_lines payload", () => {
  // Documents the exact defect this fix closes. The shipped capture ends at the first
  // inner brace, leaving unbalanced, invalid JSON.
  const m = REAL_PAYLOAD.match(/BOOKING_READY:(\{[\s\S]*?\})/);
  assert.ok(m, "sanity: the marker is present in the fixture");
  assert.throws(
    () => JSON.parse(m[1]),
    "the old non-greedy capture must be invalid JSON — that is the regression"
  );
});

test("extracts a payload carrying a nested quote_lines array", () => {
  const b = extractBookingReady(REAL_PAYLOAD);
  assert.ok(b, "must return a parsed booking, not null");
  assert.strictEqual(b.name, "Ben Test");
  assert.strictEqual(b.deposit, "£28");
  assert.ok(Array.isArray(b.quote_lines) && b.quote_lines.length === 4, "quote_lines must survive intact");
  assert.strictEqual(b.quote_lines[0].code, "large_room");
  assert.strictEqual(b.quote_lines[3].code, "stain");
});

test("still parses a flat payload with no quote_lines (backwards compatible)", () => {
  const flat =
    'Great.\n\nBOOKING_READY:{"name":"Jo","email":"jo@example.com","slots_needed":2,' +
    '"estimated_price":"£130","deposit":"£13"}';
  const b = extractBookingReady(flat);
  assert.ok(b);
  assert.strictEqual(b.name, "Jo");
  assert.strictEqual(b.slots_needed, 2);
});

test("a brace inside a string value does not end the object early", () => {
  const withBrace =
    'x\n\nBOOKING_READY:{"name":"Jo","concerns":"spill by the boiler cupboard }","slots_needed":1}';
  const b = extractBookingReady(withBrace);
  assert.ok(b, "the string-internal } must be ignored by the scan");
  assert.strictEqual(b.concerns, "spill by the boiler cupboard }");
});

test("an escaped quote inside a string is handled", () => {
  const withEsc =
    'x\n\nBOOKING_READY:{"name":"Jo","ai_assessment":"customer said \\"no pets\\" and {ok}","slots_needed":1}';
  const b = extractBookingReady(withEsc);
  assert.ok(b);
  assert.match(b.ai_assessment, /no pets/);
});

test("returns null when the marker is absent", () => {
  assert.strictEqual(extractBookingReady("Just a normal reply, no booking here."), null);
});

test("returns null (never throws) on a malformed payload", () => {
  const bad = 'BOOKING_READY:{"name":"Jo", oops not json';
  assert.doesNotThrow(() => extractBookingReady(bad));
  assert.strictEqual(extractBookingReady(bad), null);
});

test("book.astro no longer uses the truncating .match(/BOOKING_READY:/) capture", () => {
  assert.ok(
    !bookAstro.includes(".match(/BOOKING_READY:"),
    "the regex-match extraction must be replaced by extractBookingReady()"
  );
  assert.ok(bookAstro.includes("extractBookingReady("), "book.astro must call extractBookingReady()");
});

test("a parse failure is surfaced to the customer, not silently dropped (honest-failure)", () => {
  // The old catch showed only the pre-marker text and dropped the booking with no
  // signal. A marker-present-but-unparseable reply must tell the customer how to
  // complete it rather than dead-end.
  assert.match(
    bookAstro,
    /couldn't finish confirming/i,
    "book.astro must show a fallback contact message when the payload will not parse"
  );
});

test("the server contract still emits quote_lines (D-004), so the nested shape is real", () => {
  assert.match(chatFn, /quote_lines/, "chat.js must still instruct the model to emit quote_lines");
});
