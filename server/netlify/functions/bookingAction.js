// D-027 provisional-booking accept/decline endpoint (`/api/booking-action`) — the
// PUBLIC path. A booking that finishes after the auto-confirm line (15:00) is TAKEN
// and HOLDS its slot but waits for Mark to accept or decline it. Mark does that from a
// one-click link in his notification email; the link opens a READ-ONLY page
// (site/src/pages/booking-action.astro) with the action token in the URL FRAGMENT, and
// the page POSTs {job, token, action} here.
//
// The shared decision core (the compare-and-set, the customer emails, the token
// lifecycle) lives in bookingDecision.js; this file is the PUBLIC authorisation on top
// of it. The load-bearing rules (cross-agent reviews 2026-09-01 and 2026-09-02):
//   - AUTH is the token, not the job id. The presented token is hashed and compared
//     CONSTANT-TIME against the stored SHA-256 hash; the plaintext is never stored. No
//     admin session — the token is the capability. (The admin fallback bookingAdmin.js
//     is authorised the other way, solely by requireAdmin.)
//   - POST ONLY. A mutating GET would be fired by a mail-scanner prefetch. 405 else.
//   - The EXPIRY gate lives HERE, not in the core: it is a token concern. The admin
//     path deliberately has no expiry gate (it must resolve a stale awaiting booking).
//   - IDEMPOTENT + MONOTONIC via decideProvisional's compare-and-set (0 rows -> 409).
//   - CLAIM-THEN-SEND: the CAS is the single-winner claim, so at most one email per
//     decision; a send failure is logged 'failed' for the admin to resend (Phase 5).
//
// CommonJS to match the other functions and the plain-Node `node --test` runner.

const crypto = require("crypto");
const { getSupabaseAdmin } = require("./supabaseClient.js");
const { getClientIP, tooManyResponse, enforceRateLimit } = require("./rateLimit.js");
const {
  loadJob,
  bookingSummary,
  decideProvisional,
  notifyCustomerOutcome,
  buildAcceptEmail,
  buildDeclineEmail,
  messageRow,
} = require("./bookingDecision.js");
const { isPaymentConfigured, createDepositCheckoutForJob } = require("./paymentProvider.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// Constant-time check that a presented plaintext token hashes to the stored hash.
// The stored value is the SHA-256 HEX digest (64 chars); hash the presented token the
// same way and compare the fixed 32-byte digests, so timingSafeEqual never sees a
// length mismatch (which would throw and leak length). The structural guards (types,
// hex length) are on non-secret shape, not the secret. Public-path only — the admin
// path presents no token.
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

// POST dispatcher. Deps are injectable so the tests exercise auth, the CAS, idempotency
// and claim-then-send without any network: supabase (a fake client), resendKey,
// sendEmailFn.
async function handlePost(event, headers, deps) {
  const { supabase, resendKey } = deps;
  // Deposit pay-link (D-004): created after the accept CAS below (it needs the job's
  // server-derived deposit). deps.depositPayUrl / deps.createDepositCheckout override for tests.
  let depositPayUrl = deps.depositPayUrl || null;

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
  // Authorise on the TOKEN. A missing job and a bad token look identical to the caller,
  // so a job id alone reveals nothing (server-side-authority). No PII before this.
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

  // accept / decline. Early-out for the common already-resolved case; the CAS below is
  // the real single-winner guard against a concurrent action.
  if (state !== "awaiting_operator") {
    return json(409, headers, { error: "This booking has already been actioned.", state, decidedAt: job.operator_decided_at || null });
  }
  if (expired) {
    return json(410, headers, { error: "This action link has expired. Please action the booking from the admin dashboard.", state });
  }

  // Bind the CAS to the hash we verified, so a resend that rotated the token between the
  // verify above and here makes this stale request lose (0 rows -> 409).
  const rows = await decideProvisional(supabase, id, action, { expectedHash: job.operator_action_token_hash });
  if (rows === 0) {
    // Lost the compare-and-set (a concurrent accept/decline/resend won, or the token was
    // consumed between load and update): already actioned.
    return json(409, headers, { error: "This booking has already been actioned." });
  }

  const newState = action === "accept" ? "operator_confirmed" : "operator_declined";

  // Deposit pay-link (D-004): on ACCEPT, create the Stripe Checkout Session for the job's
  // server-derived deposit and thread its URL into the accept email. Dormant and fail-safe:
  // skipped unless payment is configured and the job has a numeric deposit, and any error
  // just omits the button (the CAS has already committed the acceptance).
  const createCheckout = deps.createDepositCheckout || createDepositCheckoutForJob;
  if (action === "accept" && !depositPayUrl && isPaymentConfigured() && Number(job.deposit_ex_vat) > 0) {
    try {
      const created = await createCheckout({
        jobId: id,
        depositPounds: job.deposit_ex_vat,
        customerEmail: (job.customers && job.customers.email) || null,
        dateLabel: job.slot_date,
      });
      depositPayUrl = created.url;
      await supabase.from("jobs").update({ stripe_checkout_session_id: created.id }).eq("id", id).eq("deposit_status", "unpaid");
    } catch (e) {
      console.log("deposit checkout creation failed (accept email will omit the pay link):", e.message);
    }
  }

  // Claim-then-send lives in the shared core: the winning CAS above is the claim, so at
  // most one notice per decision, and the core ALWAYS logs a row (visible + retryable).
  const { emailed } = await notifyCustomerOutcome(supabase, job, action, {
    resendKey,
    sendEmailFn: deps.sendEmailFn,
    depositPayUrl,
  });

  return json(200, headers, { ok: true, state: newState, emailed });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

  // Per-IP cap: defence-in-depth, matching the availability cap (60/hr). The single-use
  // token is the PRIMARY control (no valid token, no state change and no email), and a
  // valid token lives only in Mark's inbox; 60/hr sits comfortably above one operator's
  // realistic use (a review is ~2 requests) while still bounding an anonymous flood. It
  // fails open on a limiter outage so a real operator is never blocked (L-001).
  const ip = getClientIP(event);
  const rl = await enforceRateLimit(ip, "rl:bookaction", 60);
  if (!rl.ok) return tooManyResponse(headers, rl.retryAfter);

  const supabase = getSupabaseAdmin();
  try {
    return await handlePost(event, headers, { supabase, resendKey: process.env.RESEND_API_KEY });
  } catch (e) {
    console.log("booking-action error:", e.message);
    return json(500, headers, { error: "Something went wrong. Please try again or use the admin dashboard." });
  }
};

// Exported for unit tests (test/booking-action.test.js). messageRow / buildAcceptEmail
// / buildDeclineEmail are re-exported from the shared core so the existing test imports
// keep working.
exports.handlePost = handlePost;
exports.tokenMatches = tokenMatches;
exports.messageRow = messageRow;
exports.buildAcceptEmail = buildAcceptEmail;
exports.buildDeclineEmail = buildDeclineEmail;
