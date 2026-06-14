// Slice 5b (D-021) — the Postgres booking store. Pure mappers are tested without
// a database; the async DB calls are driven by a chainable fake client (no
// network), matching the handoff-insert.test.js style. A guarded [integration]
// test (Commit 5) hits the local Docker stack when ICC_SUPABASE_IT=1.

const { test } = require("node:test");
const assert = require("node:assert");

const store = require("../server/netlify/functions/bookingsStore.js");
const {
  mapRecommendedMethod,
  resolvePostcode,
  buildNotes,
  depositFromNotes,
  bookingToJobRow,
  jobRowToAdminRecord,
  insertBooking,
  availabilityFromJobs,
  fetchBookingsFromJobs,
} = store;
const { getSupabaseAdmin, _resetForTest } = require("../server/netlify/functions/supabaseClient.js");

const SAMPLE = {
  name: "Jane Smith",
  phone: "01242 123456",
  email: "jane@example.com",
  address: "12 High St, Cheltenham GL52 1AB",
  postcode: "GL52 1AB",
  date: "2026-07-10",
  start_time: "10:00",
  slots_needed: 3,
  rooms: "Lounge, hall, stairs",
  carpet_types: "Wool, synthetic",
  concerns: "Red wine stain",
  furniture_moving: true,
  pets: false,
  estimated_price: "£475 + VAT",
  deposit: "£57 + VAT",
  recommended_method: "Texatherm low-moisture",
  ai_assessment: "Wool lounge carpet, low-moisture recommended.",
  rams: "Activity: cleaning\\nHazards: slip",
};

// A chainable, thenable fake Supabase client. Every builder method returns the
// builder; awaiting it anywhere in the chain resolves the planned {data,error}.
// `plan` routes by operation: customersUpsert / jobsInsert / jobsUpdate / jobsSelect.
function fakeSupabase(plan = {}) {
  const calls = [];
  function builder(table) {
    const state = { table, op: null };
    const result = () => {
      calls.push(Object.assign({}, state));
      if (state.op === "upsert") return plan.customersUpsert || { data: { id: "cust-1" }, error: null };
      if (state.op === "insert") return plan.jobsInsert || { data: { id: "job-1" }, error: null };
      if (state.op === "update") return plan.jobsUpdate || { data: null, error: null };
      return plan.jobsSelect || { data: [], error: null }; // a read
    };
    const b = {
      upsert(row, opts) { state.op = "upsert"; state.row = row; state.opts = opts; return b; },
      insert(row) { state.op = "insert"; state.row = row; return b; },
      update(obj) { state.op = "update"; state.obj = obj; return b; },
      select(cols) { state.select = cols; return b; },
      eq(c, v) { (state.eq = state.eq || []).push([c, v]); return b; },
      in(c, v) { (state.in = state.in || []).push([c, v]); return b; },
      order(c, o) { state.order = [c, o]; return b; },
      limit(n) { state.limit = n; return b; },
      single() { state.single = true; return b; },
      then(onF, onR) { return Promise.resolve().then(result).then(onF, onR); },
    };
    return b;
  }
  return { from: builder, calls };
}

// --- Pure: bookingToJobRow -------------------------------------------------

test("bookingToJobRow maps the core fields and stamps status 'booked'", () => {
  const row = bookingToJobRow(SAMPLE, { calLink: "https://calendar.google.com/x" });
  assert.strictEqual(row.status, "booked");
  assert.strictEqual(row.address, SAMPLE.address);
  assert.strictEqual(row.slot_date, "2026-07-10");
  assert.strictEqual(row.start_hour, 10);
  assert.strictEqual(row.slots_needed, 3);
  assert.strictEqual(row.furniture_moving, true);
  assert.strictEqual(row.pets, false);
  assert.strictEqual(row.cal_link, "https://calendar.google.com/x");
  assert.strictEqual(row.legacy_blob_id, null);
  // customer_id is NOT set by the pure mapper (insertBooking attaches it).
  assert.ok(!("customer_id" in row));
});

