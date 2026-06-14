// Slice 5e (D-020) — admin-gated read of the human_handoff queue for Mark's
// review. Reuses the 5a service-role client (supabaseClient.js) and the same
// constant-time Bearer gate as bookings.js (safeEqual, imported, not duplicated).
//
// Read-only in v1. The draft -> approved -> sent lifecycle and any AI-drafted
// answer are 5e-2 (TODO(slice5e-2/approve-send) in admin.html), and an answer must
// NEVER be auto-drafted for a damage_risk handoff (D-020).

const { safeEqual } = require("./bookings.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");

// Pull the handoff queue from Supabase, newest first, as a plain shape the admin
// renders as inert text. supabase === null (env not set) -> not configured, so the
// dashboard degrades cleanly instead of erroring.
async function fetchHandoffs(supabase, limit = 100) {
  if (!supabase) return { handoffs: [], total: 0, configured: false };
  const { data, error } = await supabase
    .from("messages")
    .select("id,created_at,subject,body,status,channel")
    .eq("kind", "human_handoff")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const handoffs = data || [];
  return { handoffs, total: handoffs.length, configured: true };
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: "Method Not Allowed" };

  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = event.headers["authorization"] || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!adminSecret || !safeEqual(providedToken, adminSecret)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const result = await fetchHandoffs(getSupabaseAdmin());
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ handoffs: [], total: 0, error: e.message }) };
  }
};

// Exported for unit tests (test/handoffs.test.js).
exports.fetchHandoffs = fetchHandoffs;
