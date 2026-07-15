// Review-request config (D-025) — the single source (D-006/D-007) for the values
// that turn the post-job review ask on and shape the customer-facing message.
//
// Dormant by default: with GOOGLE_REVIEW_URL unset the review endpoint marks the
// job complete but sends nothing (the house env-flag pattern used for Supabase
// and the FreeAgent wiring). Set the env vars in Netlify to switch it on with no
// code deploy. CommonJS to match shared/config and load under `node --test`.

// The Google review deep-link — the one value that enables the customer-facing
// ask. Get it from Mark's Google Business Profile: the "Ask for reviews" panel
// gives a short share link (https://g.page/r/...), or build the canonical form
// https://search.google.com/local/writereview?placeid=<PLACE_ID>. Must be https;
// anything else (or unset) reads as "not configured" so a stray value can never
// send customers to a non-review URL.
function googleReviewUrl() {
  const u = process.env.GOOGLE_REVIEW_URL;
  return typeof u === "string" && /^https:\/\//i.test(u.trim()) ? u.trim() : null;
}

// The alphanumeric SMS sender ID shown as the "from" on the text. UK gateways
// (The SMS Works included) require 4-11 chars, letters and digits only, no
// spaces. Defaults to a safe 10-char brand token; override with SMS_SENDER_ID.
// Sanitised + length-capped HERE so a bad env value can never make the gateway
// reject every send (it would fail the whole review-SMS channel silently).
const DEFAULT_SMS_SENDER = "ICCleaning";
function smsSenderId() {
  const cleaned = String(process.env.SMS_SENDER_ID || DEFAULT_SMS_SENDER)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 11);
  return cleaned.length >= 4 ? cleaned : DEFAULT_SMS_SENDER;
}

// Business name used in both the review email and the review SMS, so the two
// channels never disagree on who is asking (mirrors the handoff sign-off; A4 /
// UK GDPR Arts.13/14 controller identification).
const BUSINESS_NAME = "Intelligent Carpet Cleaning";

module.exports = { googleReviewUrl, smsSenderId, BUSINESS_NAME, DEFAULT_SMS_SENDER };
