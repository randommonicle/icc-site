// D-027 provisional-booking decision core (shared).
//
// The security-sensitive core shared by the two endpoints that resolve a provisional
// booking: the PUBLIC token endpoint (bookingAction.js, authorised by the single-use
// action token) and the ADMIN fallback endpoint (bookingAdmin.js, authorised by
// requireAdmin). Extracting it keeps ONE source for the decision compare-and-set, the
// token lifecycle, and the customer notification, so the two paths cannot drift on the
// authorisation, the monotonic state, or the customer-facing wording (cross-agent
// review 2026-09-02, GPT finding 3 / Gemini round 1).
//
// This module holds NO auth. The token check lives in bookingAction.js (public) and
// requireAdmin lives in bookingAdmin.js; the expiry gate is a public-token concern and
// stays in bookingAction.js too (Gemini finding 3: the admin must decide a stale
// awaiting booking regardless of token expiry). decideProvisional here is purely the
// atomic state transition.
//
// CommonJS to match the other functions and the plain-Node `node --test` runner.

const crypto = require("crypto");
const tradingHours = require("../../../shared/config/tradingHours.js");
const { depositPayButtonHtml, depositPayTextLine } = require("../../../shared/emailSnippets.js");

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

// --- Action token lifecycle -------------------------------------------------

// Mint a one-click action token: a 32-byte random plaintext (goes ONLY in Mark's
// email link) and its SHA-256 hex hash (the only thing stored — a DB leak cannot
// forge a link). Used at booking time (chat.js handleBooking) and on an admin resend
// (bookingAdmin.js), so both mint identically.
function mintActionToken() {
  const plaintext = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

// End of the booking day: midnight UTC of the day AFTER slot_date, parsed as explicit
// UTC components so the serverless runtime's timezone cannot shift it (L: date-parse).
// One source, so a resend computes the same expiry as the original booking.
function actionTokenExpiry(slotDate) {
  const [y, m, d] = String(slotDate).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0)).toISOString();
}

// --- Job load + summary -----------------------------------------------------

// Columns needed to authorise, transition, and render the confirm page + emails.
const JOB_COLS =
  "id,status,confirmation_state,operator_decided_at,operator_action_token_hash," +
  "operator_action_token_expires_at,operator_action_token_used_at,customer_id," +
  "slot_date,start_hour,start_minute,slots_needed,rooms,address,price_display,deposit_ex_vat,customers(name,email)";

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

// --- Decision transition (atomic compare-and-set) ---------------------------

// Resolve an awaiting provisional booking. Only a row still `awaiting_operator` with
// an unused token transitions, and the SAME update consumes the token, so exactly one
// of any racing/duplicate requests (email link vs admin, double-click) affects a row.
// Returns the affected-row count; 0 means already actioned. Carries NO auth and NO
// expiry check — the caller authorises (token or requireAdmin) first.
//
// opts.expectedHash (PUBLIC path only): bind the CAS to the token hash the caller
// verified, so a resend that rotated the hash between verify and CAS makes the stale
// request lose (0 rows -> 409). The ADMIN path passes no expectedHash — its authority
// is requireAdmin, not a token (cross-agent review 2026-09-02, GPT finding 1).
async function decideProvisional(supabase, id, action, opts = {}) {
  const nowIso = new Date().toISOString();
  const fields =
    action === "accept"
      ? { confirmation_state: "operator_confirmed", operator_decided_at: nowIso, operator_action_token_used_at: nowIso }
      : { confirmation_state: "operator_declined", operator_decided_at: nowIso, operator_action_token_used_at: nowIso, status: "cancelled" };
  let q = supabase
    .from("jobs")
    .update(fields)
    .eq("id", id)
    .eq("confirmation_state", "awaiting_operator")
    .is("operator_action_token_used_at", null);
  if (opts.expectedHash) q = q.eq("operator_action_token_hash", opts.expectedHash);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data || []).length;
}

