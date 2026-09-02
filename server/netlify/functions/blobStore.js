// Netlify Blobs store factory for the `icc-bookings` store.
//
// Extracted from chat.js so more than one function can reach the same store
// without a divergent copy: the rate limiter (rateLimit.js) records its per-IP
// hit lists here, and the legacy Phase 0 Blobs booking path (chat.js) reads/writes
// bookings here. getStore does no network I/O at construction, so building the
// handle per call is cheap; the siteID/token come from the environment (the token
// is the non-expiring NETLIFY_TOKEN — see NEXT_SESSION.md's standing token note).
//
// CommonJS to match the functions and the plain-Node `node --test` runner.

function getBlobStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore({
    name: "icc-bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  });
}

module.exports = { getBlobStore };
