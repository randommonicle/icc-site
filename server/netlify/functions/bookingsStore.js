// Postgres booking store (Slice 5b, D-021).
//
// The Supabase-backed successor to the Phase 0 Netlify Blobs booking path. Pure
// mappers (booking <-> jobs row, the recommended_method enum, postcode resolve)
// are separated from the three async DB calls (insert a booking, derive
// availability, list for admin), exactly like the supabaseClient / shared
// messages / handoffs split, so the mapping is unit-tested without a database and
// the DB calls are driven by a fake client or the real local stack (D-010).
//
// Nothing here runs until chat.js / bookings.js call it under the BOOKINGS_STORE
// flag (Slice 5b commits 3-4); on its own this module is a production no-op.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const serviceArea = require("../../../shared/config/serviceArea.js");

// --- Pure mappers ----------------------------------------------------------

// The assistant emits recommended_method as one of three known phrases (system
// prompt): "Texatherm low-moisture" / "Texatherm wet extraction" / "combination".
// Map them onto the clean_method enum. A tampered/unknown value maps to null and
// the raw text is preserved in notes (see buildNotes) so nothing is silently lost.
const METHOD_MATCHERS = [
  { re: /low.?moisture/i, code: "texatherm_low_moisture" },
  { re: /wet.?extraction|hot.?water|steam/i, code: "wet_extraction" },
  { re: /combination|both/i, code: "combination" },
];
const METHOD_DISPLAY = {
  texatherm_low_moisture: "Texatherm low-moisture",
  wet_extraction: "Texatherm wet extraction",
  combination: "combination",
};

function mapRecommendedMethod(text) {
  const s = String(text || "");
  for (const m of METHOD_MATCHERS) if (m.re.test(s)) return m.code;
  return null;
}

function methodDisplay(code) {
  return METHOD_DISPLAY[code] || null;
}

// Resolve a postcode for the jobs row + the D-011 out-of-area check: use the
// captured postcode, else extract a UK postcode from the address, else null.
// jobs.postcode is nullable (Slice 5b migration); isOutOfArea(null/"") returns
// true, so a missing postcode errs toward charging the surcharge.
const UK_POSTCODE_RE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i;
function resolvePostcode(booking) {
  const b = booking || {};
  if (typeof b.postcode === "string" && b.postcode.trim()) return b.postcode.trim().toUpperCase();
  const m = String(b.address || "").match(UK_POSTCODE_RE);
  return m ? m[0].replace(/\s+/g, " ").trim().toUpperCase() : null;
}

// notes carries the human deposit display (no deposit_display column yet) and, if
// the method did not map, the raw method text — both recovered for the admin view.
function buildNotes(booking, methodCode) {
  const b = booking || {};
  const deposit = typeof b.deposit === "string" && b.deposit.trim() ? b.deposit.trim() : "To be confirmed";
  const lines = [`Deposit due: ${deposit}`];
  if (methodCode === null && b.recommended_method) lines.push(`Method (raw): ${String(b.recommended_method)}`);
  return lines.join("\n");
}

