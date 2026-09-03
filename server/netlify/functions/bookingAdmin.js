// D-027 provisional-booking ADMIN fallback (`/api/booking-admin`).
//
// The recovery path when Mark's one-click email link is lost or spam-filtered. It does
// what the public token endpoint (bookingAction.js) does, but authorised SOLELY by
// requireAdmin (the Supabase session JWT + ADMIN_EMAILS allowlist), never by a token.
// The shared decision core (bookingDecision.js) is the single source for the CAS and the
// customer notice, so the two paths cannot drift.
//
// Design source: the converged Phase 5 cross-agent review (Claude + GPT + Gemini,
// 2026-09-02). Load-bearing rules enforced below:
//   - AUTH is requireAdmin ONLY. No token is presented, so decideProvisional is called
//     with NO expectedHash and NO expiry gate — the admin must be able to resolve a
//     stale awaiting booking whose token has expired (Gemini finding 3).
//   - accept/decline reuse the same CAS, so an admin decision and Mark's email decision
//     race safely (one wins; the other 0 rows -> 409).
//   - resend rotates the token (old-hash CAS, single-winner) and re-emails Mark; it
//     refuses if email is unconfigured (else it kills the old link with no replacement)
//     or the booking's day has passed (a fresh token would be born expired) (GPT 1/2).
//   - retry_customer_notice re-sends the CUSTOMER outcome notice for a RESOLVED booking
//     whose notice never sent, derived from the FINAL state, read-then-send idempotent
//     (finding 5). resend + retry get a low per-(admin,job) cap (GPT/Gemini 2).
//
// CommonJS to match the other functions and the plain-Node `node --test` runner.

const { requireAdmin } = require("./adminAuth.js");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { enforceRateLimit } = require("./rateLimit.js");
const {
  escHtml,
  loadJob,
  bookingSummary,
  decideProvisional,
  notifyCustomerOutcome,
  mintActionToken,
  actionTokenExpiry,
  rotateActionToken,
  hasSentProvisionalNotice,
} = require("./bookingDecision.js");