// Resend (admin): mint a fresh token for an awaiting booking. The plaintext of the old
// token is gone (only its hash was stored), so a resend must ROTATE to a new one, which
// invalidates the previous email link (its plaintext no longer hashes to the stored
// value). The CAS binds to the OLD hash and requires `awaiting_operator` + unused, so
// concurrent resends are single-winner and a resend cannot rotate an already-decided job
// (cross-agent review 2026-09-02, GPT finding 1). Returns the affected-row count.
async function rotateActionToken(supabase, id, opts) {
  const { oldHash, newHash, newExpiry } = opts;
  const { data, error } = await supabase
    .from("jobs")
    .update({ operator_action_token_hash: newHash, operator_action_token_expires_at: newExpiry })
    .eq("id", id)
    .eq("confirmation_state", "awaiting_operator")
    .is("operator_action_token_used_at", null)
    .eq("operator_action_token_hash", oldHash)
    .select("id");
  if (error) throw new Error(error.message);
  return (data || []).length;
}

// Has this job already had a customer outcome notice successfully SENT? Used for the
// admin retry idempotency (read-then-send).
async function hasSentProvisionalNotice(supabase, jobId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("job_id", jobId)
    .in("kind", ["provisional_confirmed", "provisional_declined"])
    .eq("status", "sent")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}

// The set of job ids that already have a SENT provisional outcome notice, for the admin
// dashboard to annotate each card (mirrors the review_sent annotation in bookings.js).
async function sentProvisionalNoticeJobIds(supabase) {
  const { data, error } = await supabase
    .from("messages")
    .select("job_id")
    .in("kind", ["provisional_confirmed", "provisional_declined"])
    .eq("status", "sent");
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.job_id).filter(Boolean));
}

// --- Customer notification emails (copy approved by Ben, 2026-09-02) ---------
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
          <p style="margin-top:20px;font-size:13px;color:#718096;">Questions? Call us on 01452 452356 or email hello@intelligentclean.co.uk</p>
          <p style="margin-top:15px;font-size:12px;color:#888;">How we handle your data: <a href="${escHtml(privacyUrl)}" style="color:#888;">our privacy notice</a>.</p>
          <p style="margin-top:15px;font-size:12px;color:#a0aec0;">Intelligence you can trust.</p>
        </div>
      </div>`;
}

function buildAcceptEmail(summary, privacyUrl, depositPayUrl) {
  const firstName = (summary.name || "there").split(" ")[0];
  // Dormant until D-004/D-026 is live and the deposit amount is server-derived: both
  // return "" for a null/invalid URL, so today the email keeps the "Mark will be in
  // touch" wording and shows no button.
  const payButton = depositPayButtonHtml(depositPayUrl);
  const payTextLine = depositPayTextLine(depositPayUrl);
  const depositLine = payButton
    ? "Please pay your deposit using the secure link below to confirm your appointment."
    : "Mark will be in touch shortly to arrange your deposit and secure the slot.";
  const inner = `
          <p style="font-size:15px;">Hi ${escHtml(firstName)},</p>
          <p style="font-size:14px;color:#4a5568;">Good news. Mark has confirmed your carpet cleaning appointment. Here are the details:</p>
          <table style="width:100%;border-collapse:collapse;margin:15px 0;">
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;width:40%"><strong>Date</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(summary.date)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Start time</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(summary.time)}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568;font-size:14px;"><strong>Estimated duration</strong></td><td style="padding:8px 0;font-size:14px;">${escHtml(summary.hours)} hour(s)</td></tr>
          </table>
          <p style="font-size:14px;color:#4a5568;">${depositLine}</p>${payButton}`;
  const text = `Hi ${firstName},\n\nGood news. Mark has confirmed your carpet cleaning appointment for ${summary.date} at ${summary.time} (estimated ${summary.hours} hour(s)). ${payButton ? "Please pay your deposit to confirm your appointment." : "Mark will be in touch shortly to arrange your deposit and secure the slot."}${payTextLine ? "\n\n" + payTextLine : ""}\n\nQuestions? Call 01452 452356 or email hello@intelligentclean.co.uk.\n\nIntelligent Carpet Cleaning`;
  return { subject: "Your booking is confirmed - Intelligent Carpet Cleaning", html: emailShell("Booking Confirmed", inner, privacyUrl), text };
}

function buildDeclineEmail(summary, privacyUrl) {
  const firstName = (summary.name || "there").split(" ")[0];
  const inner = `
          <p style="font-size:15px;">Hi ${escHtml(firstName)},</p>
          <p style="font-size:14px;color:#4a5568;">Thank you for your booking request for ${escHtml(summary.date)} at ${escHtml(summary.time)}. Unfortunately Mark isn't able to take that appointment, so the slot is no longer being held.</p>
          <p style="font-size:14px;color:#4a5568;">We'd still love to help. Please call <strong>01452 452356</strong> or email <strong>hello@intelligentclean.co.uk</strong> and we'll find a time that works for you.</p>
          <p style="font-size:13px;color:#718096;">Sorry for the inconvenience.</p>`;
  const text = `Hi ${firstName},\n\nThank you for your booking request for ${summary.date} at ${summary.time}. Unfortunately Mark isn't able to take that appointment, so the slot is no longer being held.\n\nWe'd still love to help. Please call 01452 452356 or email hello@intelligentclean.co.uk and we'll find a time that works for you.\n\nSorry for the inconvenience.\n\nIntelligent Carpet Cleaning`;
  return { subject: "About your booking request - Intelligent Carpet Cleaning", html: emailShell("Booking Update", inner, privacyUrl), text };
}

