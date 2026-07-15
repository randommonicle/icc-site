// Pure review-request message builders (D-025) — email + SMS content, no DB and
// no network, so they are unit-tested directly and shared by the send path
// (server/netlify/functions/reviewRequest.js). Mirrors shared/messages.js.
//
// The review link is a trusted config value (shared/config/reviews.js), never
// customer input; it is escaped in the HTML part anyway. The customer NAME is
// customer-derived, so it is escaped in the HTML part (L-003 — AI/booking text
// renders as inert, never as live markup). CommonJS for `node --test`.

const { BUSINESS_NAME } = require("./config/reviews.js");

// Sign-off identifies the controller in both parts (A4; UK GDPR Arts.13/14).
// Service-area only, no street address (D-016). Mirrors handoffs.js — a shared
// contact-config could dedupe the two later.
const ICC_SIGN_OFF_LINES = [
  "Intelligent Carpet Cleaning",
  "Cheltenham, Gloucestershire",
  "01242 279590",
  "hello@intelligentclean.co.uk",
];

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// First name for a friendly greeting, or "there" when we have no usable name.
// Never throws on odd input (nullish, whitespace, single token).
function firstName(fullName) {
  const s = String(fullName || "").trim();
  return s ? s.split(/\s+/)[0] : "there";
}

// SMS body: one short line with the review link. Kept lean so it fits a single
// 160-char GSM segment when the review link is a short g.page link; a long
// search.google.com link pushes it into a second segment (2 credits). The
// gateway still sends either way, it just costs an extra credit (D-025). Plain
// text: an SMS has no markup, so nothing to escape.
function buildReviewSms({ name, reviewUrl }) {
  const hi = firstName(name);
  return `Hi ${hi}, thanks for choosing ${BUSINESS_NAME}. A quick Google review would really help us: ${reviewUrl}`;
}

// Email content: { subject, html, text }. privacyUrl is injected by the caller
// (built from PUBLIC_SITE_URL) so this stays pure. The customer name is escaped
// in the HTML; reviewUrl is a trusted config value, escaped defensively.
function buildReviewEmail({ name, reviewUrl, privacyUrl }) {
  const hi = firstName(name);
  const subject = `How did we do? Leave ${BUSINESS_NAME} a review`;

  const sigHtml = ICC_SIGN_OFF_LINES
    .map((l, i) => (i === 0 ? `<strong>${escHtml(l)}</strong>` : escHtml(l)))
    .join("<br>");
  const privacyHtml = privacyUrl
    ? `<p style="margin-top:15px;font-size:12px;color:#888;">How we handle your data: <a href="${escHtml(privacyUrl)}" style="color:#888;">our privacy notice</a>.</p>`
    : "";

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;font-size:14px;color:#1a1a2e;line-height:1.6;">` +
    `<p>Hi ${escHtml(hi)},</p>` +
    `<p>Thank you for choosing ${escHtml(BUSINESS_NAME)}. We hope you are delighted with your freshly cleaned carpets.</p>` +
    `<p>If you have a moment, a short Google review would mean a great deal to us and helps other people in the area find us.</p>` +
    `<p style="text-align:center;margin:24px 0;">` +
    `<a href="${escHtml(reviewUrl)}" style="background:#1a8a7a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">Leave a Google review</a>` +
    `</p>` +
    `<p style="font-size:12px;color:#888;">If the button does not work, copy this link into your browser:<br>${escHtml(reviewUrl)}</p>` +
    `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:13px;color:#555;">${sigHtml}</div>` +
    privacyHtml +
    `</div>`;

  const text =
    `Hi ${hi},\n\n` +
    `Thank you for choosing ${BUSINESS_NAME}. We hope you are delighted with your freshly cleaned carpets.\n\n` +
    `If you have a moment, a short Google review would mean a great deal to us and helps other people in the area find us:\n${reviewUrl}\n\n` +
    `${ICC_SIGN_OFF_LINES.join("\n")}` +
    (privacyUrl ? `\n\nHow we handle your data: ${privacyUrl}` : "");

  return { subject, html, text };
}

module.exports = { buildReviewSms, buildReviewEmail, firstName, ICC_SIGN_OFF_LINES };
