// Review-request send (D-025) — the one-click "mark complete & request review"
// admin action. On complete_and_request it moves the job to 'completed' and sends
// a Google-review request to the customer over email (Resend) and SMS (the
// pluggable gateway, smsProvider.js), logging one `messages` row per channel.
// Same admin gate as bookings/handoffs (requireAdmin, Supabase Auth).
//
// Discipline (mirrors handoffs.js):
//   - Human-gated: only Mark's click triggers a send; nothing auto-fires on a
//     status change elsewhere.
//   - Fail-closed per channel: a channel is logged 'sent' ONLY after the provider
//     accepts it; a failure is logged 'failed' and never blocks the other
//     channel. review_request is TRANSACTIONAL (no consent gate) by the schema's
//     own note (init migration) — an existing customer, the service just done.
//   - Dormant until configured: with no GOOGLE_REVIEW_URL the job is still marked
//     complete but nothing is sent (reported back per channel), the house
//     env-flag pattern.
//   - Idempotent: a channel already 'sent' for the job is skipped unless
//     resend:true, so a second click never double-texts the customer.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { sendSms, isSmsConfigured, normalizeUkMobile } = require("./smsProvider.js");
const { googleReviewUrl } = require("../../../shared/config/reviews.js");
const { buildReviewEmail, buildReviewSms } = require("../../../shared/reviewMessages.js");

// Public site origin for the privacy-notice link (env-overridable so it tracks
// the domain at cutover; mirrors handoffs.js).
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.intelligentclean.co.uk";
function privacyNoticeUrl() {
  return `${String(PUBLIC_SITE_URL).replace(/\/+$/, "")}/privacy`;
}

// Email the review request via Resend. Fail-closed (throws on non-2xx). Injectable
// in tests via deps.sendEmailFn.
async function sendReviewEmail(toEmail, content, resendKey) {
  const customerFrom = process.env.CUSTOMER_FROM || "Intelligent Carpet Cleaning <onboarding@resend.dev>";
  const replyTo = process.env.CUSTOMER_REPLY_TO || "hello@intelligentclean.co.uk";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: customerFrom,
      reply_to: replyTo,
      to: toEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

// Load the job plus its customer's name/phone/email by id. Returns null when the
// id matches no job (e.g. a legacy Blobs id, which the admin never shows the
// button for). Selecting the joined customer keeps this to one round-trip.
async function loadJob(supabase, id) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id,status,customer_id,slot_date,customers(name,phone,email)")
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

// The set of channels that already have a 'sent' review_request for this job, so
// a repeat click does not double-send (idempotency).
async function sentReviewChannels(supabase, jobId) {
  const { data, error } = await supabase
    .from("messages")
    .select("channel")
    .eq("job_id", jobId)
    .eq("kind", "review_request")
    .eq("status", "sent");
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.channel));
}

// Best-effort audit row (sent/failed) — logging must never fail the request or
// undo a send that already happened, so an insert error is logged, not thrown.
async function logMessage(supabase, row) {
  const { error } = await supabase.from("messages").insert(row);
  if (error) console.log("review message log failed:", error.message);
}

