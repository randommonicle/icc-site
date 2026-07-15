// Provider-agnostic SMS sender (D-025). One thin adapter per gateway; the active
// gateway is chosen by SMS_PROVIDER (default 'smsworks'). Isolating the provider
// here is deliberate: switching to Twilio or another vendor is a new adapter
// function, not a change to the review-request flow that calls sendSms().
//
// Dormant until configured, like the Supabase wiring: with no gateway key,
// isSmsConfigured() is false and the review endpoint reports SMS as "not
// configured" rather than erroring. Keys are server-side only (Architecture
// rule 1). CommonJS for `node --test`.

const { smsSenderId } = require("../../../shared/config/reviews.js");

// Normalise a UK number to the gateway's "447xxxxxxxxx" form (E.164 without the
// leading +). Returns null for anything that is not a plausible UK MOBILE, so a
// landline, an international number, or a malformed value is SKIPPED by the caller
// (no failed send, no wrong-number text) rather than pushed to the gateway. A
// review text only makes sense to a mobile.
function normalizeUkMobile(raw) {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("0044")) s = s.slice(2);           // 0044 7... -> 44 7...
  else if (s.startsWith("44")) { /* already 44... */ }
  else if (s.startsWith("0")) s = "44" + s.slice(1);  // 07... -> 447...
  else if (/^7\d{9}$/.test(s)) s = "44" + s;          // bare 7... mobile -> 447...
  return /^447\d{9}$/.test(s) ? s : null;             // UK mobile: 447 + 9 digits
}

function activeProvider() {
  return String(process.env.SMS_PROVIDER || "smsworks").toLowerCase();
}

// True when the active gateway has the credentials it needs to send. Drives the
// dormant-until-configured behaviour in the review endpoint.
function isSmsConfigured() {
  if (activeProvider() === "smsworks") return !!process.env.SMSWORKS_API_KEY;
  return false;
}

// The SMS Works adapter. POST /v1/message/send with the JWT in the Authorization
// header (no "Bearer" prefix — their scheme is the raw token) and a
// {sender,destination,content} body; 201 on success with {messageid,credits}.
// Throws on any non-2xx so the caller fails closed (records 'sent' only on
// success). fetchImpl is injectable for the unit test.
async function sendViaSmsWorks({ destination, content }, fetchImpl) {
  const apiKey = process.env.SMSWORKS_API_KEY;
  const res = await fetchImpl("https://api.thesmsworks.co.uk/v1/message/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": apiKey },
    body: JSON.stringify({ sender: smsSenderId(), destination, content }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SMS Works ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { id: data.messageid || null, credits: data.credits == null ? null : data.credits };
}

// Send an SMS to a UK mobile. Throws on a number that is not a UK mobile (the
// caller should pre-check with normalizeUkMobile), an unconfigured/unknown
// provider, or a non-2xx from the gateway — fail-closed, so the caller only marks
// the message 'sent' when this resolves. opts.fetch overrides the HTTP client
// (tests); production uses the Node 24 global fetch.
async function sendSms({ to, body }, opts = {}) {
  const fetchImpl = opts.fetch || fetch;
  const destination = normalizeUkMobile(to);
  if (!destination) throw new Error("not a valid UK mobile number");
  if (!isSmsConfigured()) throw new Error("SMS provider not configured");
  if (activeProvider() === "smsworks") {
    return sendViaSmsWorks({ destination, content: body }, fetchImpl);
  }
  throw new Error(`unsupported SMS provider: ${activeProvider()}`);
}

module.exports = { sendSms, isSmsConfigured, normalizeUkMobile, sendViaSmsWorks, activeProvider };
