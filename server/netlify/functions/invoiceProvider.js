// Provider-agnostic invoicing adapter (D-026). The platform owns the invoice record
// (the local `invoices` row); the rail (Stripe Invoicing by default) issues + hosts the
// invoice and takes the card payment. INVOICE_PROVIDER selects the adapter (default
// 'stripe'), mirroring PAYMENT_PROVIDER / SMS_PROVIDER, so a later Stripe->Revolut or
// own-PDF move is a contained swap, not a rewrite (D-026:343).
//
// Dormant until configured (the house pattern, paymentProvider.js / smsProvider.js):
// with no STRIPE_SECRET_KEY, isInvoicingConfigured() is false and the invoice endpoint
// reports "not configured" and writes nothing. Keys are SERVER-SIDE ONLY. No card data
// touches ICC: the customer pays on Stripe's hosted invoice page (D-004).
//
// Amounts are integer pence, computed SERVER-SIDE from shared/config/pricing.js + the job
// (never a client figure or the assistant's free text) — the caller converts pounds->pence.
// A negative line is a credit (used for the already-paid deposit, Decision A in
// docs/BACKEND_PHASE1_PLAN.md). fetchImpl is injectable via opts for the unit tests;
// production uses the Node global fetch. Every call fails CLOSED: a non-2xx throws and the
// endpoint reports the failure rather than recording a half-made invoice.
// CommonJS for the Netlify functions and the plain-Node `node --test` runner.

const STRIPE_API = "https://api.stripe.com/v1";

function activeInvoiceProvider() {
  return String(process.env.INVOICE_PROVIDER || "stripe").toLowerCase();
}

// True when the active provider has the secret it needs. Drives dormant-until-configured.
function isInvoicingConfigured() {
  if (activeInvoiceProvider() === "stripe") return !!process.env.STRIPE_SECRET_KEY;
  return false;
}

// Map a Stripe invoice status to our invoice_status enum (draft|sent|paid|overdue|void|
// uncollectible). Stripe has no 'overdue' (an open invoice past its due date is overdue);
// that is derived from due_at, not carried here, so 'open' maps to 'sent'.
function mapStripeStatus(stripeStatus) {
  switch (String(stripeStatus || "")) {
    case "draft": return "draft";
    case "open": return "sent";
    case "paid": return "paid";
    case "void": return "void";
    case "uncollectible": return "uncollectible";
    default: return "draft";
  }
}

