// Guard: the trading day must mean the same thing everywhere it is stated.
//
// This exists because it did not. The assistant's prompt advertised "8am to 6pm"
// with bookable slots to 5pm, the contact page and the LocalBusiness JSON-LD said
// 08:00-18:00, and the live Postgres validation (D-021, enabled 14 June 2026)
// rejected any start after 15:00. The failure was invisible until the last step: a
// customer could be offered 4pm, complete the whole consultation, and be refused at
// confirm_booking with a 400. The client-side availability pre-check did not catch
// it either, because 16 and 17 never appear in the 9-15 grid it checks against.
//
// The rule these tests encode: whatever the booking engine will actually accept is
// what the assistant is allowed to offer and what the site is allowed to advertise.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const tradingHours = require("../shared/config/tradingHours.js");

const repoRoot = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");

test("the advertised day matches the hours the booking engine enforces", () => {
  const bounds = tradingHours.bookingBounds();
  assert.strictEqual(bounds.latestStartHour, tradingHours.latest_start_hour);
  assert.strictEqual(bounds.latestEndHour, tradingHours.latest_end_hour);
  // The public close must not be earlier than the last job can finish, or the
  // site would promise less than the engine allows.
  const closesHour = Number(tradingHours.closes.split(":")[0]);
  assert.ok(
    closesHour >= tradingHours.latest_end_hour,
    `closes (${tradingHours.closes}) is before the latest job end (${tradingHours.latest_end_hour}:00)`
  );
});

test("every offered start hour is one the engine will accept", () => {
  const hours = tradingHours.startHours();
  assert.ok(hours.length > 0, "there must be at least one bookable start hour");
  assert.strictEqual(hours[0], tradingHours.earliest_start_hour);
  assert.strictEqual(hours[hours.length - 1], tradingHours.latest_start_hour);
  for (const h of hours) {
    assert.ok(
      h >= tradingHours.earliest_start_hour && h <= tradingHours.latest_start_hour,
      `${h}:00 is offered but outside the bookable window`
    );
  }
});

test("a single-slot job starting at the last bookable hour still fits the day", () => {
  assert.ok(
    tradingHours.latest_start_hour + 1 <= tradingHours.latest_end_hour,
    "a one-hour job at the last start time must finish by the latest end hour"
  );
});

test("the longest permitted job still fits from the earliest start", () => {
  assert.ok(
    tradingHours.earliest_start_hour + tradingHours.max_slots <= tradingHours.latest_end_hour,
    `max_slots (${tradingHours.max_slots}) overflows the day from ${tradingHours.earliest_start_hour}:00`
  );
});

test("the prompt block states the real hours and never a later start", () => {
  const block = tradingHours.hoursBlock();
  assert.match(block, /Hours: Monday to Saturday, 9am to 4\.30pm/);
  assert.doesNotMatch(block, /8am to 6pm/, "the old advertised day must not reappear");
  assert.match(block, /never offer a later start than 3pm/);

  // The offered start times are the assertion that matters. Checking the whole
  // block would be wrong: it legitimately mentions 4pm as the time work must be
  // finished by, which is not a bookable start.
  const slots = tradingHours.slotsPhrase();
  assert.doesNotMatch(slots, /\b4pm\b/, "4pm must not be offered as a start time");
  assert.doesNotMatch(slots, /\b5pm\b/, "5pm must not be offered as a start time");
});

test("chat.js derives its hours from the single source, not literals", () => {
  const chat = read("server", "netlify", "functions", "chat.js");
  assert.match(chat, /tradingHours\.hoursBlock\(\)/, "the prompt must render the shared hours block");
  assert.match(
    chat,
    /validateBooking\(booking,\s*tradingHours\.bookingBounds\(\)\)/,
    "the Postgres gate must read the shared bounds"
  );
  // The specific strings that were wrong before.
  assert.doesNotMatch(chat, /Hours: Monday to Saturday, 8am to 6pm/);
  assert.doesNotMatch(
    chat,
    /latestStartHour:\s*15,\s*latestEndHour:\s*16/,
    "bounds must come from config, not be re-hardcoded"
  );
});

test("the site states the same day as the engine", () => {
  const contact = read("site", "src", "pages", "contact.astro");
  assert.match(contact, /tradingHours\.hoursPhrase\(\)/, "contact page must render the shared phrase");
  assert.doesNotMatch(contact, /8am to 6pm/, "the stale advertised day must be gone");

  const layout = read("site", "src", "layouts", "BaseLayout.astro");
  assert.match(
    layout,
    /tradingHours\.openingHoursSpecification\(\)/,
    "JSON-LD hours must come from the shared source"
  );
  assert.doesNotMatch(layout, /opens: '08:00'/, "the stale JSON-LD open time must be gone");
});

test("structured-data hours are well-formed and match the config", () => {
  const [spec] = tradingHours.openingHoursSpecification();
  assert.strictEqual(spec["@type"], "OpeningHoursSpecification");
  assert.match(spec.opens, /^\d{2}:\d{2}$/);
  assert.match(spec.closes, /^\d{2}:\d{2}$/);
  assert.strictEqual(spec.opens, tradingHours.opens);
  assert.strictEqual(spec.closes, tradingHours.closes);
  assert.deepStrictEqual(spec.dayOfWeek, tradingHours.days);
  // Mutating the returned array must not corrupt the shared config.
  spec.dayOfWeek.push("Sunday");
  assert.ok(!tradingHours.days.includes("Sunday"), "openingHoursSpecification must not expose the live array");
});

test("hour formatting reads the way the business speaks", () => {
  assert.strictEqual(tradingHours.formatHour(9), "9am");
  assert.strictEqual(tradingHours.formatHour(12), "12pm");
  assert.strictEqual(tradingHours.formatHour(15), "3pm");
  assert.strictEqual(tradingHours.formatHour(16, 30), "4.30pm");
  assert.strictEqual(tradingHours.hoursPhrase(), "Monday to Saturday, 9am to 4.30pm");
  assert.strictEqual(tradingHours.slotsPhrase(), "9am, 10am, 11am, 12pm, 1pm, 2pm, 3pm");
});
