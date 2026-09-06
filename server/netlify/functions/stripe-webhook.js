// Stripe webhook (`/api/stripe-webhook`) — marks a job's deposit paid when the
// customer completes the hosted Checkout (D-004). The SIGNATURE is the only auth: we
// verify the Stripe-Signature header against STRIPE_WEBHOOK_SECRET in constant time
// and reject anything that does not match (constructWebhookEvent). No per-IP rate
// limit here on purpose — an unsigned flood fails the signature check cheaply and
// writes nothing, whereas rate-limiting Stripe's rotating IPs would risk dropping real
// events (guard-the-spend-paths: the signature is the named primary control, and the
// DB is touched only after it passes).
//
// Idempotent: marking paid is a compare-and-set UPDATE (... where deposit_status =
// 'unpaid'), so Stripe's at-least-once retries never double-apply (L-028: the claim is
// driven from code, not a partial-index upsert). A DB error returns 5xx so Stripe
// retries the delivery; anything handled or safely ignored returns 200 so it does not.
// CommonJS + injectable deps for `node --test`.

const { getSupabaseAdmin } = require("./supabaseClient.js");
const { constructWebhookEvent } = require("./paymentProvider.js");

function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// The exact raw body Stripe sent (needed for signature verification): Netlify
// base64-encodes some function bodies, so decode when the flag is set.
function rawBodyOf(event) {
  const b = event.body || "";
  return event.isBase64Encoded ? Buffer.from(b, "base64").toString("utf8") : b;
}

async function handlePost(event, headers, deps) {
  const { supabase, webhookSecret, now } = deps;
  if (!webhookSecret) return json(503, headers, { error: "Webhook not configured" });
  if (!supabase) return json(503, headers, { error: "Supabase not configured" });

  const h = event.headers || {};
  const sig = h["stripe-signature"] || h["Stripe-Signature"] || "";

  let stripeEvent;
  try {
    stripeEvent = constructWebhookEvent(rawBodyOf(event), sig, webhookSecret, now ? { now } : {});
  } catch (e) {
    // Bad or missing signature: reject and never touch the DB.
    return json(400, headers, { error: `Signature verification failed: ${e.message}` });
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = (stripeEvent.data && stripeEvent.data.object) || {};
    const jobId = session.metadata && session.metadata.job_id;
    // Only a genuinely PAID session marks the deposit paid (a completed-but-unpaid
    // session, e.g. an async method still pending, must not).
    if (session.payment_status !== "paid") {
      return json(200, headers, { ok: true, ignored: "session not paid" });
    }
    if (!jobId) {
      console.log("stripe-webhook: checkout.session.completed with no job_id metadata:", session.id);
      return json(200, headers, { ok: true, ignored: "no job_id" });
    }
    const { data, error } = await supabase
      .from("jobs")
      .update({
        deposit_status: "paid",
        deposit_paid_at: new Date().toISOString(),
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
      })
      .eq("id", jobId)
      .eq("deposit_status", "unpaid")
      .select("id");
    if (error) {
      // Transient DB failure: 5xx so Stripe retries the delivery.
      console.log("stripe-webhook: mark-paid failed:", error.message);
      return json(500, headers, { error: "Could not record payment" });
    }
    // applied === 0 => already paid (idempotent replay) or an unknown job id; both are
    // non-retryable, so acknowledge with 200.
    return json(200, headers, { ok: true, applied: (data || []).length });
  }

  // Any other event type: acknowledge so Stripe stops re-sending it.
  return json(200, headers, { ok: true, ignored: stripeEvent.type });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };
  const supabase = getSupabaseAdmin();
  try {
    return await handlePost(event, headers, {
      supabase,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  } catch (e) {
    console.log("stripe-webhook error:", e.message);
    return json(500, headers, { error: "Webhook handler error" });
  }
};

exports.handlePost = handlePost;
exports.rawBodyOf = rawBodyOf;
