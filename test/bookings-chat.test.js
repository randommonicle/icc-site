// Slice 5b (D-021) — the chat.js booking branches: parameterised trading-hours
// validation, the fail-closed Postgres write, and the Postgres availability grid.
// The Supabase client is a chainable fake and global.fetch (Resend) is stubbed, so
// these exercise the REAL handleBooking / checkAvailability / validateBooking the
// live function uses, with no network. The Blobs path is covered by the rest of
// the suite (byte-identical, flag-off) and by the Commit 5 real-Supabase test.

const { test } = require("node:test");
const assert = require("node:assert");

const chat = require("../server/netlify/functions/chat.js");
const { validateBooking, handleBooking, checkAvailability } = chat;

const PG = { latestStartHour: 15, latestEndHour: 16, maxSlots: 7 };

// A future weekday (>= 7 days out, not Sunday) in local YYYY-MM-DD, so the date
// passes validateBooking's window/Sunday checks regardless of when the test runs.
function futureWeekday(daysOut) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysOut);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function baseBooking(over) {
  return Object.assign(
    {
      name: "Jane Smith",
      phone: "01242 123456",
      email: "jane@example.com",
      address: "12 High St, Cheltenham GL52 1AB",
      postcode: "GL52 1AB",
      date: futureWeekday(21),
      start_time: "10:00",
      slots_needed: 2,
      rooms: "Lounge",
      carpet_types: "Wool",
      concerns: "none",
      furniture_moving: false,
      pets: false,
      estimated_price: "£200",
      deposit: "£24",
      recommended_method: "Texatherm low-moisture",
      ai_assessment: "ok",
      rams: "Activity: cleaning",
    },
    over || {}
  );
}

// Chainable, thenable fake Supabase client (see bookings-store.test.js).
function fakeSupabase(plan = {}) {
  const calls = [];
  function builder() {
    const state = { op: null };
    const result = () => {
      calls.push(Object.assign({}, state));
      if (state.op === "upsert") return plan.customersUpsert || { data: { id: "cust-1" }, error: null };
      if (state.op === "insert") return plan.jobsInsert || { data: { id: "job-1" }, error: null };
      if (state.op === "update") return plan.jobsUpdate || { data: null, error: null };
      return plan.jobsSelect || { data: [], error: null };
    };
    const b = {
      upsert(row, opts) { state.op = "upsert"; state.row = row; state.opts = opts; return b; },
      insert(row) { state.op = "insert"; state.row = row; return b; },
      update(obj) { state.op = "update"; state.obj = obj; return b; },
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      order() { return b; },
      limit() { return b; },
      single() { return b; },
      then(onF, onR) { return Promise.resolve().then(result).then(onF, onR); },
    };
    return b;
  }
  return { from: builder, calls };
}

// Run fn with BOOKINGS_STORE=postgres and a recording fetch stub, restored after.
async function underPostgres(fn) {
  const prevStore = process.env.BOOKINGS_STORE;
  const prevFetch = global.fetch;
  const fetchCalls = [];
  process.env.BOOKINGS_STORE = "postgres";
  global.fetch = async (url) => { fetchCalls.push(url); return { json: async () => ({ id: "fake" }) }; };
  try {
    return await fn(fetchCalls);
  } finally {
    if (prevStore === undefined) delete process.env.BOOKINGS_STORE;
    else process.env.BOOKINGS_STORE = prevStore;
    global.fetch = prevFetch;
  }
}

// --- validateBooking bounds ------------------------------------------------

test("validateBooking (Blobs defaults) accepts 16:00 / 17:00 starts and up to 9 slots", () => {
  assert.strictEqual(validateBooking(baseBooking({ start_time: "16:00", slots_needed: 1 })), null);
  assert.strictEqual(validateBooking(baseBooking({ start_time: "17:00", slots_needed: 1 })), null);
  assert.strictEqual(validateBooking(baseBooking({ start_time: "9:00", slots_needed: 8 })), null);
});

test("validateBooking (Postgres bounds) rejects a 16:00 start", () => {
  assert.match(validateBooking(baseBooking({ start_time: "16:00", slots_needed: 1 }), PG) || "", /start_time/);
  assert.strictEqual(validateBooking(baseBooking({ start_time: "15:00", slots_needed: 1 }), PG), null);
});

test("validateBooking (Postgres bounds) rejects a slot run ending after 16:00", () => {
  assert.match(validateBooking(baseBooking({ start_time: "15:00", slots_needed: 2 }), PG) || "", /trading hours/);
});

test("validateBooking (Postgres bounds) caps slots at 7", () => {
  assert.match(validateBooking(baseBooking({ start_time: "9:00", slots_needed: 8 }), PG) || "", /slots_needed/);
  assert.strictEqual(validateBooking(baseBooking({ start_time: "9:00", slots_needed: 7 }), PG), null);
});

// --- handleBooking: fail-closed Postgres write -----------------------------

test("handleBooking (Postgres) persists, then sends emails, on success", async () => {
  await underPostgres(async (fetchCalls) => {
    const sb = fakeSupabase();
    const res = await handleBooking(baseBooking(), "re_test", {}, sb);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.calLink.startsWith("https://calendar.google.com/"));
    assert.ok(sb.calls.some((c) => c.op === "insert"), "the job was inserted");
    assert.ok(fetchCalls.length >= 1, "emails fire only after a successful persist");
  });
});

test("handleBooking (Postgres) returns 409 on a slot conflict and sends NO email", async () => {
  await underPostgres(async (fetchCalls) => {
    const sb = fakeSupabase({ jobsInsert: { data: null, error: { code: "23P01", message: "exclusion" } } });
    const res = await handleBooking(baseBooking(), "re_test", {}, sb);
    assert.strictEqual(res.statusCode, 409);
    assert.match(JSON.parse(res.body).error, /no longer available/);
    assert.strictEqual(fetchCalls.length, 0, "no confirmation email on a conflict");
  });
});