test("bookingToJobRow keeps price_display verbatim and leaves ex-VAT/deposit numerics null", () => {
  const row = bookingToJobRow(SAMPLE, {});
  assert.strictEqual(row.price_display, "£475 + VAT");
  assert.strictEqual(row.estimated_price_ex_vat, null);
  assert.strictEqual(row.deposit_ex_vat, null);
});

test("bookingToJobRow derives out_of_area + surcharge from the postcode (D-011)", () => {
  const core = bookingToJobRow(Object.assign({}, SAMPLE, { postcode: "GL52 1AB" }), {});
  assert.strictEqual(core.out_of_area, false);
  assert.strictEqual(core.out_of_area_surcharge_ex_vat, 0);

  const wider = bookingToJobRow(Object.assign({}, SAMPLE, { postcode: "GL5 4AA", address: "Stroud" }), {});
  assert.strictEqual(wider.out_of_area, true);
  assert.strictEqual(wider.out_of_area_surcharge_ex_vat, 15);
});

test("bookingToJobRow maps the three known methods onto the enum", () => {
  assert.strictEqual(bookingToJobRow(Object.assign({}, SAMPLE, { recommended_method: "Texatherm low-moisture" }), {}).recommended_method, "texatherm_low_moisture");
  assert.strictEqual(bookingToJobRow(Object.assign({}, SAMPLE, { recommended_method: "Texatherm wet extraction" }), {}).recommended_method, "wet_extraction");
  assert.strictEqual(bookingToJobRow(Object.assign({}, SAMPLE, { recommended_method: "combination" }), {}).recommended_method, "combination");
});

test("bookingToJobRow maps an unknown method to null and keeps the raw text in notes", () => {
  const row = bookingToJobRow(Object.assign({}, SAMPLE, { recommended_method: "magic foam" }), {});
  assert.strictEqual(row.recommended_method, null);
  assert.match(row.notes, /Method \(raw\): magic foam/);
});

// --- Pure: recommended_method / postcode / notes ---------------------------

test("mapRecommendedMethod handles synonyms and unknowns", () => {
  assert.strictEqual(mapRecommendedMethod("hot water extraction"), "wet_extraction");
  assert.strictEqual(mapRecommendedMethod("steam clean"), "wet_extraction");
  assert.strictEqual(mapRecommendedMethod("both methods"), "combination");
  assert.strictEqual(mapRecommendedMethod(""), null);
  assert.strictEqual(mapRecommendedMethod(undefined), null);
});

test("resolvePostcode prefers the captured postcode, then the address, then null", () => {
  assert.strictEqual(resolvePostcode({ postcode: "gl52 1ab" }), "GL52 1AB");
  assert.strictEqual(resolvePostcode({ address: "1 High St, Cheltenham GL50 1AA" }), "GL50 1AA");
  assert.strictEqual(resolvePostcode({ address: "no postcode here" }), null);
  assert.strictEqual(resolvePostcode({}), null);
});

test("buildNotes / depositFromNotes round-trip the deposit display", () => {
  const notes = buildNotes({ deposit: "£57 + VAT", recommended_method: "Texatherm low-moisture" }, "texatherm_low_moisture");
  assert.strictEqual(depositFromNotes(notes), "£57 + VAT");
  // missing deposit falls back, and an unmapped method keeps its raw text
  const notes2 = buildNotes({ recommended_method: "magic foam" }, null);
  assert.strictEqual(depositFromNotes(notes2), "To be confirmed");
  assert.match(notes2, /Method \(raw\): magic foam/);
});

// --- Pure: jobRowToAdminRecord ---------------------------------------------

