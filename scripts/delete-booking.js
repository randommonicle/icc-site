#!/usr/bin/env node
// One-off ops utility — inspect and delete a booking from the Phase 0 Netlify
// Blobs store ("icc-bookings"). Written to clear the leftover TEST booking from
// the 10 June live confirm_booking test (slot 2026-06-24 10:00), but works for
// any erroneous booking until the admin UI grows a delete action.
//
// It mirrors exactly how server/netlify/functions/chat.js stores bookings:
//   <date>          -> JSON array of booked hour-slots, e.g. [10]
//   booking-<id>    -> the full booking record (JSON)
//   booking-index   -> JSON array of booking ids
// Deleting a booking frees its hours from the date key, drops its id from the
// index, and removes the record — the inverse of handleBooking().
//
// REQUIRES the same two creds the functions use (set them in your shell, or put
// them in a local .env and `node --env-file=.env scripts/delete-booking.js`):
//   NETLIFY_SITE_ID
//   NETLIFY_TOKEN
//
// Usage (always REPORT first, confirm the id, then DELETE):
//   node scripts/delete-booking.js                  # report bookings on 2026-06-24 (default)
//   node scripts/delete-booking.js --date 2026-07-01 # report a specific date
//   node scripts/delete-booking.js --all            # report every booking
//   node scripts/delete-booking.js --delete <id>    # delete one booking by id
//
// Read-only unless --delete is given. Nothing is touched in report mode.

const { getStore } = require("@netlify/blobs");

function store() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_TOKEN;
  if (!siteID || !token) {
    console.error("Missing NETLIFY_SITE_ID and/or NETLIFY_TOKEN in the environment.");
    console.error("Set them (or use `node --env-file=.env scripts/delete-booking.js`) and retry.");
    process.exit(1);
  }
  return getStore({ name: "icc-bookings", siteID, token });
}

async function getJSON(s, key, fallback) {
  const raw = await s.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

async function loadBookings(s) {
  const index = await getJSON(s, "booking-index", []);
  const records = [];
  for (const id of index) {
    const rec = await getJSON(s, "booking-" + id, null);
    if (rec) records.push(rec);
    else console.log(`  (index id ${id} has no booking-${id} record — orphaned)`);
  }
  return { index, records };
}

function summarise(rec) {
  return `  id=${rec.id}  name=${JSON.stringify(rec.name)}  date=${rec.date}  ` +
    `start=${rec.start_time}  slots=${rec.slots_needed}  email=${rec.email}  price=${rec.estimated_price}`;
}

async function report(s, { date, all }) {
  const { index, records } = await loadBookings(s);
  console.log(`booking-index: ${index.length} id(s)\n`);
  const shown = all ? records : records.filter((r) => r.date === date);
  if (!shown.length) {
    console.log(all ? "No bookings stored." : `No bookings on ${date}.`);
  } else {
    console.log(all ? "All bookings:" : `Bookings on ${date}:`);
    shown.forEach((r) => console.log(summarise(r)));
  }
  for (const d of [...new Set(shown.map((r) => r.date))]) {
    console.log(`\nslot key ${d}: ${JSON.stringify(await getJSON(s, d, []))}`);
  }
  console.log(`\nTo delete one: node scripts/delete-booking.js --delete <id>`);
}

async function del(s, id) {
  const rec = await getJSON(s, "booking-" + id, null);
  if (!rec) {
    console.error(`No booking-${id} record found. Run the report first to get the id. Aborting.`);
    process.exit(1);
  }
  console.log("Deleting:\n" + summarise(rec) + "\n");

  // 1) free the booked hours from the date key
  const startHour = parseInt(String(rec.start_time).split(":")[0], 10);
  const hours = Array.from({ length: rec.slots_needed || 1 }, (_, i) => startHour + i);
  const slots = await getJSON(s, rec.date, []);
  const remaining = slots.filter((h) => !hours.includes(h));
  if (remaining.length) {
    await s.set(rec.date, JSON.stringify(remaining));
    console.log(`slot key ${rec.date}: ${JSON.stringify(slots)} -> ${JSON.stringify(remaining)}`);
  } else {
    await s.delete(rec.date);
    console.log(`slot key ${rec.date}: ${JSON.stringify(slots)} -> (key deleted, no slots left)`);
  }

  // 2) drop the id from booking-index
  const index = await getJSON(s, "booking-index", []);
  const newIndex = index.filter((x) => String(x) !== String(id));
  await s.set("booking-index", JSON.stringify(newIndex));
  console.log(`booking-index: ${index.length} -> ${newIndex.length} id(s)`);

  // 3) delete the record
  await s.delete("booking-" + id);
  console.log(`deleted booking-${id} record.\nDone.`);
}

(async () => {
  const args = process.argv.slice(2);
  const s = store();
  const delIdx = args.indexOf("--delete");
  if (delIdx !== -1) {
    const id = args[delIdx + 1];
    if (!id) {
      console.error("--delete needs a bookingId, e.g. --delete 1718012345678");
      process.exit(1);
    }
    await del(s, id);
  } else {
    const dateIdx = args.indexOf("--date");
    await report(s, {
      all: args.includes("--all"),
      date: dateIdx !== -1 ? args[dateIdx + 1] : "2026-06-24",
    });
  }
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