const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.intelligentclean.co.uk";

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// A lean operator "here is your link again" email — the booking summary plus the fresh
// action link, not a rebuild of the full new-booking card + PDF.
function buildResendOperatorEmail(summary, actionUrl) {
  const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d2236;padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#2ab8a4;margin:0;font-size:20px;">Provisional booking — link resent</h1>
          <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;">Intelligent Carpet Cleaning</p>
        </div>
        <div style="background:#f7f8fa;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p style="font-size:14px;color:#4a5568;">A fresh link for the provisional booking below. Any previous link for this booking no longer works.</p>
          <table style="width:100%;border-collapse:collapse;margin:8px 0;">
            <tr><td style="padding:6px 0;color:#4a5568;font-size:14px;width:40%"><strong>Customer</strong></td><td style="padding:6px 0;font-size:14px;">${escHtml(summary.name)}</td></tr>
            <tr><td style="padding:6px 0;color:#4a5568;font-size:14px;"><strong>Date</strong></td><td style="padding:6px 0;font-size:14px;">${escHtml(summary.date)} at ${escHtml(summary.time)}</td></tr>
            <tr><td style="padding:6px 0;color:#4a5568;font-size:14px;"><strong>Duration</strong></td><td style="padding:6px 0;font-size:14px;">${escHtml(summary.hours)} hour(s)</td></tr>
          </table>
          <div style="margin-top:16px;text-align:center;">
            <a href="${escHtml(actionUrl)}" style="display:inline-block;background:#c2410c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Review &amp; respond</a>
          </div>
        </div>
      </div>`;
  return { subject: `Provisional booking (link resent) - ${summary.name || "customer"} - ${summary.date}`, html };
}

// Send the operator email to Mark. Fail-closed (throws on non-2xx). Injectable in tests.
async function sendOperatorEmail(content, resendKey) {
  const operatorEmail = process.env.OPERATOR_EMAIL || "ben.graham240689@gmail.com";
  const operatorFrom = process.env.OPERATOR_FROM || "ICC Bookings <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({ from: operatorFrom, to: operatorEmail, subject: content.subject, html: content.html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

// A low per-(admin, job) cap on the email-sending actions (resend/retry): defence in
// depth against a held button / buggy client (the button-disable is the first line, in
// admin.html). Fails open on a limiter outage (L-001). Injectable in tests.
async function capEmailAction(deps, adminEmail, jobId) {
  const fn = deps.enforceRateLimitFn || enforceRateLimit;
  return fn(`${adminEmail}:${jobId}`, "rl:bookadmin", 10);
}

// POST dispatcher. Deps are injectable so the tests exercise every branch without any
// network: supabase (a fake), resendKey, adminEmail, sendEmailFn (customer notice),
// sendOperatorFn (resend), enforceRateLimitFn.
async function handlePost(event, headers, deps) {
  const { supabase, resendKey, adminEmail } = deps;
  const sendOperatorFn = deps.sendOperatorFn || sendOperatorEmail;

  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, headers, { error: "Invalid JSON" });
  }
  const id = body.job_id;
  const action = body.action;
  if (!id || typeof id !== "string") return json(400, headers, { error: "Missing job_id" });
  if (!["accept", "decline", "resend", "retry_customer_notice"].includes(action)) {
    return json(400, headers, { error: "Unknown action" });
  }

  const job = await loadJob(supabase, id);
  if (!job) return json(404, headers, { error: "Job not found" });

  // --- accept / decline: same CAS as the public path, no token, no expiry gate -----
  if (action === "accept" || action === "decline") {
    if (job.confirmation_state !== "awaiting_operator") {
      return json(409, headers, { error: "This booking is not awaiting a decision.", state: job.confirmation_state });
    }
    const rows = await decideProvisional(supabase, id, action);
    if (rows === 0) return json(409, headers, { error: "This booking has just been actioned." });
    const newState = action === "accept" ? "operator_confirmed" : "operator_declined";
    const { emailed } = await notifyCustomerOutcome(supabase, job, action, { resendKey, sendEmailFn: deps.sendEmailFn });
    return json(200, headers, { ok: true, state: newState, emailed });
  }

  // --- resend: rotate the token + re-email Mark ------------------------------------
  if (action === "resend") {
    if (job.confirmation_state !== "awaiting_operator") {
      return json(409, headers, { error: "This booking is not awaiting a decision.", state: job.confirmation_state });
    }
    if (!resendKey) {
      // Do NOT rotate: that would kill the existing link with no replacement email.
      return json(503, headers, { error: "Email is not configured, so the link cannot be resent." });
    }
    const newExpiry = actionTokenExpiry(job.slot_date);
    if (new Date(newExpiry).getTime() <= Date.now()) {
      return json(409, headers, { error: "This booking's day has passed; a resent link would already be expired." });
    }
    const cap = await capEmailAction(deps, adminEmail, id);
    if (!cap.ok) return json(429, headers, { error: "Too many resends for this booking. Please wait a moment." });

    const { plaintext, hash } = mintActionToken();
    const rows = await rotateActionToken(supabase, id, { oldHash: job.operator_action_token_hash, newHash: hash, newExpiry });
    if (rows === 0) return json(409, headers, { error: "This booking has just been actioned; nothing to resend." });

    const base = String(PUBLIC_SITE_URL).replace(/\/+$/, "");
    const actionUrl = `${base}/booking-action#job=${encodeURIComponent(id)}&token=${plaintext}`;
    try {
      await sendOperatorFn(buildResendOperatorEmail(bookingSummary(job), actionUrl), resendKey);
      return json(200, headers, { ok: true, resent: true });
    } catch (e) {
      console.log("booking-admin resend email failed for job", id, "-", e.message);
      // The link IS rotated and valid; only the send failed. Report it so Mark retries.
      return json(502, headers, { error: "The link was refreshed but the email failed to send. Please try again." });
    }
  }

  // --- retry_customer_notice: re-send the CUSTOMER outcome for a RESOLVED booking ---
  const noticeAction =
    job.confirmation_state === "operator_confirmed" ? "accept" :
    job.confirmation_state === "operator_declined" ? "decline" : null;
  if (!noticeAction) {
    return json(409, headers, { error: "This booking has no operator decision to notify.", state: job.confirmation_state });
  }
  if (await hasSentProvisionalNotice(supabase, id)) {
    return json(200, headers, { ok: true, emailed: false, reason: "already notified" });
  }
  const cap = await capEmailAction(deps, adminEmail, id);
  if (!cap.ok) return json(429, headers, { error: "Too many retries for this booking. Please wait a moment." });
  const { emailed, reason } = await notifyCustomerOutcome(supabase, job, noticeAction, { resendKey, sendEmailFn: deps.sendEmailFn });
  return json(200, headers, { ok: true, emailed, reason });
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
    return await handlePost(event, headers, {
      supabase,
      resendKey: process.env.RESEND_API_KEY,
      adminEmail: (auth.user && auth.user.email) || "admin",
    });
  } catch (e) {
    console.log("booking-admin error:", e.message);
    return json(500, headers, { error: "Something went wrong. Please try again." });
  }
};

// Exported for unit tests (test/booking-admin.test.js).
exports.handlePost = handlePost;
exports.buildResendOperatorEmail = buildResendOperatorEmail;
