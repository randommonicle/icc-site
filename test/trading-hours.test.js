// Guard: the trading day must mean the same thing everywhere it is stated.
//
// This exists because it did not. The assistant's prompt advertised "8am to 6pm"
// with bookable slots to 5pm, the contact page and the LocalBusiness JSON-LD said
// 08:00-18:00, and the live Postgres validation (D-021) rejected any start after
// 15:00. The failure was invisible until the last step: a customer could be offered
// 4pm, complete the whole consultation, and be refused at confirm_booking with a 400.
//
// The rule these tests encode (F2): whatever the booking engine will actually accept
// is what the assistant is allowed to offer and what the site is allowed to advertise.
//
// D-027 (Mark, 24 August 2026) made the day PER-DAY: each open weekday has its own
// earliest start, 1pm is the last start on ANY day (the finish is soft, no hard
// close), and Sunday is closed. These tests assert the per-day invariants and that
// the prompt, the site and the JSON-LD all still derive from the one source.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const tradingHours = require("../shared/config/tradingHours.js");

const repoRoot = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");

// The per-day facts from D-027, restated here so a drift in the config is caught.
const EXPECTED_EARLIEST = {
  Monday: "09:30",
  Tuesday: "10:30",
  Wednesday: "09:30",
  Thursday: "10:00",
  Friday: "09:30",
  Saturday: "09:30",
};
const EXPECTED_OFFERED = {
  Monday: ["09:30", "10:30", "11:30", "12:30", "13:00"],
  Tuesday: ["10:30", "11:30", "12:30", "13:00"],
  Wednesday: ["09:30", "10:30", "11:30", "12:30", "13:00"],
  Thursday: ["10:00", "11:00", "12:00", "13:00"],
  Friday: ["09:30", "10:30", "11:30", "12:30", "13:00"],
  Saturday: ["09:30", "10:30", "11:30", "12:30", "13:00"],
};