test("jobRowToAdminRecord maps a joined jobs row to the admin record shape", () => {
  const adminRow = jobRowToAdminRecord({
    id: "job-uuid",
    created_at: "2026-06-14T10:00:00+00:00",
    slot_date: "2026-07-10",
    start_hour: 9,
    slots_needed: 2,
    address: "12 High St",
    postcode: "GL52 1AB",
    rooms: "Lounge",
    carpet_types: "Wool",
    concerns: "None",
    furniture_moving: false,
    pets: true,
    recommended_method: "wet_extraction",
    ai_assessment: "fine",
    price_display: "£200 + VAT",
    notes: "Deposit due: £24 + VAT",
    cal_link: "https://calendar.google.com/y",
    customers: { name: "Jane", phone: "01242 1", email: "jane@example.com" },
  });
  assert.strictEqual(adminRow.id, "job-uuid");
  assert.strictEqual(adminRow.name, "Jane");
  assert.strictEqual(adminRow.email, "jane@example.com");
  assert.strictEqual(adminRow.date, "2026-07-10");
  assert.strictEqual(adminRow.start_time, "9:00");
  assert.strictEqual(adminRow.estimated_price, "£200 + VAT");
  assert.strictEqual(adminRow.deposit, "£24 + VAT");
  assert.strictEqual(adminRow.recommended_method, "Texatherm wet extraction");
  assert.strictEqual(adminRow.calLink, "https://calendar.google.com/y");
  assert.strictEqual(adminRow.pets, true);
  // No photo in Postgres -> no image key (buildCard renders "No photo uploaded").
  assert.ok(!("image" in adminRow));
});

// --- Fake client: insertBooking -------------------------------------------

test("insertBooking upserts the customer (no consent cols) then inserts the job", async () => {
  const sb = fakeSupabase();
  const res = await insertBooking(sb, SAMPLE, { calLink: "https://calendar.google.com/z" });
  assert.deepStrictEqual(res, { ok: true, id: "job-1" });

  const upsert = sb.calls.find((c) => c.op === "upsert");
  assert.deepStrictEqual(Object.keys(upsert.row).sort(), ["email", "name", "phone"]);
  assert.deepStrictEqual(upsert.opts, { onConflict: "email" });

  const insert = sb.calls.find((c) => c.op === "insert");
  assert.strictEqual(insert.row.customer_id, "cust-1");
  assert.strictEqual(insert.row.status, "booked");
});

