// Unit tests for the Stripe webhook (D-004). No network, no DB: the Supabase client
// is a chainable fake and events are signed with a test secret. Covers the dormant
// gate, signature rejection, the paid-session mark, idempotency, DB-error retry, and
// safe ignores.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const webhook = require("../server/netlify/functions/stripe-webhook.js");

const SECRET = "whsec_test";
const TS = 1_700_000_000;
const headers = { "Content-Type": "application/json" };

function sign(body) {
  const sig = crypto.createHmac("sha256", SECRET).update(`${TS}.${body}`).digest("hex");
  return `t=${TS},v1=${sig}`;
}
function eventFor(body) {
  return { httpMethod: "POST", isBase64Encoded: false, body, headers: { "stripe-signature": sign(body) } };
}
// Chainable fake mimicking supabase.from().update().eq().eq().select() -> {data,error}.
function fakeSupabase(result) {
  const calls = { filters: [] };
  const api = {
    from(t) { calls.from = t; return api; },
    update(f) { calls.update = f; return api; },
    eq(c, v) { calls.filters.push([c, v]); return api; },
    select(s) { calls.select = s; return Promise.resolve(result); },
  };
  return { api, calls };
}
function completedBody(object) {
  return JSON.stringify({ type: "checkout.session.completed", data: { object } });
}

test("handlePost returns 503 when the webhook secret is unset (dormant)", async () => {
  const { api } = fakeSupabase({ data: [], error: null });
  const res = await webhook.handlePost(eventFor("{}"), headers, { supabase: api, webhookSecret: null, now: TS });
  assert.equal(res.statusCode, 503);
});

test("handlePost rejects a bad signature with 400 and never touches the DB", async () => {
  const { api, calls } = fakeSupabase({ data: [], error: null });
  const body = completedBody({ id: "cs_1", payment_status: "paid", metadata: { job_id: "job-1" } });
  const evt = { httpMethod: "POST", isBase64Encoded: false, body, headers: { "stripe-signature": `t=${TS},v1=deadbeef` } };
  const res = await webhook.handlePost(evt, headers, { supabase: api, webhookSecret: SECRET, now: TS });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.update, undefined, "no DB write on a bad signature");
});

test("handlePost marks the deposit paid on a paid checkout.session.completed", async () => {
  const { api, calls } = fakeSupabase({ data: [{ id: "job-1" }], error: null });
  const body = completedBody({ id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { job_id: "job-1" } });
  const res = await webhook.handlePost(eventFor(body), headers, { supabase: api, webhookSecret: SECRET, now: TS });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).applied, 1);
  assert.equal(calls.update.deposit_status, "paid");
  assert.equal(calls.update.stripe_checkout_session_id, "cs_1");
  assert.equal(calls.update.stripe_payment_intent_id, "pi_1");
  assert.ok(calls.filters.some(([c, v]) => c === "id" && v === "job-1"), "filtered by job id");
  assert.ok(calls.filters.some(([c, v]) => c === "deposit_status" && v === "unpaid"), "CAS on still-unpaid");
});

test("handlePost is idempotent: a replay that updates 0 rows still 200s", async () => {
  const { api } = fakeSupabase({ data: [], error: null });
  const body = completedBody({ id: "cs_1", payment_status: "paid", metadata: { job_id: "job-1" } });
  const res = await webhook.handlePost(eventFor(body), headers, { supabase: api, webhookSecret: SECRET, now: TS });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).applied, 0);
});

test("handlePost returns 500 on a DB error so Stripe retries the delivery", async () => {
  const { api } = fakeSupabase({ data: null, error: { message: "boom" } });
  const body = completedBody({ id: "cs_1", payment_status: "paid", metadata: { job_id: "job-1" } });
  const res = await webhook.handlePost(eventFor(body), headers, { supabase: api, webhookSecret: SECRET, now: TS });
  assert.equal(res.statusCode, 500);
});

test("handlePost ignores an unpaid session and unrelated event types without writing", async () => {
  const unpaid = fakeSupabase({ data: [], error: null });
  const bodyUnpaid = completedBody({ id: "cs_1", payment_status: "unpaid", metadata: { job_id: "job-1" } });
  let res = await webhook.handlePost(eventFor(bodyUnpaid), headers, { supabase: unpaid.api, webhookSecret: SECRET, now: TS });
  assert.equal(res.statusCode, 200);
  assert.equal(unpaid.calls.update, undefined, "unpaid session writes nothing");

  const other = fakeSupabase({ data: [], error: null });
  const bodyOther = JSON.stringify({ type: "payment_intent.created", data: { object: {} } });
  res = await webhook.handlePost(eventFor(bodyOther), headers, { supabase: other.api, webhookSecret: SECRET, now: TS });
  assert.equal(res.statusCode, 200);
  assert.equal(other.calls.update, undefined, "unrelated event writes nothing");
});
