// D-025 — the provider-agnostic SMS sender + the The SMS Works adapter. Number
// normalisation and configuration are pure; the send is exercised with an
// injected fetch (no network), asserting the request shape and fail-closed.

const { test } = require("node:test");
const assert = require("node:assert");

const { sendSms, isSmsConfigured, normalizeUkMobile, sendViaSmsWorks, activeProvider } = require("../server/netlify/functions/smsProvider.js");

// Save/restore the env keys these tests toggle, so ordering never leaks state.
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("normalizeUkMobile canonicalises UK mobiles to 447xxxxxxxxx", () => {
  assert.equal(normalizeUkMobile("07900123456"), "447900123456");
  assert.equal(normalizeUkMobile("+447900123456"), "447900123456");
  assert.equal(normalizeUkMobile("447900123456"), "447900123456");
  assert.equal(normalizeUkMobile("0044 7900 123456"), "447900123456");
  assert.equal(normalizeUkMobile("07900 123 456"), "447900123456");
  assert.equal(normalizeUkMobile("7900123456"), "447900123456");
});

test("normalizeUkMobile returns null for non-mobiles and junk (skip, never mis-send)", () => {
  assert.equal(normalizeUkMobile("01242 279590"), null); // Cheltenham landline
  assert.equal(normalizeUkMobile("+1 202 555 0100"), null); // US number
  assert.equal(normalizeUkMobile(""), null);
  assert.equal(normalizeUkMobile(null), null);
  assert.equal(normalizeUkMobile("not a phone"), null);
  assert.equal(normalizeUkMobile("0790012345"), null);   // too short
  assert.equal(normalizeUkMobile("079001234567"), null); // too long
});

test("isSmsConfigured tracks the gateway key for the default provider", () => {
  withEnv({ SMS_PROVIDER: undefined, SMSWORKS_API_KEY: undefined }, () => {
    assert.equal(activeProvider(), "smsworks");
    assert.equal(isSmsConfigured(), false);
  });
  withEnv({ SMS_PROVIDER: undefined, SMSWORKS_API_KEY: "jwt-token" }, () => {
    assert.equal(isSmsConfigured(), true);
  });
  withEnv({ SMS_PROVIDER: "twilio", SMSWORKS_API_KEY: "jwt-token" }, () => {
    assert.equal(isSmsConfigured(), false); // no adapter for twilio yet
  });
});

test("sendViaSmsWorks posts the SMS Works shape and returns id + credits on 201", async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 201, json: async () => ({ messageid: "MSG-1", status: "SENT", credits: 1 }) };
  };
  const out = await withEnv({ SMSWORKS_API_KEY: "jwt-token", SMS_SENDER_ID: "ICCleaning" }, () =>
    sendViaSmsWorks({ destination: "447900123456", content: "Hi" }, fakeFetch));
  assert.equal(out.id, "MSG-1");
  assert.equal(out.credits, 1);
  assert.equal(captured.url, "https://api.thesmsworks.co.uk/v1/message/send");
  assert.equal(captured.opts.headers.Authorization, "jwt-token"); // raw JWT, no Bearer
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.destination, "447900123456");
  assert.equal(body.sender, "ICCleaning");
  assert.equal(body.content, "Hi");
});

test("sendViaSmsWorks throws on a non-2xx (fail-closed)", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => "bad token" });
  await withEnv({ SMSWORKS_API_KEY: "jwt-token" }, async () => {
    await assert.rejects(() => sendViaSmsWorks({ destination: "447900123456", content: "Hi" }, fakeFetch), /SMS Works 401/);
  });
});

test("sendSms rejects a non-UK-mobile before any HTTP call", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return { ok: true, status: 201, json: async () => ({}) }; };
  await withEnv({ SMSWORKS_API_KEY: "jwt-token" }, async () => {
    await assert.rejects(() => sendSms({ to: "01242 279590", body: "Hi" }, { fetch: fakeFetch }), /valid UK mobile/);
  });
  assert.equal(called, false, "no HTTP call for a bad number");
});

test("sendSms rejects when the provider is unconfigured", async () => {
  await withEnv({ SMSWORKS_API_KEY: undefined }, async () => {
    await assert.rejects(() => sendSms({ to: "07900123456", body: "Hi" }, { fetch: async () => ({}) }), /not configured/);
  });
});

test("sendSms sends via the SMS Works adapter when configured", async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 201, json: async () => ({ messageid: "X", credits: 1 }) }; };
  const out = await withEnv({ SMS_PROVIDER: "smsworks", SMSWORKS_API_KEY: "jwt-token" }, () =>
    sendSms({ to: "07900123456", body: "Hi" }, { fetch: fakeFetch }));
  assert.equal(out.id, "X");
  assert.equal(JSON.parse(captured.opts.body).destination, "447900123456");
});
