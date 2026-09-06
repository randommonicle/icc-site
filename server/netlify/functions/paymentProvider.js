// Provider-agnostic payment adapter for the deposit pay-link (D-004), reusing the
// D-026 Stripe mechanism. One thin adapter; the active provider is chosen by
// PAYMENT_PROVIDER (default 'stripe'). Isolating Stripe here is deliberate: the
// still-open D-004 Stripe-vs-Revolut choice, or a later move, is a new adapter
// function, not a change to the booking flow that calls it (mirrors smsProvider.js).
//
// Dormant until configured (the house pattern, smsProvider.js / supabaseClient.js):
// with no STRIPE_SECRET_KEY, isPaymentConfigured() is false and the booking flow
// creates no pay link and keeps its existing "Mark will be in touch" wording. Keys
// are SERVER-SIDE ONLY (Architecture rule 1). Card data never touches ICC: the
// customer pays on Stripe's hosted Checkout page (D-004, no card data stored).
// CommonJS for the Netlify functions and the plain-Node `node --test` runner.

const crypto = require("crypto");

const STRIPE_API = "https://api.stripe.com/v1";

function activeProvider() {
  return String(process.env.PAYMENT_PROVIDER || "stripe").toLowerCase();
}

// True when the active provider has the secret it needs. Drives the
// dormant-until-configured behaviour at the call sites.
function isPaymentConfigured() {
  if (activeProvider() === "stripe") return !!process.env.STRIPE_SECRET_KEY;
  return false;
}

// Create a Stripe Checkout Session for a deposit and return { url, id }.
//
// amountPence MUST be a positive integer computed SERVER-SIDE (never the assistant's
// free-text figure, never a client value) — it is the money charged, so we throw on
// anything else and a bad amount can never reach a customer (server-side-authority).
// An Idempotency-Key (when given) makes a retried create return the SAME session, not
// a second pay page. fetchImpl is injectable for the unit test; production uses the
// Node 24 global fetch. Throws on a non-2xx or a missing url (fail-closed): the caller
// then sends the email WITHOUT a pay button rather than a broken link.
async function createDepositCheckout(input, opts = {}) {
  const {
    amountPence,
    currency = "gbp",
    customerEmail,
    description,
    successUrl,
    cancelUrl,
    jobId,
    idempotencyKey,
  } = input || {};

  if (activeProvider() !== "stripe") throw new Error(`unsupported payment provider: ${activeProvider()}`);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("payment provider not configured");
  if (!Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("amountPence must be a positive integer computed server-side");
  }
  if (!successUrl || !cancelUrl) throw new Error("successUrl and cancelUrl are required");

  const fetchImpl = opts.fetch || fetch;
  const params = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountPence),
    "line_items[0][price_data][product_data][name]": description || "Deposit",
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  if (customerEmail) params.customer_email = customerEmail;
  if (jobId != null) {
    params["metadata[job_id]"] = String(jobId);
    // Carry the id on the PaymentIntent too, so a refund/dispute webhook can find the job.
    params["payment_intent_data[metadata][job_id]"] = String(jobId);
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);

  const res = await fetchImpl(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Stripe ${res.status}: ${String(detail).slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data.url || !data.id) throw new Error("Stripe returned no checkout url");
  return { url: data.url, id: data.id };
}

// Build and create a deposit Checkout Session for a specific job. Centralises the
// amount conversion (pounds -> integer pence), the description, the success/cancel
// redirect URLs and a job-derived Idempotency-Key, so both booking paths (auto-confirm
// in chat.js, provisional-accept in bookingAction.js) create the session identically.
// depositPounds MUST be the server-derived figure (jobs.deposit_ex_vat). Returns
// { url, id }; throws on a bad amount or a Stripe error, so the caller fails safe
// (sends the email without a pay button). fetchImpl is injectable via opts for tests.
async function createDepositCheckoutForJob(input, opts = {}) {
  const { jobId, depositPounds, customerEmail, dateLabel, origin } = input || {};
  const base = String(origin || process.env.PUBLIC_SITE_URL || "https://www.intelligentclean.co.uk").replace(/\/+$/, "");
  const amountPence = Math.round(Number(depositPounds) * 100);
  return createDepositCheckout(
    {
      amountPence,
      customerEmail,
      description: `Deposit for your carpet clean${dateLabel ? " on " + dateLabel : ""}`,
      successUrl: `${base}/?deposit=paid`,
      cancelUrl: `${base}/book`,
      jobId,
      idempotencyKey: `deposit-${jobId}-${amountPence}`,
    },
    opts
  );
}

// Verify a Stripe webhook signature and return the parsed event, or throw.
//
// Stripe signs `${timestamp}.${rawBody}` with the endpoint secret (HMAC-SHA256) and
// sends `t=<ts>,v1=<sig>[,v1=<sig>...]` in the Stripe-Signature header. We recompute
// and compare in CONSTANT TIME (timingSafeEqual over equal-length digests), and reject
// a timestamp outside the tolerance window (replay defence). rawBody MUST be the exact
// bytes Stripe sent; the JSON is parsed only AFTER the signature checks out, so an
// unsigned body is never interpreted (constant-time-secret-compare).
function constructWebhookEvent(rawBody, sigHeader, secret, opts = {}) {
  const toleranceSec = opts.toleranceSec || 300;
  const now = opts.now || Math.floor(Date.now() / 1000);
  if (!secret) throw new Error("webhook secret not configured");
  const body = typeof rawBody === "string" ? rawBody : String(rawBody == null ? "" : rawBody);
  if (typeof sigHeader !== "string" || !sigHeader) throw new Error("missing signature header");

  let t = null;
  const v1 = [];
  for (const part of sigHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || v1.length === 0) throw new Error("malformed signature header");

  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSec) {
    throw new Error("signature timestamp outside tolerance");
  }

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const matched = v1.some((sig) => {
    let provided;
    try {
      provided = Buffer.from(sig, "hex");
    } catch (e) {
      return false;
    }
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  });
  if (!matched) throw new Error("signature mismatch");

  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error("valid signature but body is not JSON");
  }
}

module.exports = {
  activeProvider,
  isPaymentConfigured,
  createDepositCheckout,
  createDepositCheckoutForJob,
  constructWebhookEvent,
};