// One Stripe REST call, form-encoded, Bearer auth, optional Idempotency-Key. Throws on a
// non-2xx (fail-closed) with a short, safe detail slice; parses JSON only on success.
async function stripeCall(path, opts = {}) {
  if (activeInvoiceProvider() !== "stripe") throw new Error(`unsupported invoice provider: ${activeInvoiceProvider()}`);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("invoice provider not configured");
  const method = opts.method || "POST";
  const fetchImpl = opts.fetch || fetch;
  const headers = { Authorization: `Bearer ${key}` };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = String(opts.idempotencyKey);

  let url = `${STRIPE_API}${path}`;
  let body;
  if (method === "GET") {
    const qs = opts.params ? new URLSearchParams(opts.params).toString() : "";
    if (qs) url += `?${qs}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.params || {}).toString();
  }

  const res = await fetchImpl(url, { method, headers, body });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Stripe ${res.status}: ${String(detail).slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

// Reuse a Stripe customer by email or create one. Avoids a duplicate customer per invoice.
async function findOrCreateStripeCustomer(input, opts = {}) {
  const { email, name } = input || {};
  if (!email) throw new Error("customer email is required");
  const found = await stripeCall("/customers", { method: "GET", params: { email, limit: "1" }, fetch: opts.fetch });
  if (found && Array.isArray(found.data) && found.data.length > 0 && found.data[0].id) {
    return found.data[0].id;
  }
  const params = { email };
  if (name) params.name = name;
  const created = await stripeCall("/customers", { method: "POST", params, fetch: opts.fetch });
  if (!created || !created.id) throw new Error("Stripe returned no customer id");
  return created.id;
}

// Create a DRAFT invoice on the rail from server-derived line items. Returns a normalised
// shape { providerInvoiceId, status, number, paymentUrl, amountDuePence }. `number` and
// `paymentUrl` are null on a draft (Stripe assigns them at finalize). Idempotency is
// enforced primarily by the endpoint (skip if the local row already has a provider id);
// the Idempotency-Key here defends a same-request retry.
async function createDraftInvoice(input, opts = {}) {
  const {
    customerEmail,
    customerName,
    currency = "gbp",
    lines = [],
    daysUntilDue = 14,
    metadata = {},
    idempotencyKey,
  } = input || {};
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("at least one invoice line is required");
  for (const l of lines) {
    if (!Number.isInteger(l.amountPence)) throw new Error("each line amountPence must be an integer computed server-side");
  }

  const customerId = await findOrCreateStripeCustomer({ email: customerEmail, name: customerName }, opts);

  // Pending invoice items attach to the customer, then the draft invoice pulls them in.
  for (const l of lines) {
    await stripeCall("/invoiceitems", {
      method: "POST",
      params: { customer: customerId, currency, amount: String(l.amountPence), description: l.description || "Item" },
      idempotencyKey: idempotencyKey ? `${idempotencyKey}-item-${l.amountPence}-${(l.description || "").slice(0, 24)}` : undefined,
      fetch: opts.fetch,
    });
  }

  const invParams = {
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: String(daysUntilDue),
    auto_advance: "false",
    pending_invoice_items_behavior: "include",
  };
  for (const [k, v] of Object.entries(metadata)) invParams[`metadata[${k}]`] = String(v);

  const inv = await stripeCall("/invoices", {
    method: "POST",
    params: invParams,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-invoice` : undefined,
    fetch: opts.fetch,
  });
  if (!inv || !inv.id) throw new Error("Stripe returned no invoice id");
  return {
    providerInvoiceId: inv.id,
    status: mapStripeStatus(inv.status),
    number: inv.number || null,
    paymentUrl: inv.hosted_invoice_url || null,
    amountDuePence: typeof inv.amount_due === "number" ? inv.amount_due : null,
  };
}

// Finalize a draft and email it to the customer. Returns the same normalised shape; after
// finalize the number + hosted URL are populated.
async function sendInvoice(providerInvoiceId, opts = {}) {
  if (!providerInvoiceId) throw new Error("providerInvoiceId is required");
  await stripeCall(`/invoices/${encodeURIComponent(providerInvoiceId)}/finalize`, {
    method: "POST",
    params: { auto_advance: "false" },
    fetch: opts.fetch,
  });
  const inv = await stripeCall(`/invoices/${encodeURIComponent(providerInvoiceId)}/send`, {
    method: "POST",
    fetch: opts.fetch,
  });
  return {
    providerInvoiceId: inv.id || providerInvoiceId,
    status: mapStripeStatus(inv.status),
    number: inv.number || null,
    paymentUrl: inv.hosted_invoice_url || null,
    amountDuePence: typeof inv.amount_due === "number" ? inv.amount_due : null,
  };
}

// Read the current invoice state from the rail (status-reflect / verify-the-effect).
async function getInvoiceStatus(providerInvoiceId, opts = {}) {
  if (!providerInvoiceId) throw new Error("providerInvoiceId is required");
  const inv = await stripeCall(`/invoices/${encodeURIComponent(providerInvoiceId)}`, { method: "GET", fetch: opts.fetch });
  return {
    providerInvoiceId: inv.id || providerInvoiceId,
    status: mapStripeStatus(inv.status),
    number: inv.number || null,
    paymentUrl: inv.hosted_invoice_url || null,
    amountDuePence: typeof inv.amount_due === "number" ? inv.amount_due : null,
    amountPaidPence: typeof inv.amount_paid === "number" ? inv.amount_paid : null,
  };
}

module.exports = {
  activeInvoiceProvider,
  isInvoicingConfigured,
  mapStripeStatus,
  findOrCreateStripeCustomer,
  createDraftInvoice,
  sendInvoice,
  getInvoiceStatus,
};
