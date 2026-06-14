const crypto = require("crypto");

// Constant-time bearer-token comparison. Both sides are hashed to a fixed 32-byte
// digest first, so timingSafeEqual never sees a length mismatch — that would both
// throw and leak the secret's length through the error path. Single-operator
// dashboard, but cheap to do correctly.
function safeEqual(provided, expected){
  if(typeof provided !== "string" || typeof expected !== "string" || !provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if(event.httpMethod === "OPTIONS"){
    return { statusCode: 200, headers, body: "" };
  }

  // TODO(slice5d/supabase-auth): Phase 0 admin auth is a shared Bearer secret
  // (ADMIN_SECRET, constant-time compared). Slice 5d replaces it with Supabase Auth
  // (per-user login + RLS), so the field app and the admin share one identity model.
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = event.headers["authorization"] || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if(!adminSecret || !safeEqual(providedToken, adminSecret)){
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({
      name: "icc-bookings",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN
    });
    const indexData = await store.get("booking-index");
    const bookingIds = indexData ? JSON.parse(indexData) : [];

    // Fetch all bookings in parallel — sequential reads were slow past ~20 bookings
    const results = await Promise.all(bookingIds.map(async id => {
      try {
        const data = await store.get("booking-"+id);
        return data ? JSON.parse(data) : null;
      } catch(e){ return null; }
    }));
    const bookings = results.filter(Boolean);

    // Newest first by created_at so admin sees most recent at the top
    bookings.sort((a,b) => String(b.created_at||"").localeCompare(String(a.created_at||"")));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ bookings, total: bookings.length })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ bookings: [], total: 0, error: e.message })
    };
  }
};

// Exported for unit tests (test/hardening.test.js).
exports.safeEqual = safeEqual;
