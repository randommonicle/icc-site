// D-027 provisional-booking accept/decline endpoint (`/api/booking-action`).
//
// A booking that finishes after the auto-confirm line (15:00) is TAKEN and HOLDS
// its slot but waits for Mark to accept or decline it (chat.js handleBooking). Mark
// does that from a one-click link in his notification email. That link opens a
// READ-ONLY page (site/src/pages/booking-action.astro) with the action token in the
// URL FRAGMENT; the page POSTs {job, token, action} here. This endpoint is the only
// thing that mutates the booking.
//
// Design source: the converged cross-agent review REVIEW_d027-3pm-provisional
// (Claude + GPT + Gemini, 2026-09-01) and docs/D027_PROVISIONAL_PLAN.md. The load-
// bearing rules from that review, each enforced below:
//   - AUTH is the token, not the job id. A UUID alone grants nothing: the presented
//     token is hashed and compared CONSTANT-TIME (crypto.timingSafeEqual) against the
//     stored SHA-256 hash; the plaintext is never stored (a DB leak cannot forge a
//     link). No admin session is required — the token is the capability.
//   - POST ONLY. A mutating GET would be fired by a mail-scanner prefetch before Mark
//     ever clicks (a bare decline link would auto-cancel). The email link lands on a
//     static page; only this explicit POST changes state. 405 on anything else.
//   - IDEMPOTENT + MONOTONIC via an atomic compare-and-set: the transition matches on
//     `confirmation_state='awaiting_operator'` AND an unused token, so exactly one of
//     N racing/duplicate requests wins; the rest see 0 rows and get 409. Accept-then-
//     decline, double-click, and a replayed old link all change nothing.
//   - CLAIM-THEN-SEND: the CAS is the single-winner claim, so the customer is emailed
//     at most once per decision. A send failure is logged 'failed' (visible + resend-
//     able from admin, Phase 5), never a second contradictory message.
//   - A decline releases the hold (job status -> 'cancelled'); accept keeps 'booked'.
//
// CommonJS to match the other functions and the plain-Node `node --test` runner.

const crypto = require("crypto");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { getClientIP, tooManyResponse, enforceRateLimit } = require("./rateLimit.js");
const tradingHours = require("../../../shared/config/tradingHours.js");

// Public site origin for the privacy-notice link (env-overridable so it tracks the
// domain at cutover; mirrors reviewRequest.js / chat.js).
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.intelligentclean.co.uk";
function privacyNoticeUrl() {
  return `${String(PUBLIC_SITE_URL).replace(/\/+$/, "")}/privacy`;
}

// Escape customer-/model-supplied text before it lands in an HTML email (L-003).
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// Constant-time check that a presented plaintext token hashes to the stored hash.
// The stored value is the SHA-256 HEX digest (64 chars) written by handleBooking;
// hash the presented token the same way and compare the fixed 32-byte digests, so
// timingSafeEqual never sees a length mismatch (which would throw and leak length).
// The structural guards (types, hex length) are on non-secret shape, not the secret.
function tokenMatches(presentedToken, storedHashHex) {
  if (typeof presentedToken !== "string" || !presentedToken) return false;
  if (typeof storedHashHex !== "string" || storedHashHex.length !== 64) return false;
  let stored;
  try {
    stored = Buffer.from(storedHashHex, "hex");
  } catch (e) {
    return false;
  }
  if (stored.length !== 32) return false;
  const presented = crypto.createHash("sha256").update(presentedToken).digest();
  return crypto.timingSafeEqual(presented, stored);
}

// Columns needed to authorise, transition, and render the confirm page + emails.
const JOB_COLS =
  "id,status,confirmation_state,operator_decided_at,operator_action_token_hash," +
  "operator_action_token_expires_at,operator_action_token_used_at,customer_id," +
  "slot_date,start_hour,start_minute,slots_needed,rooms,address,price_display,customers(name,email)";