// Send the customer email via Resend. Fail-closed (throws on non-2xx) so the caller
// logs 'failed'. Injectable in tests via deps.sendEmailFn.
async function sendCustomerEmail(toEmail, content, resendKey, idempotencyKey) {
  const customerFrom = process.env.CUSTOMER_FROM || "Intelligent Carpet Cleaning <onboarding@resend.dev>";
  const replyTo = process.env.CUSTOMER_REPLY_TO || "hello@intelligentclean.co.uk";
  // Idempotency-Key (Resend, 24h window): a duplicate send for the same notice (a stuck
  // 'sending' row retried after the stale window, or any re-fire of the same (job, kind)) is
  // a no-op at the provider, so no second email reaches the customer. This closes the
  // send-then-settle two-generals residual (cross-agent review 2026-09-03, GEMINI). The
  // payload is fixed at decision time, so a replay carries the same body (Resend 409s a
  // same-key/different-payload reuse).
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({ from: customerFrom, reply_to: replyTo, to: toEmail, subject: content.subject, html: content.html, text: content.text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

// A `messages` audit row for a provisional outcome notice.
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

// D-027 strict single winner. The provisional notice is ONE `messages` row per (job_id,
// kind), guarded by the partial unique index messages_provisional_notice_uniq (migration
// 20260903120000). A sender must CLAIM that row (move it to 'sending') before sending, so
// exactly one sender proceeds and the customer is emailed at most once, even under a
// concurrent admin retry or a retry racing an initial send that died after sending but
// before recording. A dead claim must never strand a notice, so a 'sending' row older than
// this window is reclaimable; the 10s function timeout sits well inside it.
const STALE_SENDING_MS = 15 * 60 * 1000;

// Claim the (job, kind) notice row by moving it to 'sending'. Returns { claimed, id }.
// Reclaim-UPDATE-then-INSERT against the partial unique index (NOT ON CONFLICT: supabase-js
// upsert cannot target a partial index): reclaim a terminal draft/failed row or a stale
// 'sending' one; otherwise insert a fresh claim, where a 23505 means another sender already
// holds the row (already sent, or sending right now), so we lose the race.
//
// The stale-'sending' reclaim stays single-winner under concurrency ONLY because this UPDATE
// advances updated_at (the set_updated_at BEFORE UPDATE trigger on messages, init migration
// 20260605115456): a racing second reclaim then re-checks against a freshly-stamped row, no
// longer matches updated_at.lt.staleBefore, and loses at the INSERT. If that trigger were
// dropped, two racers could both reclaim a stale row and double-send. The concurrent-stale-
// reclaim integration test enforces the dependency (drop the trigger and it fails).
async function claimNotice(supabase, job, kind, content) {
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const claimFields = {
    status: "sending",
    subject: content.subject || null,
    body: content.text || content.subject || "(no body)",
  };
  const { data: reclaimed, error: upErr } = await supabase
    .from("messages")
    .update(claimFields)
    .eq("job_id", job.id)
    .eq("kind", kind)
    .or(`status.in.(draft,failed),and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .select("id");
  if (upErr) throw new Error(upErr.message);
  if (reclaimed && reclaimed.length) return { claimed: true, id: reclaimed[0].id };

  const { data: inserted, error: insErr } = await supabase
    .from("messages")
    .insert(messageRow(job, kind, "sending", content))
    .select("id");
  if (insErr) {
    if (insErr.code === "23505") return { claimed: false, id: null };
    throw new Error(insErr.message);
  }
  return { claimed: true, id: inserted && inserted[0] ? inserted[0].id : null };
}

// Settle a claimed notice row to its terminal status by id. Best-effort: settling must
// never undo a send that already happened, so an error is logged, not thrown.
async function settleNotice(supabase, id, status, content) {
  if (!id) return;
  const fields = {
    status,
    subject: content.subject || null,
    body: content.text || content.subject || "(no body)",
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };
  try {
    const { error } = await supabase.from("messages").update(fields).eq("id", id);
    if (error) console.log("booking notice settle failed:", error.message);
  } catch (e) {
    console.log("booking notice settle threw:", e.message);
  }
}

// Send the customer their outcome notice (confirmed / not accepted) as a strict single
// winner: CLAIM the (job, kind) row, then send, then settle it 'sent' (or 'failed'). A lost
// claim means another sender already handled this notice, so we do nothing (no duplicate).
// A resolved booking still ALWAYS leaves a row: no email / no key / a send failure settles
// 'failed', so the notice stays visible and retryable in the admin (cross-agent review
// 2026-09-02, finding 5). The kind is derived from `action`, so a confirmed booking can
// never emit a decline notice. Best-effort: never throws (the decision has already
// committed). Returns { emailed, status, reason? }.
async function notifyCustomerOutcome(supabase, job, action, opts = {}) {
  const { resendKey, sendEmailFn = sendCustomerEmail, depositPayUrl = null } = opts;
  const summary = bookingSummary(job);
  const kind = action === "accept" ? "provisional_confirmed" : "provisional_declined";
  const content =
    action === "accept"
      ? buildAcceptEmail(summary, privacyNoticeUrl(), depositPayUrl)
      : buildDeclineEmail(summary, privacyNoticeUrl());

  let claim;
  try {
    claim = await claimNotice(supabase, job, kind, content);
  } catch (e) {
    console.log(`booking notify ${action} claim failed for job`, job.id, "-", e.message);
    return { emailed: false, status: "failed", reason: "claim failed" };
  }
  if (!claim.claimed) return { emailed: false, status: "skipped", reason: "already handled" };

  if (!summary.email) {
    await settleNotice(supabase, claim.id, "failed", content);
    return { emailed: false, status: "failed", reason: "no email on file" };
  }
  if (!resendKey) {
    await settleNotice(supabase, claim.id, "failed", content);
    return { emailed: false, status: "failed", reason: "email not configured" };
  }
  try {
    await sendEmailFn(summary.email, content, resendKey, `${kind}/${job.id}`);
    await settleNotice(supabase, claim.id, "sent", content);
    return { emailed: true, status: "sent" };
  } catch (e) {
    console.log(`booking notify ${action} failed for job`, job.id, "-", e.message);
    await settleNotice(supabase, claim.id, "failed", content);
    return { emailed: false, status: "failed", reason: "send failed" };
  }
}

module.exports = {
  PUBLIC_SITE_URL,
  privacyNoticeUrl,
  escHtml,
  mintActionToken,
  actionTokenExpiry,
  JOB_COLS,
  loadJob,
  bookingSummary,
  decideProvisional,
  rotateActionToken,
  hasSentProvisionalNotice,
  sentProvisionalNoticeJobIds,
  emailShell,
  buildAcceptEmail,
  buildDeclineEmail,
  sendCustomerEmail,
  messageRow,
  notifyCustomerOutcome,
};
