// Unit tests for the Stripe deposit adapter (D-004). No network: fetch is injected.
// Covers the dormant gate, the server-derived-amount guard, the request shape, the
// fail-closed behaviour, and constant-time webhook-signature verification.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const provider = require("../server/netlify/functions/paymentProvider.js");

// Set env vars for one test and restore them after (the adapter reads env at call time).
async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const k of Object.keys(vars)) {
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const failFetch = () => {
  throw new Error("Stripe must not be called");
};

test("isPaymentConfigured is false without a key, true with one (stripe default)", async () => {
  await withEnv({ PAYMENT_PROVIDER: undefined, STRIPE_SECRET_KEY: undefined }, async () => {
    assert.equal(provider.isPaymentConfigured(), false);
  });
  await withEnv({ PAYMENT_PROVIDER: undefined, STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    assert.equal(provider.isPaymentConfigured(), true);
  });
});

test("createDepositCheckout refuses a non-integer or non-positive amount (server-side-authority)", async () => {
  await withEnv({ STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    for (const bad of [0, -5, 12.5, NaN, "500", null, undefined]) {
      await assert.rejects(
        () =>
          provider.createDepositCheckout(
            { amountPence: bad, successUrl: "https://x/s", cancelUrl: "https://x/c" },
            { fetch: failFetch }
          ),
        /positive integer/
      );
    }
  });
});

test("createDepositCheckout throws when no key is set (dormant, no call made)", async () => {
  await withEnv({ STRIPE_SECRET_KEY: undefined }, async () => {
    await assert.rejects(
      () =>
        provider.createDepositCheckout(
          { amountPence: 500, successUrl: "https://x/s", cancelUrl: "https://x/c" },
          { fetch: failFetch }
        ),
      /not configured/
    );
  });
});

test("createDepositCheckout posts a Checkout Session and returns {url,id}", async () => {
  await withEnv({ STRIPE_SECRET_KEY: "sk_test_abc" }, async () => {
    let captured;
    const fakeFetch = async (url, init) => {
      captured = { url, init };
      return { ok: true, json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" }) };
    };
    const out = await provider.createDepositCheckout(
      {
        amountPence: 4750,
        customerEmail: "a@b.com",
        description: "Deposit for 2026-09-20",
        successUrl: "https://icc/success",
        cancelUrl: "https://icc/cancel",
        jobId: "job-123",
        idempotencyKey: "dep-job-123",
      },
      { fetch: fakeFetch }
    );
    assert.deepEqual(out, { url: "https://checkout.stripe.com/pay/cs_test_1", id: "cs_test_1" });
    assert.match(captured.url, /\/checkout\/sessions$/);
    assert.equal(captured.init.method, "POST");
    assert.equal(captured.init.headers.Authorization, "Bearer sk_test_abc");
    assert.equal(captured.init.headers["Idempotency-Key"], "dep-job-123");
    const decoded = decodeURIComponent(captured.init.body);
    assert.match(decoded, /mode=payment/);
    assert.match(decoded, /\[unit_amount\]=4750/);
    assert.match(decoded, /metadata\[job_id\]=job-123/);
    assert.match(decoded, /customer_email=a@b.com/);
  });
});

test("createDepositCheckout throws (fail-closed) on a non-2xx from Stripe", async () => {
  await withEnv({ STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    const fakeFetch = async () => ({ ok: false, status: 402, text: async () => "card_declined" });
    await assert.rejects(
      () =>
        provider.createDepositCheckout(
          { amountPence: 500, successUrl: "https://x/s", cancelUrl: "https://x/c" },
          { fetch: fakeFetch }
        ),
      /Stripe 402/
    );
  });
});

test("createDepositCheckout throws if Stripe returns no url", async () => {
  await withEnv({ STRIPE_SECRET_KEY: "sk_test_x" }, async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => ({ id: "cs_1" }) });
    await assert.rejects(
      () =>
        provider.createDepositCheckout(
          { amountPence: 500, successUrl: "https://x/s", cancelUrl: "https://x/c" },
          { fetch: fakeFetch }
        ),
      /no checkout url/
    );
  });
});

// --- webhook signature verification ---------------------------------------

function sign(body, secret, ts) {
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

test("constructWebhookEvent accepts a correctly signed body and returns the event", () => {
  const secret = "whsec_test";
  const ts = 1_700_000_000;
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const evt = provider.constructWebhookEvent(body, sign(body, secret, ts), secret, { now: ts });
  assert.equal(evt.type, "checkout.session.completed");
  assert.equal(evt.data.object.id, "cs_1");
});

test("constructWebhookEvent rejects a tampered body", () => {
  const secret = "whsec_test";
  const ts = 1_700_000_000;
  const header = sign('{"a":1}', secret, ts);
  assert.throws(() => provider.constructWebhookEvent('{"a":2}', header, secret, { now: ts }), /signature mismatch/);
});

test("constructWebhookEvent rejects a stale timestamp (replay defence)", () => {
  const secret = "whsec_test";
  const ts = 1_700_000_000;
  const header = sign("{}", secret, ts);
  assert.throws(() => provider.constructWebhookEvent("{}", header, secret, { now: ts + 4000 }), /outside tolerance/);
});

test("constructWebhookEvent rejects a missing or malformed header", () => {
  const secret = "whsec_test";
  assert.throws(() => provider.constructWebhookEvent("{}", "", secret, { now: 1 }), /missing signature/);
  assert.throws(() => provider.constructWebhookEvent("{}", "t=1", secret, { now: 1 }), /malformed signature/);
});
