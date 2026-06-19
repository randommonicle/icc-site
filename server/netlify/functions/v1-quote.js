// POST /api/v1/quote — stateless server-side quote (Phase 2, Slice 3).
//
// Computes an itemised quote, the flat £15 out-of-area surcharge (D-011)
// and the 10% deposit ENTIRELY server-side from shared/config, so the website
// and the future field app price identically (D-003/D-007/D-012). No database,
// no Blobs, no AI, no secrets — pure compute over the request body. This is the
// versioned successor to the assistant's client-quoted figures; it runs
// ALONGSIDE the live /api/chat flow and changes no existing behaviour.
//
// Public by design: pricing is not sensitive, so CORS is open and there is no
// per-IP rate limit (cf. L-006, which gates only money / shared-state paths —
// this endpoint touches neither). When v1 grows endpoints that DO write state
// or cost money, factor the origin-allowlist + rateLimit helpers out of chat.js
// into a shared server lib and apply them there.

const pricing = require("../../../shared/config/pricing.js");
const serviceArea = require("../../../shared/config/serviceArea.js");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const JSON_HEADERS = Object.assign({ "Content-Type": "application/json" }, CORS);

function json(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  // Structural validation. Business validation (unknown codes, bad quantities)
  // lives in pricing.quote(), which throws and is mapped to a 400 below.
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return json(400, { error: "Provide a non-empty `lines` array" });
  }
  if (body.lines.length > 50) {
    return json(400, { error: "Too many lines (max 50)" });
  }
  for (const line of body.lines) {
    if (!line || typeof line.code !== "string") {
      return json(400, { error: "Each line needs a string `code`" });
    }
  }
  if (body.postcode !== undefined && typeof body.postcode !== "string") {
    return json(400, { error: "`postcode` must be a string" });
  }
  if (body.outOfArea !== undefined && typeof body.outOfArea !== "boolean") {
    return json(400, { error: "`outOfArea` must be a boolean" });
  }

  // Out-of-area precedence: an explicit flag wins, else derive from the
  // postcode (D-011), else assume core (no surcharge).
  const outOfArea =
    typeof body.outOfArea === "boolean"
      ? body.outOfArea
      : body.postcode
      ? serviceArea.isOutOfArea(body.postcode)
      : false;

  try {
    return json(200, pricing.quote(body.lines, { outOfArea }));
  } catch (err) {
    // quote() throws on an unknown code / invalid quantity — a client error.
    return json(400, { error: err.message });
  }
};