function depositFromNotes(notes) {
  const m = String(notes || "").match(/^Deposit due:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Map a validated booking (the BOOKING_READY payload) to a `jobs` insert row.
// customer_id is added by insertBooking after the customers upsert (kept out here
// so the mapper is pure). status is 'booked' — a confirmed booking holds the slot.
// estimated_price_ex_vat / deposit_ex_vat stay NULL (legacy column names; Mark is
// not VAT-registered, so there is no VAT component): the payload carries only a
// display string ("£475") and price_display is the verbatim authoritative figure.
// The numeric columns would be populated from structured line items.
// TODO(slice5x/structured-pricing): populate the ex-VAT / deposit numerics once
// the booking carries structured line items (e.g. via /api/v1/quote).
function bookingToJobRow(booking, opts) {
  const b = booking || {};
  const o = opts || {};
  const postcode = resolvePostcode(b);
  const outOfArea = serviceArea.isOutOfArea(postcode || "");
  // D-027: persist the half-hour start. start_time is "HH:MM"; only :00 and :30
  // occur in the offered cadence, and the DB checks start_minute IN (0,30) as the
  // backstop (validateBooking is the real gate). span_minutes is a generated column
  // that carries the minute-precise range for the double-booking guard, so it is not
  // written here. availabilityFromJobs derives the same minute-precise ranges from
  // these fields, so the offered grid agrees with the DB (chat.js checkAvailability).
  const [rawHour, rawMinute] = String(b.start_time || "").split(":");
  const startHour = parseInt(rawHour, 10);
  const parsedMinute = parseInt(rawMinute, 10);
  const startMinute = Number.isFinite(parsedMinute) ? parsedMinute : 0;
  const method = mapRecommendedMethod(b.recommended_method);
  return {
    status: "booked",
    address: b.address ?? null,
    postcode: postcode, // may be null (column is nullable, Slice 5b)
    out_of_area: outOfArea,
    slot_date: b.date ?? null,
    start_hour: Number.isFinite(startHour) ? startHour : null,
    start_minute: startMinute,
    slots_needed: Number(b.slots_needed),
    rooms: b.rooms ?? null,
    carpet_types: b.carpet_types ?? null,
    concerns: b.concerns ?? null,
    furniture_moving: !!b.furniture_moving,
    pets: !!b.pets,
    recommended_method: method, // enum value or null
    ai_assessment: b.ai_assessment ?? null,
    rams: b.rams ?? null,
    estimated_price_ex_vat: null,
    out_of_area_surcharge_ex_vat: outOfArea ? serviceArea.out_of_area_surcharge : 0, // legacy column name; flat surcharge, no VAT
    deposit_ex_vat: null,
    // TODO(D-027/saturday-premium): when the booking date is a Saturday, apply the
    // weekend premium (tradingHours.weekend_premium) to the customer price here once
    // Mark sets the figure. Deferred by D-027 — the hook returns null today, so no
    // price is changed; wiring the premium into quotes is explicitly out of scope.
    price_display: b.estimated_price ?? null,
    notes: buildNotes(b, method),
    cal_link: o.calLink ?? null,
    // D-027 provisional: confirmation_state and the stored (hashed) email action token
    // are decided/generated by handleBooking (impure) and passed in via opts. A normal
    // booking defaults to auto_confirmed with null token fields; a late-finish booking
    // arrives as awaiting_operator with a token hash + expiry. operator_decided_at is set
    // later, when Mark accepts/declines.
    confirmation_state: o.confirmationState || "auto_confirmed",
    operator_action_token_hash: o.actionTokenHash ?? null,
    operator_action_token_expires_at: o.actionTokenExpiresAt ?? null,
    legacy_blob_id: null,
  };
}

// Map a `jobs` row joined to its customer back to the flat record shape the admin
// dashboard renders (admin.html buildCard / downloadXML / updateStats). Photos are
// not stored in Postgres (job_photos wants a Storage path; bucket not stood up),
// so no `image` key — buildCard renders "No photo uploaded". Mark still receives
// the photo by email. TODO(slice5x/photos): surface job_photos here once Storage
// is wired.
function jobRowToAdminRecord(row) {
  const r = row || {};
  const cust = r.customers || {};
  return {
    id: r.id,
    job_status: r.status ?? null,   // real jobs.status (enquiry/booked/.../completed) — drives the review action (D-025)
    confirmation_state: r.confirmation_state ?? null, // D-027: auto_confirmed | awaiting_operator | operator_confirmed | operator_declined
    operator_decided_at: r.operator_decided_at ?? null, // when Mark accepted/declined a provisional booking
    name: cust.name ?? null,
    phone: cust.phone ?? null,
    email: cust.email ?? null,
    address: r.address ?? null,
    postcode: r.postcode ?? null,
    date: r.slot_date ?? null,
    start_time: r.start_hour != null ? `${r.start_hour}:${String(r.start_minute || 0).padStart(2, "0")}` : null,
    slots_needed: r.slots_needed ?? null,
    rooms: r.rooms ?? null,
    carpet_types: r.carpet_types ?? null,
    concerns: r.concerns ?? null,
    furniture_moving: !!r.furniture_moving,
    pets: !!r.pets,
    recommended_method: methodDisplay(r.recommended_method),
    ai_assessment: r.ai_assessment ?? null,
    estimated_price: r.price_display ?? null,
    deposit: depositFromNotes(r.notes),
    calLink: r.cal_link ?? null,
    created_at: r.created_at ?? null,
  };
}

// --- Async DB calls (service-role client passed in) ------------------------

// Persist a confirmed booking: upsert the customer by email (dedupe; only
// name/phone/email — never the consent columns), then insert the jobs row. The
// double-booking guard is the DB exclusion constraint, so a slot clash surfaces as
// Postgres 23P01 (exclusion_violation) and is reported as conflict:true. A rare
// orphan customer (job insert fails after the upsert) is benign — a real prospect,
// holding no slot, deduped by the unique email on the next attempt.
// Returns: {ok:true,id} | {ok:false,conflict:true,error} | {ok:false,conflict:false,error}.
async function insertBooking(supabase, booking, opts) {
  const o = opts || {};
  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .upsert(
      { name: booking.name, phone: booking.phone, email: booking.email },
      { onConflict: "email" }
    )
    .select("id")
    .single();
  if (custErr || !cust) return { ok: false, conflict: false, error: custErr || new Error("customer upsert returned no row") };

  const row = Object.assign(bookingToJobRow(booking, o), { customer_id: cust.id });
  const { data: job, error: jobErr } = await supabase.from("jobs").insert(row).select("id").single();
  if (jobErr) return { ok: false, conflict: jobErr.code === "23P01", error: jobErr };
  return { ok: true, id: job.id };
}

// Best-effort: stamp the Google Calendar link on a job after the row exists
// (mirrors the Blobs path's second write). Never throws — the booking is already
// safe and emailed; a failed cal_link update is logged by the caller.
async function setJobCalLink(supabase, jobId, calLink) {
  return supabase.from("jobs").update({ cal_link: calLink }).eq("id", jobId);
}

// The booked MINUTE ranges on a date: [start, start+slots*60) in minutes since
// midnight for COMMITTED jobs (booked/in_progress), where start = start_hour*60 +
// start_minute. Minute-precise so a :30 start that overruns the next hour is judged
// correctly (D-027) — this mirrors the DB span_minutes exclusion (migration
// 20260901133038). chat.js checkAvailability overlaps the offered grid against these.
// start_minute defaults to 0 for legacy whole-hour rows.
async function availabilityFromJobs(supabase, date) {
  const { data, error } = await supabase
    .from("jobs")
    .select("start_hour,start_minute,slots_needed")
    .eq("slot_date", date)
    .in("status", ["booked", "in_progress"]);
  if (error) throw new Error(error.message);
  return (data || []).map((j) => {
    const start = j.start_hour * 60 + (j.start_minute || 0);
    return { start, end: start + j.slots_needed * 60 };
  });
}

// All bookings for the admin dashboard, newest first, mapped to the flat record
// shape (jobRowToAdminRecord). supabase === null -> not configured (caller falls
// back to Blobs-only). Returns a plain array.
async function fetchBookingsFromJobs(supabase, limit = 500) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id,created_at,status,confirmation_state,operator_decided_at,slot_date,start_hour,start_minute,slots_needed,address,postcode,rooms,carpet_types,concerns,furniture_moving,pets,recommended_method,ai_assessment,price_display,notes,cal_link,customers(name,phone,email)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(jobRowToAdminRecord);
}

module.exports = {
  mapRecommendedMethod,
  methodDisplay,
  resolvePostcode,
  buildNotes,
  depositFromNotes,
  bookingToJobRow,
  jobRowToAdminRecord,
  insertBooking,
  setJobCalLink,
  availabilityFromJobs,
  fetchBookingsFromJobs,
};
