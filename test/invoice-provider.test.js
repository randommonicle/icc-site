// D-026 invoicing adapter (invoiceProvider.js). The Stripe HTTP layer is faked via an
// injected fetch (as payment-provider / stripe-webhook do), so these exercise the real
// routing, param-building, normalisation and fail-closed behaviour with no network.

const { test } = require("node:test");
const assert = require("node:assert");

const inv = require("../server/netlify/functions/invoiceProvider.js");

// A dispatching fake Stripe: keys are "METHOD /path" (":id" wildcards a segment); a value
// is the JSON body (HTTP 200), or { httpStatus, body } to force a non-2xx. Records calls.
// (httpStatus is kept distinct from any `status` FIELD in a Stripe body, which is data.)
function stripeFake(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const method = opts.method || "GET";
    const path = url.replace("https://api.stripe.com/v1", "").split("?")[0];
    calls.push({ method, path, url, body: opts.body, headers: opts.headers || {} });
    for (const key of Object.keys(routes)) {
      const [m, p] = key.split(" ");
      if (m !== method) continue;
      const rx = new RegExp("^" + p.replace(/:[^/]+/g, "[^/]+") + "$");
      if (rx.test(path)) {
        const spec = routes[key];
        let status = 200, data = spec;
        if (spec && typeof spec === "object" && "httpStatus" in spec) { status = spec.httpStatus; data = spec.body !== undefined ? spec.body : {}; }
        return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => `no route ${method} ${path}` };
  };
  fn.calls = calls;
  return fn;
}

function withKey(fn) {
  const prev = process.env.STRIPE_SECRET_KEY;
  const prevProv = process.env.INVOICE_PROVIDER;
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  delete process.env.INVOICE_PROVIDER;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = prev;
      if (prevProv === undefined) delete process.env.INVOICE_PROVIDER; else process.env.INVOICE_PROVIDER = prevProv;
    });
}

test("isInvoicingConfigured is false without a key, true with one", () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  try {
    delete process.env.STRIPE_SECRET_KEY;
    assert.strictEqual(inv.isInvoicingConfigured(), false);
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    assert.strictEqual(inv.isInvoicingConfigured(), true);
  } finally {
    if (prev === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = prev;
  }
});

test("mapStripeStatus maps Stripe states to our invoice_status, unknown -> draft", () => {
  assert.strictEqual(inv.mapStripeStatus("draft"), "draft");
  assert.strictEqual(inv.mapStripeStatus("open"), "sent");
  assert.strictEqual(inv.mapStripeStatus("paid"), "paid");
  assert.strictEqual(inv.mapStripeStatus("void"), "void");
  assert.strictEqual(inv.mapStripeStatus("uncollectible"), "uncollectible");
  assert.strictEqual(inv.mapStripeStatus("something_new"), "draft");
});

test("findOrCreateStripeCustomer reuses an existing customer by email", () => withKey(async () => {
  const f = stripeFake({ "GET /customers": { data: [{ id: "cus_existing" }] } });
  const id = await inv.findOrCreateStripeCustomer({ email: "a@b.com" }, { fetch: f });
  assert.strictEqual(id, "cus_existing");
  assert.strictEqual(f.calls.length, 1, "did not create when one already existed");
}));

test("findOrCreateStripeCustomer creates when none is found", () => withKey(async () => {
  const f = stripeFake({ "GET /customers": { data: [] }, "POST /customers": { id: "cus_new" } });
  const id = await inv.findOrCreateStripeCustomer({ email: "a@b.com", name: "A B" }, { fetch: f });
  assert.strictEqual(id, "cus_new");
  assert.ok(f.calls.some((c) => c.method === "POST" && c.path === "/customers" && /name=A\+B/.test(c.body)));
}));

test("createDraftInvoice builds items + a draft invoice and normalises the shape", () => withKey(async () => {
  const f = stripeFake({
    "GET /customers": { data: [] },
    "POST /customers": { id: "cus_1" },
    "POST /invoiceitems": { id: "ii_1" },
    "POST /invoices": { id: "in_1", status: "draft", number: null, hosted_invoice_url: null, amount_due: 8250 },
  });
  const out = await inv.createDraftInvoice({
    customerEmail: "a@b.com",
    customerName: "A B",
    lines: [{ description: "Carpet clean", amountPence: 9000 }, { description: "Deposit already paid", amountPence: -750 }],
    metadata: { job_id: "job-1" },
    idempotencyKey: "invoice-job-1",
  }, { fetch: f });
  assert.deepStrictEqual(out, { providerInvoiceId: "in_1", status: "draft", number: null, paymentUrl: null, amountDuePence: 8250 });
  const items = f.calls.filter((c) => c.path === "/invoiceitems");
  assert.strictEqual(items.length, 2, "one Stripe invoice item per line");
  assert.ok(items.some((c) => /amount=-750/.test(c.body)), "the deposit credit is a negative line");
  const invCall = f.calls.find((c) => c.path === "/invoices");
  assert.ok(/metadata%5Bjob_id%5D=job-1/.test(invCall.body), "job id is threaded as metadata");
  assert.ok((invCall.headers["Idempotency-Key"] || "").includes("invoice-job-1"), "the invoice create carries an idempotency key");
}));

test("createDraftInvoice rejects a non-integer line amount (server-side money discipline)", () => withKey(async () => {
  const f = stripeFake({});
  await assert.rejects(
    inv.createDraftInvoice({ customerEmail: "a@b.com", lines: [{ description: "x", amountPence: 90.5 }] }, { fetch: f }),
    /integer/
  );
  assert.strictEqual(f.calls.length, 0, "no Stripe call is made on a bad amount");
}));

test("createDraftInvoice fails closed on a Stripe non-2xx", () => withKey(async () => {
  const f = stripeFake({
    "GET /customers": { data: [] },
    "POST /customers": { id: "cus_1" },
    "POST /invoiceitems": { id: "ii_1" },
    "POST /invoices": { httpStatus: 402, body: { error: { message: "card declined" } } },
  });
  await assert.rejects(
    inv.createDraftInvoice({ customerEmail: "a@b.com", lines: [{ description: "x", amountPence: 9000 }] }, { fetch: f }),
    /Stripe 402/
  );
}));

test("sendInvoice finalizes then sends and returns the populated shape", () => withKey(async () => {
  const f = stripeFake({
    "POST /invoices/:id/finalize": { id: "in_1", status: "open" },
    "POST /invoices/:id/send": { id: "in_1", status: "open", number: "ICC-0001", hosted_invoice_url: "https://pay.stripe/in_1", amount_due: 8250 },
  });
  const out = await inv.sendInvoice("in_1", { fetch: f });
  assert.deepStrictEqual(out, { providerInvoiceId: "in_1", status: "sent", number: "ICC-0001", paymentUrl: "https://pay.stripe/in_1", amountDuePence: 8250 });
  assert.deepStrictEqual(f.calls.map((c) => c.path), ["/invoices/in_1/finalize", "/invoices/in_1/send"]);
}));

test("getInvoiceStatus reads the invoice and maps paid", () => withKey(async () => {
  const f = stripeFake({ "GET /invoices/:id": { id: "in_1", status: "paid", number: "ICC-0001", hosted_invoice_url: "https://pay/in_1", amount_due: 0, amount_paid: 8250 } });
  const out = await inv.getInvoiceStatus("in_1", { fetch: f });
  assert.strictEqual(out.status, "paid");
  assert.strictEqual(out.amountPaidPence, 8250);
}));
