// D-039 expenses endpoint — /api/v1/expenses (admin-gated). The cost-log half of the
// operational P&L: Mark records expenses here and the P&L (pnl.js) subtracts them from
// revenue. Under /api/v1 so the field app is a client (D-003/D-012). Amounts are GBP,
// server-validated (positive, 2dp); category is checked against the enum SERVER-SIDE so a
// bad value is a clean 400, not a DB 500. No VAT (D-024).
//
// The table has no credential gate (unlike invoicing), so if this deploys before the
// expenses migration is applied to hosted, every op hits a missing table. On the live seam
// that is PostgREST's PGRST205 (the table is not in its schema cache), not the Postgres
// 42P01 this code first keyed on (it 500'd for real on 2026-09-14, L-040); schemaNotReady
// covers both and returns a clean 503 "not set up yet", never a 500 (the operator sees a
// real message). A bad job_id FK (23503) is a 400, not a 500.
//
// REST verbs: POST create, GET list (optional ?from&to), PATCH update, DELETE remove.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { parsePeriod } = require("./period.js");
const { schemaNotReady } = require("./schemaNotReady.js");

const CATEGORIES = ["fuel", "materials", "equipment", "insurance", "software", "other"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// Map a Postgres error to a clean HTTP response, or null if it is not one we special-case.
function pgErrorResponse(error, headers) {
  const code = error && error.code;
  if (schemaNotReady(error)) return json(503, headers, { error: "Expenses are not set up yet (apply migration 20260913120000 to the database)." });
  if (code === "23503") return json(400, headers, { error: "That job_id does not match a job." });
  if (code === "23514" || code === "22P02") return json(400, headers, { error: "Invalid expense value." });
  return null;
}

// Validate + normalise a create (partial:false) or update (partial:true) payload.
// Returns { row } or { error }. category is checked against the enum here, not left to the
// DB, so a bad value is a 400; amount is forced positive and 2dp server-side.
function buildExpenseRow(body, opts = {}) {
  const partial = !!opts.partial;
  const row = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("incurred_on")) {
    if (!DATE_RE.test(String(body.incurred_on || ""))) return { error: "incurred_on must be a YYYY-MM-DD date." };
    row.incurred_on = body.incurred_on;
  }
  if (!partial || has("category")) {
    if (!CATEGORIES.includes(body.category)) return { error: "category must be one of: " + CATEGORIES.join(", ") + "." };
    row.category = body.category;
  }
  if (!partial || has("amount")) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0) return { error: "amount must be a positive number." };
    row.amount = Math.round(amt * 100) / 100;
  }
  if (has("description")) row.description = body.description == null ? null : String(body.description);
  if (has("job_id")) row.job_id = body.job_id ? String(body.job_id) : null;
  if (has("notes")) row.notes = body.notes == null ? null : String(body.notes);

  if (partial && Object.keys(row).length === 0) return { error: "Nothing to update." };
  return { row };
}

async function handlePost(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, headers, { error: "Invalid JSON" }); }
  const built = buildExpenseRow(body, { partial: false });
  if (built.error) return json(400, headers, { error: built.error });
  const { data, error } = await supabase.from("expenses").insert(built.row).select().limit(1);
  if (error) { const r = pgErrorResponse(error, headers); if (r) return r; console.log("expenses insert failed:", error.message); return json(500, headers, { error: "Could not save the expense." }); }
  return json(200, headers, { ok: true, expense: (data && data[0]) || built.row });
}

async function handlePatch(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, headers, { error: "Invalid JSON" }); }
  if (!body.id) return json(400, headers, { error: "Missing id" });
  const built = buildExpenseRow(body, { partial: true });
  if (built.error) return json(400, headers, { error: built.error });
  const { data, error } = await supabase.from("expenses").update(built.row).eq("id", body.id).select().limit(1);
  if (error) { const r = pgErrorResponse(error, headers); if (r) return r; console.log("expenses update failed:", error.message); return json(500, headers, { error: "Could not update the expense." }); }
  if (!data || !data[0]) return json(404, headers, { error: "Expense not found" });
  return json(200, headers, { ok: true, expense: data[0] });
}

async function handleDelete(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  let id = (event.queryStringParameters || {}).id;
  if (!id) { try { id = JSON.parse(event.body || "{}").id; } catch (e) { id = null; } }
  if (!id) return json(400, headers, { error: "Missing id" });
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) { const r = pgErrorResponse(error, headers); if (r) return r; console.log("expenses delete failed:", error.message); return json(500, headers, { error: "Could not delete the expense." }); }
  return json(200, headers, { ok: true });
}

async function handleGet(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const qs = event.queryStringParameters || {};
  let q = supabase.from("expenses").select("*").order("incurred_on", { ascending: false });
  if (qs.from || qs.to) {
    const period = parsePeriod(qs, deps.now);
    if (period.error) return json(400, headers, { error: period.error });
    q = q.gte("incurred_on", period.from).lte("incurred_on", period.to);
  }
  const { data, error } = await q.limit(2000);
  if (error) { const r = pgErrorResponse(error, headers); if (r) return r; console.log("expenses list failed:", error.message); return json(500, headers, { error: "Could not load expenses." }); }
  return json(200, headers, { expenses: data || [] });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  const auth = await requireAdmin(event);
  if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  const supabase = getSupabaseAdmin();
  const deps = { supabase };
  try {
    if (event.httpMethod === "GET") return await handleGet(event, headers, deps);
    if (event.httpMethod === "POST") return await handlePost(event, headers, deps);
    if (event.httpMethod === "PATCH") return await handlePatch(event, headers, deps);
    if (event.httpMethod === "DELETE") return await handleDelete(event, headers, deps);
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  } catch (e) {
    console.log("expenses error:", e.message);
    return json(500, headers, { error: "Something went wrong handling the expense." });
  }
};

// Exported for unit tests (test/expenses.test.js).
exports.handlePost = handlePost;
exports.handleGet = handleGet;
exports.handlePatch = handlePatch;
exports.handleDelete = handleDelete;
exports.buildExpenseRow = buildExpenseRow;
exports.CATEGORIES = CATEGORIES;