async function loadJob(supabase, id) {
  const { data, error } = await supabase.from("jobs").select(JOB_COLS).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

// The customer/booking facts shown on the confirm page and in the emails. Times use
// the business voice (formatHour -> "9.30am"/"1pm").
function bookingSummary(job) {
  const cust = job.customers || {};
  return {
    name: cust.name || null,
    email: cust.email || null,
    date: job.slot_date || null,
    time: job.start_hour != null ? tradingHours.formatHour(job.start_hour, job.start_minute || 0) : null,
    hours: job.slots_needed || null,
    rooms: job.rooms || null,
    address: job.address || null,
    price: job.price_display || null,
  };
}

// The atomic compare-and-set. Only a row still `awaiting_operator` with an unused
// token transitions, and the SAME update consumes the token — so exactly one of any
// racing/duplicate requests affects a row. Returns the affected-row count.
async function transition(supabase, id, action) {
  const nowIso = new Date().toISOString();
  const fields =
    action === "accept"
      ? { confirmation_state: "operator_confirmed", operator_decided_at: nowIso, operator_action_token_used_at: nowIso }
      : { confirmation_state: "operator_declined", operator_decided_at: nowIso, operator_action_token_used_at: nowIso, status: "cancelled" };
  const { data, error } = await supabase
    .from("jobs")
    .update(fields)
    .eq("id", id)
    .eq("confirmation_state", "awaiting_operator")
    .is("operator_action_token_used_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data || []).length;
}

// --- Customer notification emails (COPY PENDING BEN'S SIGN-OFF, like Phase 3b) ----
// Accept: the held request is now confirmed. Decline: not accepted, slot released,
// ordinary rebooking route, NEVER a promise of the same time (converged review §3).

function emailShell(header, innerHtml, privacyUrl) {
  return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d2236;padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#2ab8a4;margin:0;font-size:20px;">${escHtml(header)}</h1>
          <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;">Intelligent Carpet Cleaning</p>
        </div>
        <div style="background:#f7f8fa;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          ${innerHtml}
          <p style="margin-top:20px;font-size:13px;color:#718096;">Questions? Call us on 01242 279590 or email hello@intelligentclean.co.uk</p>
          <p style="margin-top:15px;font-size:12px;color:#888;">How we handle your data: <a href="${escHtml(privacyUrl)}" style="color:#888;">our privacy notice</a>.</p>
          <p style="margin-top:15px;font-size:12px;color:#a0aec0;">Intelligence you can trust.</p>
        </div>
      </div>`;
}

function buildAcceptEmail(summary, privacyUrl) {
  const firstName = (summary.name || "there").split(" ")[0];
  const inner = `
          <p style="font-size:15px;">Hi ${escHtml(firstName)},</p>
          <p style="font-size:14px;color:#4a5568;">Good news. Mark has confirmed your carpet cleaning appointment. Here are the details:</p>
          <table style="width:100%;border-collapse:collapse;margin:15px 0;">
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;width:40%"><strong>Date</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(summary.date)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Start time</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(summary.time)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Estimated duration</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(summary.hours)} hour(s)</td></tr>
          </table>
          <p style="font-size:14px;color:#4a5568;">Mark will be in touch shortly to arrange your deposit and secure the slot.</p>`;
  const text = `Hi ${firstName},\n\nGood news. Mark has confirmed your carpet cleaning appointment for ${summary.date} at ${summary.time} (estimated ${summary.hours} hour(s)). Mark will be in touch shortly to arrange your deposit and secure the slot.\n\nQuestions? Call 01242 279590 or email hello@intelligentclean.co.uk.\n\nIntelligent Carpet Cleaning`;
  return { subject: "Your booking is confirmed - Intelligent Carpet Cleaning", html: emailShell("Booking Confirmed", inner, privacyUrl), text };
}

function buildDeclineEmail(summary, privacyUrl) {
  const firstName = (summary.name || "there").split(" ")[0];
  const inner = `
          <p style="font-size:15px;">Hi ${escHtml(firstName)},</p>
          <p style="font-size:14px;color:#4a5568;">Thank you for your booking request for ${escHtml(summary.date)} at ${escHtml(summary.time)}. Unfortunately Mark isn't able to take that appointment, so the slot is no longer being held.</p>
          <p style="font-size:14px;color:#4a5568;">We'd still love to help. Please call <strong>01242 279590</strong> or email <strong>hello@intelligentclean.co.uk</strong> and we'll find a time that works for you.</p>
          <p style="font-size:13px;color:#718096;">Sorry for the inconvenience.</p>`;
  const text = `Hi ${firstName},\n\nThank you for your booking request for ${summary.date} at ${summary.time}. Unfortunately Mark isn't able to take that appointment, so the slot is no longer being held.\n\nWe'd still love to help. Please call 01242 279590 or email hello@intelligentclean.co.uk and we'll find a time that works for you.\n\nSorry for the inconvenience.\n\nIntelligent Carpet Cleaning`;
  return { subject: "About your booking request - Intelligent Carpet Cleaning", html: emailShell("Booking Update", inner, privacyUrl), text };
}

// Send the customer email via Resend. Fail-closed (throws on non-2xx) so the caller
// logs 'failed'. Injectable in tests via deps.sendEmailFn.
async function sendCustomerEmail(toEmail, content, resendKey) {
  const customerFrom = process.env.CUSTOMER_FROM || "Intelligent Carpet Cleaning <onboarding@resend.dev>";
  const replyTo = process.env.CUSTOMER_REPLY_TO || "hello@intelligentclean.co.uk";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({ from: customerFrom, reply_to: replyTo, to: toEmail, subject: content.subject, html: content.html, text: content.text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

// Best-effort audit row (sent/failed) — logging must never undo a send that already
// happened or fail the request, so an insert error is logged, not thrown.
function messageRow(job, kind, status, content) {
  return {
    customer_id: job.customer_id,
    job_id: job.id,
    kind, // 'provisional_confirmed' | 'provisional_declined'
    channel: "email",
    status,
    ai_drafted: false,
    requires_consent: false, // transactional (a decision on the customer's own booking)
    subject: content.subject || null,
    body: content.text || content.subject || "(no body)", // messages_sent_has_body: sent needs a body
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };
}

async function logMessage(supabase, row) {
  try {
    const { error } = await supabase.from("messages").insert(row);
    if (error) console.log("booking-action message log failed:", error.message);
  } catch (e) {
    console.log("booking-action message log threw:", e.message);
  }
}

// POST dispatcher. Deps are injectable so the tests exercise auth, the CAS
// transition, idempotency and claim-then-send without any network: supabase (a fake
// client), resendKey, sendEmailFn.
async function handlePost(event, headers, deps) {
  const { supabase, resendKey } = deps;
  const sendEmailFn = deps.sendEmailFn || sendCustomerEmail;

  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, headers, { error: "Invalid JSON" });
  }
  const id = body.job;
  const token = body.token;
  const action = body.action;
  if (!id || typeof id !== "string") return json(400, headers, { error: "Missing job" });
  if (!token || typeof token !== "string") return json(400, headers, { error: "Missing token" });
  if (!["view", "accept", "decline"].includes(action)) return json(400, headers, { error: "Unknown action" });

  const job = await loadJob(supabase, id);
  // Authorise on the TOKEN. A missing job and a bad token look identical to the
  // caller, so a job id alone reveals nothing (server-side-authority). No customer
  // PII is returned before this check passes.
  if (!job || !tokenMatches(token, job.operator_action_token_hash)) {
    return json(404, headers, { error: "Not found" });
  }

  const summary = bookingSummary(job);
  const state = job.confirmation_state;
  const expired =
    !job.operator_action_token_expires_at ||
    new Date(job.operator_action_token_expires_at).getTime() <= Date.now();

  // view: read-only render context for the page. Token already verified above.
  if (action === "view") {
    return json(200, headers, { ok: true, state, expired, decidedAt: job.operator_decided_at || null, booking: summary });
  }

  // accept / decline. Early-out for the common already-resolved case; the CAS below
  // is the real single-winner guard against a concurrent action.
  if (state !== "awaiting_operator") {
    return json(409, headers, { error: "This booking has already been actioned.", state, decidedAt: job.operator_decided_at || null });
  }
  if (expired) {
    return json(410, headers, { error: "This action link has expired. Please action the booking from the admin dashboard.", state });
  }

  const rows = await transition(supabase, id, action);
  if (rows === 0) {
    // Lost the compare-and-set (a concurrent accept/decline won, or the token was
    // consumed between load and update): already actioned.
    return json(409, headers, { error: "This booking has already been actioned." });
  }

  const newState = action === "accept" ? "operator_confirmed" : "operator_declined";

  // Claim-then-send: the winning CAS is the claim, so at most one email per decision.
  let emailed = false;
  if (summary.email && resendKey) {
    const content = action === "accept" ? buildAcceptEmail(summary, privacyNoticeUrl()) : buildDeclineEmail(summary, privacyNoticeUrl());
    const kind = action === "accept" ? "provisional_confirmed" : "provisional_declined";
    try {
      await sendEmailFn(summary.email, content, resendKey);
      await logMessage(supabase, messageRow(job, kind, "sent", content));
      emailed = true;
    } catch (e) {
      console.log(`booking-action ${action} email failed for job`, id, "-", e.message);
      await logMessage(supabase, messageRow(job, kind, "failed", content));
    }
  }

  return json(200, headers, { ok: true, state: newState, emailed });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

  // Per-IP cap: defence-in-depth. The single-use token is the PRIMARY control (no
  // valid token, no state change and no email), and a valid token lives only in
  // Mark's inbox. The cap throttles anonymous probing of the endpoint; it fails open
  // on a limiter outage so a real operator is never blocked (L-001).
  const ip = getClientIP(event);
  const rl = await enforceRateLimit(ip, "rl:bookaction", 20);
  if (!rl.ok) return tooManyResponse(headers, rl.retryAfter);

  const supabase = getSupabaseAdmin();
  try {
    return await handlePost(event, headers, { supabase, resendKey: process.env.RESEND_API_KEY });
  } catch (e) {
    console.log("booking-action error:", e.message);
    return json(500, headers, { error: "Something went wrong. Please try again or use the admin dashboard." });
  }
};

// Exported for unit tests (test/booking-action.test.js).
exports.handlePost = handlePost;
exports.tokenMatches = tokenMatches;
exports.loadJob = loadJob;
exports.transition = transition;
exports.messageRow = messageRow;
exports.buildAcceptEmail = buildAcceptEmail;
exports.buildDeclineEmail = buildDeclineEmail;