test("insertBooking flags a double-booking (23P01) as conflict:true", async () => {
  const sb = fakeSupabase({ jobsInsert: { data: null, error: { code: "23P01", message: "exclusion" } } });
  const res = await insertBooking(sb, SAMPLE, {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.conflict, true);
});

test("insertBooking reports a non-conflict job error as conflict:false", async () => {
  const sb = fakeSupabase({ jobsInsert: { data: null, error: { code: "23502", message: "not null" } } });
  const res = await insertBooking(sb, SAMPLE, {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.conflict, false);
});

test("insertBooking fails without inserting a job when the customer upsert errors", async () => {
  const sb = fakeSupabase({ customersUpsert: { data: null, error: { code: "XXXXX", message: "down" } } });
  const res = await insertBooking(sb, SAMPLE, {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.conflict, false);
  assert.ok(!sb.calls.some((c) => c.op === "insert"), "job insert must not run after a customer error");
});

// --- Fake client: availability + admin list --------------------------------

test("availabilityFromJobs returns the union of booked hour-slots", async () => {
  const sb = fakeSupabase({
    jobsSelect: { data: [{ start_hour: 10, slots_needed: 2 }, { start_hour: 14, slots_needed: 1 }], error: null },
  });
  const booked = await availabilityFromJobs(sb, "2026-07-10");
  assert.deepStrictEqual(booked.sort((a, b) => a - b), [10, 11, 14]);
});

test("fetchBookingsFromJobs maps rows to admin records and returns [] when not configured", async () => {
  assert.deepStrictEqual(await fetchBookingsFromJobs(null), []);
  const sb = fakeSupabase({
    jobsSelect: { data: [{ id: "j1", slot_date: "2026-07-10", start_hour: 9, slots_needed: 1, price_display: "£90 + VAT", notes: "Deposit due: £9 + VAT", customers: { name: "A", phone: "p", email: "a@x.com" } }], error: null },
  });
  const rows = await fetchBookingsFromJobs(sb);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, "A");
  assert.strictEqual(rows[0].estimated_price, "£90 + VAT");
  assert.strictEqual(rows[0].deposit, "£9 + VAT");
});

// --- Guarded integration: real Supabase (D-010 real services, no mocks) -----
// Runs only when ICC_SUPABASE_IT=1 AND SUPABASE_URL/SERVICE_ROLE_KEY point at a
// reachable instance (the local Docker stack). Self-skips otherwise. Inserts a
// real booking, proves it blocks the slot + reads back in the admin shape, and
// that an overlap is rejected by the DB exclusion constraint. safe-smokes: deletes
// only its own rows (by the test emails), before and after, leaving shared state
// as found. Jobs are deleted before customers (FK on delete restrict).

const IT_DATE = "2026-12-15";
const IT_EMAILS = ["it5b@example.com", "it5b-2@example.com"];
const IT_BOOKING = {
  name: "IT Five-B",
  phone: "01242 000000",
  email: IT_EMAILS[0],
  address: "1 Integration Way, Cheltenham GL52 1AB",
  postcode: "GL52 1AB",
  date: IT_DATE,
  start_time: "10:00",
  slots_needed: 2,
  rooms: "Lounge",
  carpet_types: "Wool",
  concerns: "none",
  furniture_moving: false,
  pets: false,
  estimated_price: "£200 + VAT",
  deposit: "£24 + VAT",
  recommended_method: "Texatherm low-moisture",
  ai_assessment: "ok",
  rams: "Activity: cleaning",
};

async function cleanupIT(sb) {
  const { data: custs } = await sb.from("customers").select("id").in("email", IT_EMAILS);
  const ids = (custs || []).map((c) => c.id);
  if (ids.length) {
    await sb.from("jobs").delete().in("customer_id", ids);
    await sb.from("customers").delete().in("id", ids);
  }
}

test("[integration] insertBooking persists, blocks the slot, reads back, and rejects an overlap", {
  skip: process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run",
}, async () => {
  _resetForTest();
  const sb = getSupabaseAdmin();
  assert.ok(sb, "expected a Supabase client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");

  await cleanupIT(sb); // clear any leftovers from a crashed prior run
  try {
    const res = await insertBooking(sb, IT_BOOKING, { calLink: "https://calendar.google.com/it" });
    assert.strictEqual(res.ok, true, res.error && res.error.message);
    assert.ok(res.id);

    // the job persisted as 'booked', core postcode -> not out of area
    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .select("status,start_hour,slots_needed,out_of_area,postcode")
      .eq("id", res.id)
      .single();
    assert.strictEqual(jobErr, null, jobErr && jobErr.message);
    assert.strictEqual(job.status, "booked");
    assert.strictEqual(job.start_hour, 10);
    assert.strictEqual(job.out_of_area, false);

    // availability now reports the booked block [10,11]
    const booked = await availabilityFromJobs(sb, IT_DATE);
    assert.deepStrictEqual(booked.slice().sort((a, b) => a - b), [10, 11]);

    // the admin list includes it in the flat record shape
    const admin = await fetchBookingsFromJobs(sb);
    const mine = admin.find((b) => b.id === res.id);
    assert.ok(mine, "the new booking appears in the admin list");
    assert.strictEqual(mine.name, "IT Five-B");
    assert.strictEqual(mine.start_time, "10:00");
    assert.strictEqual(mine.estimated_price, "£200 + VAT");
    assert.strictEqual(mine.deposit, "£24 + VAT");

    // an overlapping booking (11..13 vs the booked 10..12) is rejected by the
    // exclusion constraint -> conflict:true (the concurrency-safe double-book guard)
    const overlap = await insertBooking(
      sb,
      Object.assign({}, IT_BOOKING, { email: IT_EMAILS[1], start_time: "11:00", slots_needed: 2 }),
      {}
    );
    assert.strictEqual(overlap.ok, false);
    assert.strictEqual(overlap.conflict, true);
  } finally {
    await cleanupIT(sb);
    _resetForTest();
  }
});
