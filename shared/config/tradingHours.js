// Single source for the trading day (D-006 pattern, like pricing.js and
// serviceArea.js). CommonJS so the Netlify functions and `node --test` consume it
// directly; the Astro pages import it through the Vite commonjsOptions extension
// in site/astro.config.mjs (L-017).
//
// D-027 (Mark, 24 August 2026) — the trading day is now PER-DAY and shorter, and
// supersedes the single 09:00-16:30 all-days model this file used to hold:
//   - Each open weekday has its OWN earliest start (see earliest_start below).
//   - 1pm is the LAST time a job may START on any trading day. The finish is a soft
//     close: it follows from how long the job takes, not a fixed clock hour.
//   - Sunday is closed.
//   - Saturday carries a weekend premium whose FIGURE IS NOT SET yet (weekend_premium
//     below; the application point is marked TODO(D-027/saturday-premium)).
//
// The F2 single-source rule is the whole point of this file: whatever the booking
// engine ACCEPTS is exactly what the assistant may OFFER and the site may ADVERTISE,
// so they can never drift. Everything downstream derives from the one per-day table
// here — the offered grid (offeredStartTimes), the acceptance window (startWindowFor,
// read by validateBooking), the assistant prompt (hoursBlock), the contact page
// (hoursLines) and the LocalBusiness JSON-LD (openingHoursSpecification).
//
// The hours are business-stable, so deriving the prompt's HOURS lines from here
// keeps the cached static prefix byte-stable between calls (L-002); a change here is
// a one-time cache re-warm.

// Days the business is open, in order. Sunday is absent, i.e. closed (D-027).
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The whole week indexed by Date.getDay() (0 = Sunday), so a booking date maps to
// its day name without any timezone-sensitive date formatting.
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// THE per-day table (D-027): each open day's EARLIEST start, as "HH:MM". A day that
// is absent here (Sunday) is closed. Change a time here and the prompt, the offered
// grid, the acceptance gate, the contact page and the JSON-LD all move together.
const earliest_start = {
  Monday: "09:30",
  Tuesday: "10:30",
  Wednesday: "09:30",
  Thursday: "10:00",
  Friday: "09:30",
  Saturday: "09:30",
};

// 1pm is the LAST time a job may start on ANY trading day (D-027). One constant, so
// the cadence generator and the acceptance gate cannot disagree about the last start.
const last_start = "13:00";

// The AUTO-CONFIRM line (D-027; Ben 2026-09-01). A booking whose FINISH (start +
// slots*60) is at or before this time auto-confirms as today; a LATER finish is still
// taken and holds the slot, but is held PROVISIONAL for Mark to accept (the provisional
// slice). This is a FINISH time, distinct from last_start (a start time) and from
// jsonld_close_job_hours (the advertised close). It is set to coincide with the
// advertised close (both 3pm) so the site never advertises a slot it would not auto-take,
// yet the two stay SEPARATE constants — a coherence test asserts auto_confirm_by sits
// within [earliest finish from last_start, advertised close].
const auto_confirm_by = "15:00";

// Offered-slot cadence, encoded in ONE place so it is trivially changeable (a
// main-session assumption under D-027): the day's earliest start, then hourly, and
// ALWAYS 1pm as the final start. So Mon/Wed/Fri/Sat = 09:30, 10:30, 11:30, 12:30,
// 1pm; Tue = 10:30, 11:30, 12:30, 1pm; Thu = 10:00, 11:00, 12:00, 1pm. Change the
// step (or last_start) and offeredStartTimes below regenerates every day's grid.
const slot_step_minutes = 60;

// Saturday weekend premium (D-027). Accepted in principle, but the FIGURE IS NOT
// SET, so this is a per-day hook defaulting to no premium (null). Nothing reads it
// to change a price yet; the point at which a premium would be applied is marked
// TODO(D-027/saturday-premium) in the booking/quote path. Set a value here (and wire
// that point) once Mark confirms the figure — see DECISIONS.md D-027.
const weekend_premium = {
  Saturday: null, // null = no premium applied yet
};

