// Phase 0 hardening — unit tests for the security-critical pure logic.
// Run with: node --test
//
// These exercise real code paths (the actual rateLimit / safeEqual functions
// imported from the live function files), not reimplementations. The only test
// double is an in-memory store standing in for Netlify Blobs — the external
// dependency rateLimit() reads/writes through, not the logic under test. No
// network, no creds, no node_modules required.

const { test } = require("node:test");
const assert = require("node:assert");
const { rateLimit, depositLabel } = require("../server/netlify/functions/chat.js");
const { safeEqual } = require("../server/netlify/functions/bookings.js");

// In-memory stand-in for the Blobs store: the same async get/set contract.
function memStore(){
  const m = new Map();
  return {
    async get(k){ return m.has(k) ? m.get(k) : null; },
    async set(k, v){ m.set(k, v); }
  };
}

const HOUR = 60 * 60 * 1000;

test("rateLimit allows requests up to the limit", async () => {
  const store = memStore();
  for(let i = 0; i < 5; i++){
    const r = await rateLimit(store, "k", 5, HOUR, 1000 + i);
    assert.strictEqual(r.ok, true);
  }
});

test("rateLimit blocks the request that exceeds the limit", async () => {
  const store = memStore();
  const now = 1_000_000;
  for(let i = 0; i < 5; i++){
    assert.strictEqual((await rateLimit(store, "k", 5, HOUR, now + i)).ok, true);
  }
  const blocked = await rateLimit(store, "k", 5, HOUR, now + 5);
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.retryAfter, 3600);
});

test("rateLimit re-allows once old hits fall outside the window", async () => {
  const store = memStore();
  const t0 = 1_000_000;
  for(let i = 0; i < 5; i++){ await rateLimit(store, "k", 5, HOUR, t0 + i); }
  assert.strictEqual((await rateLimit(store, "k", 5, HOUR, t0 + 5)).ok, false);
  // Jump past the window — the five old timestamps expire and we can proceed.
  assert.strictEqual((await rateLimit(store, "k", 5, HOUR, t0 + HOUR + 1)).ok, true);
});

test("rateLimit keys (IPs/paths) are independent", async () => {
  const store = memStore();
  const now = 2_000_000;
  for(let i = 0; i < 5; i++){ await rateLimit(store, "a", 5, HOUR, now + i); }
  assert.strictEqual((await rateLimit(store, "a", 5, HOUR, now + 5)).ok, false); // a is full
  assert.strictEqual((await rateLimit(store, "b", 5, HOUR, now + 5)).ok, true);  // b untouched
});

test("safeEqual: identical tokens match", () => {
  assert.strictEqual(safeEqual("s3cr3t-token", "s3cr3t-token"), true);
});

test("safeEqual: different tokens do not match", () => {
  assert.strictEqual(safeEqual("wrong-token", "s3cr3t-token"), false);
});

test("safeEqual: different-length tokens do not match and do not throw", () => {
  assert.strictEqual(safeEqual("short", "a-much-longer-secret-value"), false);
});

test("safeEqual: empty / non-string inputs do not match", () => {
  assert.strictEqual(safeEqual("", "secret"), false);
  assert.strictEqual(safeEqual("secret", ""), false);
  assert.strictEqual(safeEqual(undefined, "secret"), false);
  assert.strictEqual(safeEqual("secret", undefined), false);
});

test("depositLabel keeps a provided deposit verbatim", () => {
  assert.strictEqual(depositLabel("£90"), "£90");
});

test("depositLabel falls back to a clear label when missing or blank", () => {
  assert.strictEqual(depositLabel(undefined), "To be confirmed");
  assert.strictEqual(depositLabel(null), "To be confirmed");
  assert.strictEqual(depositLabel(""), "To be confirmed");
  assert.strictEqual(depositLabel("   "), "To be confirmed");
});
