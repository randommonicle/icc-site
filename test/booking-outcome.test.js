// Guard (L-041): a booking the server has PERSISTED must never be announced to the
// customer as a refusal. The confirm_booking response for a booking whose email send
// threw carried success:true AND error:<message> (chat.js), and the client tested
// `bookData.error` first, so the customer was told "Sorry - <raw error> Please choose
// another time." for a booking that was already saved and holding its slot. Both copy
// reviews of 14 September 2026 found it (B-1); no unit test could, because the client's
// decision was inline in processBooking, which needs fetch and a DOM.
//
// The decision now lives in bookingRefusal(), marker-wrapped in book.astro's inline
// script and in the index.html rollback, so this file pulls the exact shipped function
// out of each file and RUNS it (the booking-ready-parse pattern), and locks the two
// copies byte-identical (the chat-client-parity pattern).

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const bookAstro = fs.readFileSync(path.join(repoRoot, "site", "src", "pages", "book.astro"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");

const REFUSAL_RE = /\/\* __BOOKING_REFUSAL__ \*\/([\s\S]*?)\/\* __END_BOOKING_REFUSAL__ \*\//;

function loadBookingRefusal(src, name) {
  const m = src.match(REFUSAL_RE);
  assert.ok(m, name + " must wrap bookingRefusal in the __BOOKING_REFUSAL__ markers");
  return new Function(m[1] + "\nreturn bookingRefusal;")();
}

// The exact body chat.js returns when the email send throws, as shipped BEFORE the fix
// (success:true with an error key) and after it (no error key). Both must be read as a
// booking, because the row is persisted either way.
const PERSISTED_EMAIL_THREW_OLD = {
  success: true, provisional: false, message: "Booking recorded but email sending failed.",
  calLink: "https://calendar.google.com/x", depositPayUrl: null,
  error: "fetch failed", emailStatus: { operator: false, customer: false },
};
const PERSISTED_EMAIL_THREW_NEW = { ...PERSISTED_EMAIL_THREW_OLD };
delete PERSISTED_EMAIL_THREW_NEW.error;

for (const [name, src] of [["book.astro", bookAstro], ["index.html", indexHtml]]) {
  const bookingRefusal = loadBookingRefusal(src, name);

  test(name + ": a persisted booking whose email send threw is NOT a refusal, error key or no error key", () => {
    assert.strictEqual(bookingRefusal(PERSISTED_EMAIL_THREW_OLD), null, "success:true with an error key is still a saved booking");
    assert.strictEqual(bookingRefusal(PERSISTED_EMAIL_THREW_NEW), null, "success:true without an error key is a saved booking");
    assert.strictEqual(bookingRefusal({ success: true, provisional: true, emailStatus: { operator: true, customer: true } }), null);
  });

  test(name + ": a genuine refusal (error, no success) keeps the server's own instruction", () => {
    const slotTaken = bookingRefusal({ error: "Time slot no longer available. Please choose another time." });
    assert.strictEqual(slotTaken, "Sorry - Time slot no longer available. Please choose another time. Please choose another time.");
    const storeFailed = bookingRefusal({ error: "We couldn't confirm your booking just now. Please call 01452 452356 to book." });
    assert.match(storeFailed, /^Sorry - We couldn't confirm your booking just now\. Please call 01452 452356 to book\./);
    const validation = bookingRefusal({ error: "Invalid email" });
    assert.match(validation, /^Sorry - Invalid email/);
  });

  test(name + ": a body with neither success nor error is a refusal with the call-us fallback, never a confirmation card", () => {
    // Before the fix an empty or malformed 200 body fell through to the confirmation
    // card, claiming a booking that may not exist.
    for (const body of [{}, null, undefined, "not json", { success: false }, { success: "true" }]) {
      const r = bookingRefusal(body);
      assert.strictEqual(typeof r, "string", "must refuse for " + JSON.stringify(body));
      assert.match(r, /call 01452 452356/);
    }
  });
}

test("index.html's bookingRefusal is byte-identical to book.astro's (rollback parity)", () => {
  const inBook = bookAstro.match(REFUSAL_RE);
  const inIndex = indexHtml.match(REFUSAL_RE);
  assert.ok(inBook && inIndex, "both files must carry the marker-wrapped function");
  assert.strictEqual(inIndex[1], inBook[1], "the rollback's bookingRefusal has drifted from book.astro; port the change into index.html");
});

test("processBooking gates on bookingRefusal, and no longer on bookData.error first, in both clients", () => {
  for (const [name, src] of [["book.astro", bookAstro], ["index.html", indexHtml]]) {
    assert.match(src, /const refusal = bookingRefusal\(bookData\);/, name + " must decide the outcome through bookingRefusal");
    assert.ok(!/if\(bookData\.error\)\{/.test(src), name + " must not test bookData.error before success (the L-041 defect)");
  }
});