// Payload sanity cap on a single booking's length, in one-hour slots. This is NOT a
// clock constraint (the close is soft under D-027); it is an anti-abuse bound on
// slots_needed so a tampered payload cannot claim an absurd job length.
const max_slots = 7;

// Phase 0 Netlify Blobs grid parameters, kept ONLY so the BOOKINGS_STORE=blobs
// slot-occupancy mechanics stay byte-identical to their pre-Slice-5b write behaviour
// (the slot cap on that path). NB the trading WINDOW — which starts are offered and
// accepted — is now the per-day D-027 table above for EVERY store; legacy_blobs no
// longer governs the hours, only the Blobs slot cap. Delete with the Blobs store.
const legacy_blobs = { latest_start_hour: 17, latest_end_hour: 18, max_slots: 9 };

// The public/Google (JSON-LD) closing time is a MODELLING choice, not the soft
// operational close (D-027): the 1pm last start plus a typical job length. Two hours
// gives a 15:00 (3pm) advertised close (Ben 2026-09-01: "the site to say until 3"),
// which deliberately coincides with auto_confirm_by so a job finishing past the
// advertised close is exactly the one that needs Mark's accept. Public schedule only;
// used by openingHoursSpecification().
const jsonld_close_job_hours = 2;

// "9am", "12pm", "4.30pm", "1pm" — the voice the assistant and the site both use.
function formatHour(hour, minute) {
  const m = minute || 0;
  const suffix = hour < 12 ? "am" : "pm";
  let h = hour % 12;
  if (h === 0) h = 12;
  return m ? `${h}.${String(m).padStart(2, "0")}${suffix}` : `${h}${suffix}`;
}

function parseClock(clock) {
  const [h, m] = String(clock).split(":").map(Number);
  return { hour: h, minute: m };
}

// Minutes since midnight for an "HH:MM" clock, so times that carry minutes (09:30)
// can be compared and stepped without float hours.
function clockToMinutes(clock) {
  const { hour, minute } = parseClock(clock);
  return hour * 60 + (minute || 0);
}

