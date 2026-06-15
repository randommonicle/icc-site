const crypto = require("crypto");
// Slice 5b (D-021): read the Postgres bookings alongside Blobs so legacy bookings
// stay visible during the transition. supabase === null -> Blobs-only (unchanged).
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { fetchBookingsFromJobs } = require("./bookingsStore.js");
const { requireAdmin } = require("./adminAuth.js");

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

  // Slice 5d: per-user Supabase Auth (replaces the shared ADMIN_SECRET Bearer).
  // requireAdmin verifies the session JWT and checks the ADMIN_EMAILS allowlist.
  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }

  // Read the two stores independently so one failing degrades to the other rather
  // than blanking the dashboard (Slice 5b / D-021).
  const supabase = getSupabaseAdmin();
  let blobsBookings = [];
  let blobsError = null;
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
    blobsBookings = results.filter(Boolean);
  } catch(e){
    blobsError = e;
    console.log("Blobs bookings read failed:", e.message);
  }

  let pgBookings = [];
  let pgError = null;
  if (supabase) {
    try {
      pgBookings = await fetchBookingsFromJobs(supabase);
    } catch(e){
      pgError = e;
      console.log("Postgres bookings read failed:", e.message);
    }
  }

  // Only surface a 500 if there is genuinely nothing to show (both sources failed).
  if (blobsError && (pgError || !supabase)) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ bookings: [], total: 0, error: (blobsError && blobsError.message) || (pgError && pgError.message) })
    };
  }

  const bookings = mergeBookings(pgBookings, blobsBookings);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ bookings, total: bookings.length })
  };
};

// Merge the Postgres + Blobs booking lists so legacy bookings stay visible during
// the Slice 5b cutover. Dedupe by id (Postgres uuids and Blobs numeric-string ids
// are disjoint namespaces, so an id never collides across stores) and sort
// newest-first by created_at. Pure, so it is unit-tested directly.
function mergeBookings(pgBookings, blobsBookings){
  const seen = new Set();
  const bookings = [];
  for (const b of (pgBookings || []).concat(blobsBookings || [])) {
    const id = b && b.id != null ? String(b.id) : null;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    bookings.push(b);
  }
  bookings.sort((a,b) => String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return bookings;
}

// safeEqual is retained as a tested constant-time-compare utility
// (test/hardening.test.js); since Slice 5d it is no longer the admin gate — that
// moved to adminAuth.requireAdmin (Supabase Auth).
exports.safeEqual = safeEqual;
exports.mergeBookings = mergeBookings;