test("each open day has its D-027 earliest start; Sunday is closed", () => {
  assert.deepStrictEqual(tradingHours.days, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  for (const [day, clock] of Object.entries(EXPECTED_EARLIEST)) {
    assert.strictEqual(tradingHours.earliest_start[day], clock, `${day} earliest start`);
    assert.ok(tradingHours.isOpenOn(day), `${day} must be open`);
  }
  assert.ok(!tradingHours.isOpenOn("Sunday"), "Sunday must be closed");
  assert.strictEqual(tradingHours.startWindowFor("Sunday"), null, "Sunday has no start window");
  assert.deepStrictEqual(tradingHours.offeredStartTimes("Sunday"), [], "Sunday offers no slots");
});

test("the offered start times per day are the D-027 cadence", () => {
  for (const [day, expected] of Object.entries(EXPECTED_OFFERED)) {
    assert.deepStrictEqual(tradingHours.offeredStartTimes(day), expected, `${day} offered slots`);
  }
});

// The red-prover the task requires: 1pm is the last start on EVERY trading day and
// nothing later is ever offered. Break the config to offer a 14:00 start and this
// test goes red (last-offered assertion, and the <= 1pm bound).
test("1pm is the last start on every trading day and nothing later is offered", () => {
  const lastStartMin = tradingHours.clockToMinutes(tradingHours.last_start);
  assert.strictEqual(tradingHours.last_start, "13:00");
  for (const day of tradingHours.days) {
    const offered = tradingHours.offeredStartTimes(day);
    assert.ok(offered.length > 0, `${day} must offer at least one start`);
    assert.strictEqual(offered[0], EXPECTED_EARLIEST[day], `${day} first offered start is its earliest`);
    assert.strictEqual(offered[offered.length - 1], "13:00", `${day} last offered start must be 1pm`);
    for (const t of offered) {
      assert.ok(
        tradingHours.clockToMinutes(t) <= lastStartMin,
        `${day} offers ${t}, which is after the 1pm last start`
      );
    }
  }
});

test("every offered start sits inside that day's acceptance window (offered ⊆ accepted, F2)", () => {
  for (const day of tradingHours.days) {
    const w = tradingHours.startWindowFor(day);
    assert.ok(w, `${day} must have a window`);
    assert.strictEqual(w.lastStartMinutes, tradingHours.clockToMinutes("13:00"), `${day} last start is 1pm`);
    assert.strictEqual(w.earliestMinutes, tradingHours.clockToMinutes(EXPECTED_EARLIEST[day]), `${day} earliest`);
    for (const t of tradingHours.offeredStartTimes(day)) {
      const mins = tradingHours.clockToMinutes(t);
      assert.ok(
        mins >= w.earliestMinutes && mins <= w.lastStartMinutes,
        `${day} offers ${t} outside its own acceptance window`
      );
    }
  }
});

test("hour formatting reads the way the business speaks, including minutes and 1pm", () => {
  assert.strictEqual(tradingHours.formatHour(9), "9am");
  assert.strictEqual(tradingHours.formatHour(12), "12pm");
  assert.strictEqual(tradingHours.formatHour(13), "1pm");
  assert.strictEqual(tradingHours.formatHour(16, 30), "4.30pm");
  assert.strictEqual(tradingHours.formatClock("09:30"), "9.30am");
  assert.strictEqual(tradingHours.formatClock("10:00"), "10am");
  assert.strictEqual(tradingHours.formatClock("13:00"), "1pm");
});

test("the prompt block states the per-day starts and the 1pm last start, not the old day", () => {
  const block = tradingHours.hoursBlock();
  // Per-day, with the shared last start.
  assert.match(block, /1pm/, "the block must state the 1pm last start");
  assert.match(block, /9\.30am/, "the block must state the 9.30am earliest starts");
  assert.match(block, /Thursday: 10am, 11am, 12pm, 1pm/, "Thursday's own cadence must appear");
  // The old advertised day and the old on-the-hour slot list must be gone.
  assert.doesNotMatch(block, /8am to 6pm/, "the old advertised day must not reappear");
  assert.doesNotMatch(block, /9am to 4\.30pm/, "the old single-day phrase must be gone");
  assert.doesNotMatch(block, /\b2pm\b/, "2pm is not a bookable start under D-027");
  assert.doesNotMatch(block, /\b3pm\b/, "3pm is not a bookable start under D-027");
});

test("bookingBounds carries the slot cap and re-hardcodes no hour", () => {
  const bounds = tradingHours.bookingBounds();
  assert.strictEqual(bounds.maxSlots, tradingHours.max_slots);
  // The per-day window is read from the shared source by the gate, not baked into
  // the bounds object, so no clock hour is duplicated here.
  assert.strictEqual(bounds.latestStartHour, undefined);
  assert.strictEqual(bounds.latestEndHour, undefined);
});

test("Saturday premium is a config hook that defaults to no premium (D-027 figure not set)", () => {
  assert.ok(Object.prototype.hasOwnProperty.call(tradingHours.weekend_premium, "Saturday"), "Saturday premium hook exists");
  assert.strictEqual(tradingHours.weekend_premium.Saturday, null, "no premium figure is set yet");
  assert.strictEqual(tradingHours.weekendPremiumFor("Saturday"), null, "no Saturday premium is applied yet");
  assert.strictEqual(tradingHours.weekendPremiumFor("Monday"), null, "no weekday premium");
});

test("chat.js derives its hours from the single source, not literals", () => {
  const chat = read("server", "netlify", "functions", "chat.js");
  assert.match(chat, /tradingHours\.hoursBlock\(\)/, "the prompt must render the shared hours block");
  assert.match(
    chat,
    /validateBooking\(booking,\s*tradingHours\.bookingBounds\(\)\)/,
    "the Postgres gate must read the shared bounds"
  );
  // The specific strings/shapes that were wrong before.
  assert.doesNotMatch(chat, /Hours: Monday to Saturday, 8am to 6pm/);
  assert.doesNotMatch(chat, /Mon-Sat 8am-6pm/, "the stale PDF-footer hours must be gone");
  assert.doesNotMatch(
    chat,
    /latestStartHour:\s*15,\s*latestEndHour:\s*16/,
    "bounds must come from config, not be re-hardcoded"
  );
});

test("the site states the same day as the engine, per-day", () => {
  const contact = read("site", "src", "pages", "contact.astro");
  assert.match(contact, /tradingHours\.hoursLines\(\)/, "contact page must render the shared per-day list");
  assert.doesNotMatch(contact, /8am to 6pm/, "the stale advertised day must be gone");
  assert.doesNotMatch(contact, /9am to 4\.30pm/, "the old single-day phrase must be gone");

  const layout = read("site", "src", "layouts", "BaseLayout.astro");
  assert.match(
    layout,
    /tradingHours\.openingHoursSpecification\(\)/,
    "JSON-LD hours must come from the shared source"
  );
  assert.doesNotMatch(layout, /opens: '08:00'/, "the stale JSON-LD open time must be gone");
});

test("structured-data hours are per-day, well-formed, and match the config; Sunday absent", () => {
  const spec = tradingHours.openingHoursSpecification();
  assert.strictEqual(spec.length, tradingHours.days.length, "one entry per open day");
  const seenDays = [];
  for (const entry of spec) {
    assert.strictEqual(entry["@type"], "OpeningHoursSpecification");
    assert.strictEqual(entry.dayOfWeek.length, 1, "one day per entry so opens can differ per day");
    const day = entry.dayOfWeek[0];
    seenDays.push(day);
    assert.match(entry.opens, /^\d{2}:\d{2}$/);
    assert.match(entry.closes, /^\d{2}:\d{2}$/);
    assert.strictEqual(entry.opens, tradingHours.earliest_start[day], `${day} opens matches the config`);
  }
  assert.ok(!seenDays.includes("Sunday"), "Sunday must not appear in the opening hours");
  // The public close is the 1pm last start plus the documented typical job length.
  const expectedClose = tradingHours.minutesToClock(
    tradingHours.clockToMinutes(tradingHours.last_start) + tradingHours.jsonld_close_job_hours * 60
  );
  assert.strictEqual(spec[0].closes, expectedClose, "closes = 1pm last start + typical job length");
  // Mutating the returned structure must not corrupt the shared config.
  spec.push({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Sunday"] });
  assert.ok(!tradingHours.days.includes("Sunday"), "openingHoursSpecification must not expose the live array");
});
