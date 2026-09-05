// Per-IP sliding-window rate limiting, backed by Netlify Blobs.
//
// Extracted from chat.js (Phase 0 hardening) so every endpoint that spends money
// or writes shared state can share ONE limiter instead of forking a divergent copy
// (guard-the-spend-paths). Consumers today: chat.js (AI chat, booking confirm,
// availability) and bookingAction.js (the D-027 operator accept/decline endpoint).
//
// The pure decision logic lives in rateLimit() so it is unit-tested with an
// in-memory store (test/hardening.test.js); enforceRateLimit() wraps it with the
// real Blobs store and the fail-open policy — a storage outage must never block a
// real customer (L-001/L-006). chat.js re-exports rateLimit so that test keeps
// importing it from there unchanged.
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

const { getBlobStore } = require("./blobStore.js");

function getClientIP(event) {
  const xff = event.headers["x-forwarded-for"] || "";
  const first = xff.split(",")[0].trim();
  return first || event.headers["client-ip"] || event.headers["x-real-ip"] || "";
}

// 429 response shared by all rate-limited paths.
function tooManyResponse(baseHeaders, retryAfter) {
  return {
    statusCode: 429,
    headers: Object.assign({}, baseHeaders, { "Retry-After": String(retryAfter || 3600) }),
    body: JSON.stringify({ error: "Too many requests. Please wait a little and try again, or call us on 01452 452356." }),
  };
}

// rateLimit records `now` in a per-key timestamp list, drops entries older than
// the window, and refuses once the list reaches `limit`. The store is injected:
// any object with async get(key)->string|null and set(key, value).
async function rateLimit(store, key, limit, windowMs, now) {
  const data = await store.get(key);
  const arr = (data ? JSON.parse(data) : []).filter((t) => t > now - windowMs);
  if (arr.length >= limit) return { ok: false, retryAfter: Math.ceil(windowMs / 1000) };
  arr.push(now);
  await store.set(key, JSON.stringify(arr));
  return { ok: true };
}

// Production wrapper: real Blobs store, namespaced key, fail-open on any error.
// Used across paths at different limits — chat (AI cost), booking confirmation
// (expensive write + slot-griefing vector), availability (cheap but loopable), and
// the provisional accept/decline endpoint (writes shared state + emails).
async function enforceRateLimit(ip, prefix, limit) {
  if (!ip) return { ok: true };
  const windowMs = 60 * 60 * 1000;
  try {
    const store = getBlobStore();
    return await rateLimit(store, prefix + ":" + ip, limit, windowMs, Date.now());
  } catch (e) {
    console.log("Rate limit blob unavailable, failing open:", e.message);
    return { ok: true };
  }
}

module.exports = { getClientIP, tooManyResponse, rateLimit, enforceRateLimit };
