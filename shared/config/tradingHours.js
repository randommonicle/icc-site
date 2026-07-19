// Single source for the trading day (D-006 pattern, like pricing.js and
// serviceArea.js). CommonJS so the Netlify functions and `node --test` consume it
// directly; the Astro pages import it through the Vite commonjsOptions extension
// in site/astro.config.mjs (L-017).
//
// Why this file exists. The trading day was stated in five places and three of
// them disagreed. The assistant's prompt advertised "8am to 6pm" with bookable
// slots to 5pm, the site and the LocalBusiness JSON-LD said 08:00-18:00, and the
// live Postgres validation (D-021, enabled 14 June 2026) rejected anything
// starting after 15:00. A customer could be offered 4pm, complete the whole
// consultation, and be refused at confirm_booking with a 400. The Google Business
// Profile spec says 09:00-16:30, which matches the database, so the database and
// the GBP are right and the prose was the outlier.
//
// The hours are business-stable, so deriving the prompt's HOURS lines from here
// keeps the cached static prefix byte-stable between calls (L-002).

// The working day. `latest_start_hour` is the last hour a job may START; a job
// must be finished by `latest_end_hour`. `closes` is the public-facing close and
// carries the wrap-up buffer after the last job ends, which is why it is 16:30
// rather than 16:00.
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const earliest_start_hour = 9;
const latest_start_hour = 15;
const latest_end_hour = 16;
const max_slots = 7;
const opens = "09:00";
const closes = "16:30";

// The Phase 0 Netlify Blobs grid ran a longer day (starts 9..17, end by 18, up to
// 9 slots). Kept only so the BOOKINGS_STORE=blobs rollback path stays byte-identical
// to its pre-Slice-5b behaviour; it is not the live day. Delete with the Blobs
// store once the legacy test bookings are gone.
const legacy_blobs = { latest_start_hour: 17, latest_end_hour: 18, max_slots: 9 };

// "9am", "12pm", "4.30pm" — the voice the assistant and the site both use.
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

// "Monday to Saturday" — assumes the days list is contiguous, which it is.
function daysPhrase() {
  return `${days[0]} to ${days[days.length - 1]}`;
}

// "Monday to Saturday, 9am to 4.30pm" — for prose on the site and in the prompt.
function hoursPhrase() {
  const o = parseClock(opens);
  const c = parseClock(closes);
  return `${daysPhrase()}, ${formatHour(o.hour, o.minute)} to ${formatHour(c.hour, c.minute)}`;
}

// Every hour a job may start, as the assistant should offer them.
function startHours() {
  const out = [];
  for (let h = earliest_start_hour; h <= latest_start_hour; h++) out.push(h);
  return out;
}

// "9am, 10am, 11am, 12pm, 1pm, 2pm, 3pm"
function slotsPhrase() {
  return startHours().map((h) => formatHour(h)).join(", ");
}

// The validateBooking options for the live Postgres store, so the prompt and the
// gate can never drift apart again: both read these numbers.
function bookingBounds() {
  return {
    latestStartHour: latest_start_hour,
    latestEndHour: latest_end_hour,
    maxSlots: max_slots,
  };
}

// The HOURS lines of the assistant system prompt.
function hoursBlock() {
  return `Hours: ${hoursPhrase()}
Available slots: ${slotsPhrase()} (${daysPhrase()}). The last job of the day starts at ${formatHour(latest_start_hour)} and every job must be finished by ${formatHour(latest_end_hour)}, so never offer a later start than ${formatHour(latest_start_hour)}.`;
}

// schema.org OpeningHoursSpecification for the LocalBusiness JSON-LD.
function openingHoursSpecification() {
  return [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: days.slice(),
    opens: opens,
    closes: closes,
  }];
}

module.exports = {
  days,
  earliest_start_hour,
  latest_start_hour,
  latest_end_hour,
  max_slots,
  opens,
  closes,
  legacy_blobs,
  formatHour,
  daysPhrase,
  hoursPhrase,
  startHours,
  slotsPhrase,
  bookingBounds,
  hoursBlock,
  openingHoursSpecification,
};
