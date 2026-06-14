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
// estimated_price_ex_vat / deposit_ex_vat stay NULL: the payload carries only a
// display string ("£475 + VAT") and the deposit is an inc-VAT figure, so parsing
// them into ex-VAT columns would store wrong-semantics numbers that later feed
// invoicing. price_display is the verbatim authoritative figure.
// TODO(slice5x/structured-pricing): populate the ex-VAT / deposit numerics once
// the booking carries structured line items (e.g. via /api/v1/quote).
function bookingToJobRow(booking, opts) {
  const b = booking || {};
  const o = opts || {};
  const postcode = resolvePostcode(b);
  const outOfArea = serviceArea.isOutOfArea(postcode || "");
  const startHour = parseInt(String(b.start_time || "").split(":")[0], 10);
  const method = mapRecommendedMethod(b.recommended_method);
  return {
    status: "booked",
    address: b.address ?? null,
    postcode: postcode, // may be null (column is nullable, Slice 5b)
    out_of_area: outOfArea,
    slot_date: b.date ?? null,
    start_hour: Number.isFinite(startHour) ? startHour : null,
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
    out_of_area_surcharge_ex_vat: outOfArea ? serviceArea.out_of_area_surcharge_ex_vat : 0,
    deposit_ex_vat: null,
    price_display: b.estimated_price ?? null,
    notes: buildNotes(b, method),
    cal_link: o.calLink ?? null,
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
    name: cust.name ?? null,
    phone: cust.phone ?? null,
    email: cust.email ?? null,
    address: r.address ?? null,
    postcode: r.postcode ?? null,
    date: r.slot_date ?? null,
    start_time: r.start_hour != null ? `${r.start_hour}:00` : null,
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

  const row = Object.assign(bookingToJobRow(booking, { calLink: o.calLink }), { customer_id: cust.id });
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

// The booked hour-slots on a date: the union of [start_hour, start_hour+slots) for
// COMMITTED jobs (booked/in_progress). The grid/window logic stays in
// chat.js checkAvailability (shared with the Blobs path); this returns the
// equivalent of the Blobs `bookedSlots` array.
async function availabilityFromJobs(supabase, date) {
  const { data, error } = await supabase
    .from("jobs")
    .select("start_hour,slots_needed")
    .eq("slot_date", date)
    .in("status", ["booked", "in_progress"]);
  if (error) throw new Error(error.message);
  const booked = [];
  for (const j of data || []) {
    for (let h = j.start_hour; h < j.start_hour + j.slots_needed; h++) booked.push(h);
  }
  return booked;
}

// All bookings for the admin dashboard, newest first, mapped to the flat record
// shape (jobRowToAdminRecord). supabase === null -> not configured (caller falls
// back to Blobs-only). Returns a plain array.
async function fetchBookingsFromJobs(supabase, limit = 500) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id,created_at,slot_date,start_hour,slots_needed,address,postcode,rooms,carpet_types,concerns,furniture_moving,pets,recommended_method,ai_assessment,price_display,notes,cal_link,customers(name,phone,email)"
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