test("handleBooking (Postgres) returns 502 and sends NO email when the write fails (L-008)", async () => {
  await underPostgres(async (fetchCalls) => {
    const sb = fakeSupabase({ jobsInsert: { data: null, error: { code: "23502", message: "not null" } } });
    const res = await handleBooking(baseBooking(), "re_test", {}, sb);
    assert.strictEqual(res.statusCode, 502);
    assert.match(JSON.parse(res.body).error, /01242 279590/);
    assert.strictEqual(fetchCalls.length, 0, "must never email a confirmation when nothing was persisted");
  });
});

test("handleBooking (Postgres) rejects a 16:00 start as a clean 400 without touching the DB", async () => {
  await underPostgres(async () => {
    const sb = fakeSupabase();
    const res = await handleBooking(baseBooking({ start_time: "16:00", slots_needed: 1 }), "re_test", {}, sb);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(!sb.calls.some((c) => c.op === "insert"), "validation precedes the DB; no write on a 400");
  });
});

// --- checkAvailability: Postgres grid + derivation -------------------------

test("checkAvailability (Postgres) uses the 9..15 grid and excludes committed hours", async () => {
  await underPostgres(async () => {
    const sb = fakeSupabase({ jobsSelect: { data: [{ start_hour: 10, slots_needed: 2 }], error: null } });
    const res = await checkAvailability(futureWeekday(21), 1, {}, sb);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(!body.available.includes("16:00") && !body.available.includes("17:00"), "grid capped at 15:00");
    assert.ok(!body.available.includes("10:00") && !body.available.includes("11:00"), "booked hours excluded");
    assert.ok(body.available.includes("9:00") && body.available.includes("12:00"));
    assert.deepStrictEqual(body.booked.slice().sort((a, b) => a - b), [10, 11]);
  });
});

test("checkAvailability (Postgres) caps the slots query at 7 to match the booking engine", async () => {
  await underPostgres(async () => {
    const sb = fakeSupabase();
    const tooMany = await checkAvailability(futureWeekday(21), 8, {}, sb);
    assert.strictEqual(tooMany.statusCode, 400);
    const ok = await checkAvailability(futureWeekday(21), 7, {}, sb);
    assert.strictEqual(ok.statusCode, 200);
  });
});

// --- A4: customer confirmation email identity (reply_to + privacy link) ------
// Review finding A4 / UK GDPR Arts.13/14. The booking confirmation carries more
// personal data than a handoff reply (name, address, appointment, price, T&Cs),
// so it gets the same controller identity: a real Reply-To and a privacy-notice
// link. Scope is the CUSTOMER email only; the operator email stays internal.

const { privacyNoticeUrl } = chat;

// Drive the REAL handleBooking under the Postgres path and capture the JSON
// bodies POSTed to Resend, so we assert on the actual payload the live function
// sends, not a reconstruction. Two emails go out (operator + customer); they are
// told apart by the `to` address.
async function captureBookingEmails(booking) {
  const prevStore = process.env.BOOKINGS_STORE;
  const prevFetch = global.fetch;
  const sent = [];
  process.env.BOOKINGS_STORE = "postgres";
  global.fetch = async (url, opts) => {
    sent.push({ url, body: JSON.parse(opts.body) });
    return { json: async () => ({ id: "fake" }) };
  };
  try {
    await handleBooking(booking, "re_test", {}, fakeSupabase());
  } finally {
    if (prevStore === undefined) delete process.env.BOOKINGS_STORE;
    else process.env.BOOKINGS_STORE = prevStore;
    global.fetch = prevFetch;
  }
  return sent;
}

test("confirmation email carries a real Reply-To and a /privacy link (A4, UK GDPR Arts.13/14)", async () => {
  const sent = await captureBookingEmails(baseBooking());
  const customer = sent.find((e) => e.body.to === "jane@example.com");
  assert.ok(customer, "a confirmation email is sent to the customer");
  assert.match(customer.body.reply_to, /@intelligentclean\.co\.uk$/); // a real monitored mailbox, not absent
  assert.match(customer.body.html, /href="[^"]*\/privacy"/); // privacy-notice link present
  assert.match(customer.body.html, /privacy notice/i);
});

test("the privacy link is NOT added to the operator email (scope: customer-facing only)", async () => {
  const sent = await captureBookingEmails(baseBooking());
  const operator = sent.find((e) => e.body.to !== "jane@example.com");
  assert.ok(operator, "an operator email is also sent");
  assert.ok(!/privacy notice/i.test(operator.body.html), "the operator email is internal to Mark, no privacy notice");
});

test("a customer-supplied name stays escaped in the confirmation email (no XSS, L-003)", async () => {
  const sent = await captureBookingEmails(baseBooking({ name: "<script>alert(1)</script> Smith" }));
  const customer = sent.find((e) => e.body.to === "jane@example.com");
  assert.ok(!customer.body.html.includes("<script>alert(1)</script>"), "a raw script tag must not survive into the HTML");
  assert.match(customer.body.html, /&lt;script&gt;/);
});

test("privacyNoticeUrl: default origin, and a trailing slash on an injected base is normalised", () => {
  assert.match(privacyNoticeUrl(), /^https:\/\/www\.intelligentclean\.co\.uk\/privacy$/);
  assert.strictEqual(privacyNoticeUrl("https://example.test"), "https://example.test/privacy");
  assert.strictEqual(privacyNoticeUrl("https://example.test/"), "https://example.test/privacy");
});