// Minutes since midnight back to a zero-padded "HH:MM".
function minutesToClock(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "9.30am", "1pm" — format an "HH:MM" clock the way the business speaks.
function formatClock(clock) {
  const { hour, minute } = parseClock(clock);
  return formatHour(hour, minute);
}

// The day name for a Date (or a raw Date.getDay() index 0..6).
function dayNameOf(dateOrIndex) {
  const idx = typeof dateOrIndex === "number" ? dateOrIndex : dateOrIndex.getDay();
  return WEEKDAY_NAMES[idx];
}

// Is the business open on this day name?
function isOpenOn(dayName) {
  return Object.prototype.hasOwnProperty.call(earliest_start, dayName);
}

// "Monday to Saturday" — the open days are contiguous, so this reads naturally.
function daysPhrase() {
  return `${days[0]} to ${days[days.length - 1]}`;
}

// The start times OFFERED on a given day (D-027 cadence): the earliest start, then
// hourly, and always 1pm as the final start. Returns zero-padded "HH:MM" strings, or
// [] for a closed day. THE single source for what the assistant offers and what the
// availability grid shows, so an offered start can never be one the gate rejects.
function offeredStartTimes(dayName) {
  if (!isOpenOn(dayName)) return [];
  const startMin = clockToMinutes(earliest_start[dayName]);
  const lastMin = clockToMinutes(last_start);
  const mins = [];
  for (let m = startMin; m < lastMin; m += slot_step_minutes) mins.push(m);
  mins.push(lastMin); // 1pm is always the final start
  const seen = new Set();
  const out = [];
  for (const m of mins) {
    if (m > lastMin || seen.has(m)) continue; // never past 1pm; de-dupe if earliest === 1pm
    seen.add(m);
    out.push(minutesToClock(m));
  }
  return out;
}

// The acceptance window for a given day, in minutes since midnight: the earliest
// start and the shared 1pm last start. null when the day is closed. validateBooking
// reads THIS (the same table the offered grid uses), so every offered start is
// acceptable and no hour is re-hardcoded in the gate.
function startWindowFor(dayName) {
  if (!isOpenOn(dayName)) return null;
  return {
    earliestMinutes: clockToMinutes(earliest_start[dayName]),
    lastStartMinutes: clockToMinutes(last_start),
  };
}

// The Saturday premium figure for a day, or null when none applies (D-027: figure
// not set, so this returns null for every day today). Kept so the future quote path
// has one accessor to read; see TODO(D-027/saturday-premium).
function weekendPremiumFor(dayName) {
  return Object.prototype.hasOwnProperty.call(weekend_premium, dayName)
    ? weekend_premium[dayName]
    : null;
}

// The auto-confirm line in minutes since midnight (D-027): a booking whose finish is at
// or before this auto-confirms; a later finish holds provisional for Mark. The booking
// path computes finish = start_hour*60 + start_minute + slots_needed*60 and compares.
function autoConfirmByMinutes() {
  return clockToMinutes(auto_confirm_by);
}

// validateBooking options (chat.js). The per-day WINDOW is read from this module by
// the gate itself (startWindowFor), so this carries only the payload slot cap and
// re-hardcodes no hour. Passing it keeps the prompt and the gate reading the one
// source (F2).
function bookingBounds() {
  return { maxSlots: max_slots };
}

// The HOURS lines of the assistant system prompt. States that start times are
// per-day, that 1pm is the last start on any day with a soft finish, and lists the
// exact offered start times for each day. Built from the per-day table so the prompt
// can never advertise a start the booking gate would reject (F2).
function hoursBlock() {
  const perDay = days
    .map((d) => `${d}: ${offeredStartTimes(d).map(formatClock).join(", ")}`)
    .join("\n");
  return `Hours: open ${daysPhrase()}, closed Sunday. The available start times depend on the day and are listed below. ${formatClock(last_start)} is the LAST time a job may start on any day; there is no fixed closing time, the finish follows from how long the job takes. Never offer a start earlier than a day's first listed time, and never offer a start later than ${formatClock(last_start)}.
Available start times by day:
${perDay}`;
}

// Per-day operating hours for the contact page, honest to D-027: each open day's
// first appointment time, and Sunday closed. Derived from the table so the page
// cannot drift from the engine. Pair with lastBookingPhrase() for the 1pm note.
function hoursLines() {
  const lines = days.map((d) => `${d}: from ${formatClock(earliest_start[d])}`);
  lines.push("Sunday: closed");
  return lines;
}

// One-line note stating the shared 1pm last start and the soft finish, for the
// contact page and anywhere prose needs it.
function lastBookingPhrase() {
  return `Last appointment starts at ${formatClock(last_start)}; the finish time depends on the length of the job.`;
}

// schema.org OpeningHoursSpecification for the LocalBusiness JSON-LD (BaseLayout).
// Per-day (D-027): one entry per open day, Sunday absent. `opens` is that day's
// earliest start. `closes` is the PUBLIC-SCHEDULE modelling choice (jsonld_close_job_hours
// above), the 1pm last start plus a typical job length, NOT the soft operational
// close. A fresh object each call so a caller mutating it cannot corrupt the config.
function openingHoursSpecification() {
  const closes = minutesToClock(clockToMinutes(last_start) + jsonld_close_job_hours * 60);
  return days.map((d) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [d],
    opens: earliest_start[d],
    closes: closes,
  }));
}

module.exports = {
  days,
  earliest_start,
  last_start,
  auto_confirm_by,
  slot_step_minutes,
  weekend_premium,
  max_slots,
  legacy_blobs,
  jsonld_close_job_hours,
  formatHour,
  parseClock,
  clockToMinutes,
  minutesToClock,
  formatClock,
  dayNameOf,
  isOpenOn,
  daysPhrase,
  offeredStartTimes,
  startWindowFor,
  weekendPremiumFor,
  autoConfirmByMinutes,
  bookingBounds,
  hoursBlock,
  hoursLines,
  lastBookingPhrase,
  openingHoursSpecification,
};
