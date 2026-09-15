// D-026 build note 6 + D-039 — accounting export (GET /api/v1/accounting-export, admin-gated).
// A generic, tool-agnostic feed for Mark's accountant / MTD tool. Two entities:
//   - invoices REGISTER: the documents raised (full face value, status, dates).
//   - payments FEED: money-in EVENTS (two-receipts model, D-041).
// The money-in derivation lives in receipts.js, single-sourced with pnl.js so the P&L
// margin reconciles with this feed. This module owns the endpoint + the CSV shaping.
//
// JSON by default; ?format=csv&entity=payments|invoices returns ONE CSV (a single sheet
// holds one entity). The admin fetches with the Bearer and downloads the text, so no
// Content-Disposition is relied upon. Reads our own DB only, so it works whether or not
// the Stripe rail is configured.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const receipts = require("./receipts.js");
const { schemaNotReady } = require("./schemaNotReady.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

const INVOICE_COLUMNS = [
  { key: "number", label: "Invoice number" },
  { key: "customer_name", label: "Customer" },
  { key: "customer_email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "amount_ex_vat", label: "Amount (GBP)" },
  { key: "issued_at", label: "Issued" },
  { key: "due_at", label: "Due" },
  { key: "paid_at", label: "Paid" },
  { key: "job_id", label: "Job ID" },
];

const PAYMENT_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount (GBP)" },
  { key: "customer_name", label: "Customer" },
  { key: "customer_email", label: "Email" },
  { key: "reference", label: "Reference" },
  { key: "job_id", label: "Job ID" },
];

// RFC 4180 quoting: wrap a cell in quotes and double its quotes if it holds a comma,
// quote or newline, so a customer name with a comma cannot shift columns.
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, columns) {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = (rows || []).map((row) => columns.map((c) => csvCell(row[c.key])).join(",")).join("\r\n");
  return header + "\r\n" + body + (body ? "\r\n" : "");
}

// deps injectable for the tests: supabase, loadInvoiceRows/loadPaidDepositRows, now.
async function handleGet(event, headers, deps) {
  const { supabase } = deps;
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });
  const qs = event.queryStringParameters || {};
  const format = String(qs.format || "json").toLowerCase();
  let invoiceRows, depositRows;
  try {
    invoiceRows = await (deps.loadInvoiceRows || receipts.loadInvoiceRows)(supabase);
    depositRows = await (deps.loadPaidDepositRows || receipts.loadPaidDepositRows)(supabase);
  } catch (e) {
    // A pending migration on hosted (schemaNotReady.js) → clean 503, not a 500.
    if (schemaNotReady(e)) return json(503, headers, { error: "The accounting export is not set up yet (apply the pending migrations to the database)." });
    console.log("accounting-export load failed:", e.message);
    return json(500, headers, { error: "Could not load the accounting data." });
  }
  const invoices = receipts.buildInvoiceRegister(invoiceRows, deps.now);
  const payments = receipts.buildPayments(depositRows, invoiceRows);

  if (format === "csv") {
    const entity = String(qs.entity || "payments").toLowerCase();
    const csv = entity === "invoices" ? toCsv(invoices, INVOICE_COLUMNS) : toCsv(payments, PAYMENT_COLUMNS);
    return { statusCode: 200, headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" }, body: csv };
  }
  return json(200, headers, { invoices, payments, generated_at: new Date(deps.now || Date.now()).toISOString() });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const auth = await requireAdmin(event);
  if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const supabase = getSupabaseAdmin();
  try {
    if (event.httpMethod === "GET") return await handleGet(event, headers, { supabase });
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  } catch (e) {
    console.log("accounting-export error:", e.message);
    return json(500, headers, { error: "Something went wrong building the export." });
  }
};

// Exported for unit tests (test/accounting-export.test.js). The money-in builders are
// re-exported from receipts.js so the existing tests exercise the shared source unchanged.
exports.handleGet = handleGet;
exports.buildInvoiceRegister = receipts.buildInvoiceRegister;
exports.buildPayments = receipts.buildPayments;
exports.toCsv = toCsv;
exports.INVOICE_COLUMNS = INVOICE_COLUMNS;
exports.PAYMENT_COLUMNS = PAYMENT_COLUMNS;
