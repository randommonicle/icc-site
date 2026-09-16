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

  // Copy review E2 (14 Sept 2026): the server's own customer-facing sentences are shown
  // as written, with nothing appended. Before, every refusal was wrapped as
  // "Sorry - <reason> Please choose another time.", so the slot-taken reply said
  // "choose another time" twice and a rejected email address was answered with
  // "choose another time".
  test(name + ": the server's complete sentences (409 / 429 / 502 / 503) are shown as written, nothing appended", () => {
    const slotTaken = bookingRefusal({ error: "Time slot no longer available. Please choose another time." }, 409);
    assert.strictEqual(slotTaken, "Time slot no longer available. Please choose another time.");
    assert.strictEqual((slotTaken.match(/choose another time/g) || []).length, 1, "the instruction appears once");
    const storeFailed = bookingRefusal({ error: "We couldn't confirm your booking just now. Please call 01452 452356 to book." }, 502);
    assert.strictEqual(storeFailed, "We couldn't confirm your booking just now. Please call 01452 452356 to book.");
    assert.strictEqual(bookingRefusal({ error: "We couldn't confirm your booking just now. Please call 01452 452356 to book." }, 503), storeFailed, "503 reads like 502");
    const tooMany = bookingRefusal({ error: "Too many requests. Please wait a little and try again, or call us on 01452 452356." }, 429);
    assert.strictEqual(tooMany, "Too many requests. Please wait a little and try again, or call us on 01452 452356.");
    assert.ok(!/Sorry - /.test(slotTaken + storeFailed + tooMany), "the spaced hyphen wrapper is gone");
  });

  test(name + ": a 400 (a rejected detail) asks for the correct detail, never for another time", () => {
    const email = bookingRefusal({ error: "Invalid email" }, 400);
    assert.strictEqual(email, "Sorry, I couldn't complete the booking: Invalid email. Tell me the correct details and I'll try again, or call 01452 452356.");
    const soon = bookingRefusal({ error: "Date too soon, we need at least 7 days' notice" }, 400);
    assert.match(soon, /^Sorry, I couldn't complete the booking: Date too soon, we need at least 7 days' notice\. Tell me the correct details/);
    assert.ok(!/choose another time/.test(email), "a rejected email address is not answered with 'choose another time'");
    // A server reason that already ends in a full stop does not double it.
    assert.match(bookingRefusal({ error: "Invalid phone." }, 400), /: Invalid phone\. Tell me/);
    assert.match(bookingRefusal({ error: "Invalid phone.  " }, 400), /: Invalid phone\. Tell me/);
  });

  test(name + ": any other status gets the call-us line, with the server's text kept in brackets for diagnosis", () => {
    const misconfigured = bookingRefusal({ error: "Anthropic API key not configured" }, 500);
    assert.strictEqual(misconfigured, "Sorry, I couldn't complete your booking just now (Anthropic API key not configured). Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll book it for you.");
    const forbidden = bookingRefusal({ error: "Forbidden" }, 403);
    assert.match(forbidden, /^Sorry, I couldn't complete your booking just now \(Forbidden\)\. Please call 01452 452356/);
    // A status the client never learned (undefined / NaN) is treated the same way: never as a complete sentence.
    assert.match(bookingRefusal({ error: "Invalid email" }), /^Sorry, I couldn't complete your booking just now \(Invalid email\)\. Please call/);
  });

  test(name + ": a body with neither success nor error is a refusal with the call-us fallback, never a confirmation card", () => {
    // Before the fix an empty or malformed 200 body fell through to the confirmation
    // card, claiming a booking that may not exist.
    for (const body of [{}, null, undefined, "not json", { success: false }, { success: "true" }, { error: "" }, { error: 42 }]) {
      for (const status of [200, 400, 409, 500, undefined]) {
        const r = bookingRefusal(body, status);
        assert.strictEqual(typeof r, "string", "must refuse for " + JSON.stringify(body) + " / " + status);
        assert.strictEqual(r, "Sorry, I couldn't complete your booking just now. Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll book it for you.");
      }
    }
  });
}

test("index.html's bookingRefusal is byte-identical to book.astro's (rollback parity)", () => {
  const inBook = bookAstro.match(REFUSAL_RE);
  const inIndex = indexHtml.match(REFUSAL_RE);
  assert.ok(inBook && inIndex, "both files must carry the marker-wrapped function");
  assert.strictEqual(inIndex[1], inBook[1], "the rollback's bookingRefusal has drifted from book.astro; port the change into index.html");
});

// B-3 (14 Sept copy reviews): the deposit printed on the confirmation card must be the
// server's figure of record (bookData.deposit, recomputed from quote_lines in chat.js
// and returned in every success body), with the model's BOOKING_READY figure only as
// the fallback. Pinned by source, in both clients, so the card cannot quietly go back
// to printing the model's number.
test("the confirmation card prints the server's deposit (bookData.deposit) before the model's, in both clients", () => {
  const RE = /const depositShown = \(typeof bookData\.deposit === "string" && bookData\.deposit\) \? bookData\.deposit : \(booking\.deposit\|\|""\);/;
  for (const [name, src] of [["book.astro", bookAstro], ["index.html", indexHtml]]) {
    assert.match(src, RE, name + " must derive the card's deposit from bookData.deposit with booking.deposit as the fallback");
    assert.ok(!/deposit of " \+ \(booking\.deposit\|\|""\)/.test(src), name + " must not print the model's deposit straight onto the card");
    assert.strictEqual((src.match(/\+ depositShown \+/g) || []).length, 2, name + " prints depositShown in both footer variants");
  }
});

test("processBooking gates on bookingRefusal WITH the HTTP status, and no longer on bookData.error first, in both clients", () => {
  for (const [name, src] of [["book.astro", bookAstro], ["index.html", indexHtml]]) {
    assert.match(src, /const refusal = bookingRefusal\(bookData, bookRes\.status\);/, name + " must decide the outcome through bookingRefusal, passing the response status (E2 keys the wording on it)");
    assert.ok(!/if\(bookData\.error\)\{/.test(src), name + " must not test bookData.error before success (the L-041 defect)");
  }
});