function messageRow(job, channel, status, { subject, body }) {
  return {
    customer_id: job.customer_id,
    job_id: job.id,
    kind: "review_request",
    channel,
    status,
    ai_drafted: false,
    requires_consent: false, // transactional (schema note) — never a marketing gate
    subject: subject || null,
    body,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };
}

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// POST dispatcher. Deps are injectable so the tests exercise the routing, the
// status transition, the idempotency skip and the fail-closed logging without any
// network: sendEmailFn/sendSmsFn, and the resolved reviewUrl/smsConfigured flags.
async function handlePost(event, headers, deps) {
  const { supabase, resendKey } = deps;
  const sendEmailFn = deps.sendEmailFn || sendReviewEmail;
  const sendSmsFn = deps.sendSmsFn || ((to, body) => sendSms({ to, body }));
  const smsConfigured = deps.smsConfigured != null ? deps.smsConfigured : isSmsConfigured();
  const reviewUrl = deps.reviewUrl !== undefined ? deps.reviewUrl : googleReviewUrl();

  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, headers, { error: "Invalid JSON" }); }
  if (body.action !== "complete_and_request") return json(400, headers, { error: "Unknown action" });
  const id = body.job_id;
  if (!id || typeof id !== "string") return json(400, headers, { error: "Missing job_id" });

  const job = await loadJob(supabase, id);
  if (!job) return json(404, headers, { error: "Job not found" });
  if (job.status === "cancelled") return json(409, headers, { error: "This job is cancelled." });

  // 1) Mark complete (idempotent; the neq guard means a job cancelled by a
  // concurrent request is never silently completed).
  if (job.status !== "completed") {
    const { error } = await supabase.from("jobs").update({ status: "completed" }).eq("id", id).neq("status", "cancelled");
    if (error) return json(500, headers, { error: "Could not mark the job complete." });
  }

  const cust = job.customers || {};
  const results = { email: {}, sms: {} };

  // Not configured: the job is complete, but there is no review link to send, so
  // report both channels as not sent and stop (dormant-until-configured).
  if (!reviewUrl) {
    results.email = { sent: false, reason: "Google review link not configured" };
    results.sms = { sent: false, reason: "Google review link not configured" };
    return json(200, headers, { ok: true, status: "completed", results });
  }

  const already = await sentReviewChannels(supabase, id);
  const resend = body.resend === true;

  // Email channel
  if (already.has("email") && !resend) {
    results.email = { sent: false, reason: "Already sent" };
  } else if (!cust.email) {
    results.email = { sent: false, reason: "No email on file" };
  } else if (!resendKey) {
    results.email = { sent: false, reason: "Email sending not configured" };
  } else {
    const content = buildReviewEmail({ name: cust.name, reviewUrl, privacyUrl: privacyNoticeUrl() });
    try {
      await sendEmailFn(cust.email, content, resendKey);
      await logMessage(supabase, messageRow(job, "email", "sent", { subject: content.subject, body: content.text }));
      results.email = { sent: true };
    } catch (e) {
      console.log("review email failed for job", id, "-", e.message);
      await logMessage(supabase, messageRow(job, "email", "failed", { subject: content.subject, body: content.text }));
      results.email = { sent: false, reason: "Send failed" };
    }
  }

  // SMS channel
  const mobile = normalizeUkMobile(cust.phone);
  if (already.has("sms") && !resend) {
    results.sms = { sent: false, reason: "Already sent" };
  } else if (!mobile) {
    results.sms = { sent: false, reason: "No valid UK mobile on file" };
  } else if (!smsConfigured) {
    results.sms = { sent: false, reason: "SMS provider not configured" };
  } else {
    const smsBody = buildReviewSms({ name: cust.name, reviewUrl });
    try {
      await sendSmsFn(mobile, smsBody);
      await logMessage(supabase, messageRow(job, "sms", "sent", { body: smsBody }));
      results.sms = { sent: true };
    } catch (e) {
      console.log("review sms failed for job", id, "-", e.message);
      await logMessage(supabase, messageRow(job, "sms", "failed", { body: smsBody }));
      results.sms = { sent: false, reason: "Send failed" };
    }
  }

  return json(200, headers, { ok: true, status: "completed", results });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

  const supabase = getSupabaseAdmin();
  try {
    return await handlePost(event, headers, { supabase, resendKey: process.env.RESEND_API_KEY });
  } catch (e) {
    console.log("review-request error:", e.message);
    return json(500, headers, { error: "Something went wrong sending the review request." });
  }
};

// Exported for unit tests (test/review-request.test.js).
exports.handlePost = handlePost;
exports.sendReviewEmail = sendReviewEmail;
exports.loadJob = loadJob;
exports.sentReviewChannels = sentReviewChannels;
exports.messageRow = messageRow;
