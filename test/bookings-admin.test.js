// Slice 5b (D-021) — the admin dashboard merges the Postgres + Blobs booking
// lists during the cutover. The pure mergeBookings (dedupe by disjoint id
// namespaces, newest-first) is tested directly; fetchBookingsFromJobs's mapping is
// covered in bookings-store.test.js, and the live both-store read in the Commit 5
// real-Supabase integration test.

const { test } = require("node:test");
const assert = require("node:assert");

const { mergeBookings } = require("../server/netlify/functions/bookings.js");

const pg = [
  { id: "uuid-a", created_at: "2026-06-10T09:00:00+00:00", name: "PG One" },
  { id: "uuid-b", created_at: "2026-06-14T09:00:00+00:00", name: "PG Two" },
];
const blobs = [
  { id: "1781101982626", created_at: "2026-06-12T09:00:00.000Z", name: "Blob One" },
];

test("mergeBookings combines both stores, newest-first", () => {
  const merged = mergeBookings(pg, blobs);
  assert.strictEqual(merged.length, 3);
  assert.deepStrictEqual(merged.map((b) => b.name), ["PG Two", "Blob One", "PG One"]);
});

test("mergeBookings dedupes by id (the first occurrence — Postgres — wins)", () => {
  const staleDupe = [{ id: "uuid-a", created_at: "2026-06-09T00:00:00Z", name: "stale" }];
  const merged = mergeBookings(pg, staleDupe.concat(blobs));
  assert.strictEqual(merged.length, 3);
  assert.strictEqual(merged.filter((b) => b.id === "uuid-a").length, 1);
  assert.strictEqual(merged.find((b) => b.id === "uuid-a").name, "PG One");
});

test("mergeBookings handles empty/undefined inputs and keeps id-less records", () => {
  assert.deepStrictEqual(mergeBookings(), []);
  assert.deepStrictEqual(mergeBookings(null, null), []);
  const noId = [
    { created_at: "2026-06-01T00:00:00Z", name: "x" },
    { created_at: "2026-06-02T00:00:00Z", name: "y" },
  ];
  assert.strictEqual(mergeBookings([], noId).length, 2); // id-less records are not deduped away
});
