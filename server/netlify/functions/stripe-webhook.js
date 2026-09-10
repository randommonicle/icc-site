// Stripe webhook (`/api/stripe-webhook`) — marks a job's deposit paid when the
// customer completes the hosted Checkout (D-004), and reflects invoice lifecycle
// events onto the local `invoices` row (D-026: paid / finalized / voided /
// uncollectible). The SIGNATURE is the only auth: we verify the Stripe-Signature
// header against STRIPE_WEBHOOK_SECRET in constant time and reject anything that does
// not match (constructWebhookEvent). No per-IP rate limit here on purpose — an unsigned
// flood fails the signature check cheaply and writes nothing, whereas rate-limiting
// Stripe's rotating IPs would risk dropping real events (guard-the-spend-paths: the
// signature is the named primary control, and the DB is touched only after it passes).
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

  // D-026 invoice lifecycle: reflect the rail's state onto our invoices row.
  if (typeof stripeEvent.type === "string" && stripeEvent.type.startsWith("invoice.")) {
    return reflectInvoiceEvent(supabase, stripeEvent, headers);
  }

  // Any other event type: acknowledge so Stripe stops re-sending it.
  return json(200, headers, { ok: true, ignored: stripeEvent.type });
}

// Map a Stripe invoice.* event onto the local invoices row, keyed by provider_invoice_id
// (unique). invoice.paid is a compare-and-set (... where status <> 'paid') so an
// at-least-once replay never re-stamps paid_at; the others set the reflected status. An
// event for an invoice we do not have (applied 0) is acknowledged, not retried.
async function reflectInvoiceEvent(supabase, stripeEvent, headers) {
  const obj = (stripeEvent.data && stripeEvent.data.object) || {};
  const providerInvoiceId = obj.id;
  const type = stripeEvent.type;
  if (!providerInvoiceId) return json(200, headers, { ok: true, ignored: `${type} with no invoice id` });

  let patch;
  let idempotent = false;
  if (type === "invoice.paid") {
    patch = { status: "paid", paid_at: new Date().toISOString() };
    if (obj.number) patch.number = obj.number;
    if (obj.hosted_invoice_url) patch.payment_url = obj.hosted_invoice_url;
    idempotent = true; // guard: only when not already paid
  } else if (type === "invoice.finalized") {
    patch = { status: "sent" };
    if (obj.number) patch.number = obj.number;
    if (obj.hosted_invoice_url) patch.payment_url = obj.hosted_invoice_url;
  } else if (type === "invoice.voided") {
    patch = { status: "void" };
  } else if (type === "invoice.marked_uncollectible") {
    patch = { status: "uncollectible" };
  } else {
    // invoice.payment_failed etc.: nothing to reflect (overdue is derived from due_at).
    return json(200, headers, { ok: true, ignored: type });
  }

  let q = supabase.from("invoices").update(patch).eq("provider_invoice_id", providerInvoiceId);
  if (idempotent) q = q.neq("status", "paid");
  const { data, error } = await q.select("id");
  if (error) {
    console.log("stripe-webhook: invoice reflect failed:", error.message);
    return json(500, headers, { error: "Could not record invoice event" });
  }
  return json(200, headers, { ok: true, applied: (data || []).length });
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
exports.reflectInvoiceEvent = reflectInvoiceEvent;
