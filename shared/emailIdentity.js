// Customer-facing email identity, single-sourced (review finding A4; UK GDPR Arts.13/14).
//
// Every email a customer receives must let them see who holds their data and reach a
// real mailbox: a From, a monitored Reply-To, and a privacy-notice link. Until 18 Sept
// 2026 these three values (and the public site origin the link is built from) were
// declared separately in chat.js, handoffs.js, bookingDecision.js, reviewRequest.js,
// bookingAdmin.js and paymentProvider.js, each "mirroring" the others by comment, and
// the operator-side pair three times over. A comment is not a control (L-031, L-034):
// this module is the one place they live, and test/email-identity.test.js fails the
// suite if a function file declares its own copy.
//
// All are env-overridable so they track the domain at cutover with no code change; the
// defaults are the live ICC values. The env is read per call (not at module load), so
// a test can set it around a call and a function never bakes a stale value in.

const DEFAULT_SITE_URL = "https://www.intelligentclean.co.uk";
const DEFAULT_CUSTOMER_FROM = "Intelligent Carpet Cleaning <onboarding@resend.dev>";
const DEFAULT_CUSTOMER_REPLY_TO = "hello@intelligentclean.co.uk";
const DEFAULT_OPERATOR_EMAIL = "ben.graham240689@gmail.com";
const DEFAULT_OPERATOR_FROM = "ICC Bookings <onboarding@resend.dev>";

function stripSlash(s) {
  return String(s).replace(/\/+$/, "");
}

// The public site origin, no trailing slash (so callers can append a path safely).
function siteUrl(env) {
  const e = env || process.env;
  return stripSlash(e.PUBLIC_SITE_URL || DEFAULT_SITE_URL);
}

// The privacy-notice URL. `base` is injectable for tests and for callers that already
// hold an origin; a trailing slash on it is normalised so we never emit a double slash.
function privacyNoticeUrl(base, env) {
  return `${base ? stripSlash(base) : siteUrl(env)}/privacy`;
}

// The From header on customer emails (a verified sending identity once set).
function customerFrom(env) {
  const e = env || process.env;
  return e.CUSTOMER_FROM || DEFAULT_CUSTOMER_FROM;
}

// A real, monitored Reply-To so a customer's reply reaches ICC even when the From is a
// send-only or sandbox address.
function customerReplyTo(env) {
  const e = env || process.env;
  return e.CUSTOMER_REPLY_TO || DEFAULT_CUSTOMER_REPLY_TO;
}

// The operator side: where booking notices and escalations go, and the From they carry.
// Internal to Mark, so these emails deliberately get no Reply-To or privacy link. Was
// copied three times (chat.js twice, bookingAdmin.js) with the same defaults.
function operatorEmail(env) {
  const e = env || process.env;
  return e.OPERATOR_EMAIL || DEFAULT_OPERATOR_EMAIL;
}

function operatorFrom(env) {
  const e = env || process.env;
  return e.OPERATOR_FROM || DEFAULT_OPERATOR_FROM;
}

module.exports = { siteUrl, privacyNoticeUrl, customerFrom, customerReplyTo, operatorEmail, operatorFrom };
