// D-025 — the "mark complete & request review" endpoint. handlePost is exercised
// with a fake Supabase client and injected send functions (no network), covering
// the status transition, the per-channel gates, idempotency, and fail-closed
// logging. Mirrors the handoffs.js test style.

const { test } = require("node:test");
const assert = require("node:assert");

const { handlePost } = require("../server/netlify/functions/reviewRequest.js");
const { annotateReviewSent, annotateNoticeSent } = require("../server/netlify/functions/bookings.js");

const headers = { "Content-Type": "application/json" };
const URL = "https://g.page/r/exampleplaceid/review";

function baseJob(overrides = {}) {
  return {
    id: "job-1",
    status: "booked",
    customer_id: "cust-1",
    slot_date: "2026-07-01",
    customers: { name: "Sarah Jenkins", phone: "07900123456", email: "sarah@example.com" },
    ...overrides,
  };
}

// Fake Supabase honouring the calls handlePost makes: jobs read (limit) + update
// (awaited chain), messages read (sentReviewChannels) + insert (logMessage).
function makeSupabase({ job = null, sentChannels = [] } = {}) {
  const inserts = [];
  const updates = [];
  function jobsChain() {
    let isUpdate = false, fields = null;
    const filters = {};
    const readResult = () => {
      const match = job && (filters.id == null || String(job.id) === String(filters.id));
      return { data: match ? [job] : [], error: null };
    };
    const chain = {
      select() { return chain; },
      update(f) { isUpdate = true; fields = f; return chain; },
      eq(c, v) { filters[c] = v; return chain; },
      neq(c, v) { filters["neq:" + c] = v; return chain; },
      limit() { return Promise.resolve(readResult()); },
      then(resolve) { if (isUpdate) { updates.push({ fields, filters }); resolve({ data: [{}], error: null }); } else { resolve(readResult()); } },
    };
    return chain;
  }
  function messagesChain() {
    const chain = {
      select() { return chain; },
      insert(row) { inserts.push(row); return Promise.resolve({ error: null }); },
      eq() { return chain; },
      then(resolve) { resolve({ data: sentChannels.map((ch) => ({ channel: ch })), error: null }); },
    };
    return chain;
  }
  return { client: { from(t) { return t === "messages" ? messagesChain() : jobsChain(); } }, inserts, updates };
}

function spy(behavior) {
  const calls = [];
  const fn = async (...args) => { calls.push(args); if (typeof behavior === "function") return behavior(...args); return behavior; };
  fn.calls = calls;
  return fn;
}

function post(bodyObj) { return { httpMethod: "POST", headers: {}, body: JSON.stringify(bodyObj) }; }

function deps(fake, over = {}) {
  return {
    supabase: fake.client,
    resendKey: "re_test",
    reviewUrl: URL,
    smsConfigured: true,
    sendEmailFn: spy({ id: "email-1" }),
    sendSmsFn: spy({ id: "sms-1" }),
    ...over,
  };
}

async function run(fake, bodyObj, over = {}) {
  const d = deps(fake, over);
  const res = await handlePost(post(bodyObj), headers, d);
  return { res, body: JSON.parse(res.body), d, fake };
}

test("503 when Supabase is not configured", async () => {
  const res = await handlePost(post({ action: "complete_and_request", job_id: "x" }), headers, { supabase: null });
  assert.equal(res.statusCode, 503);
});

test("400 on an unknown action and on a missing job_id", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const a = await run(fake, { action: "nope", job_id: "job-1" });
  assert.equal(a.res.statusCode, 400);
  const b = await run(makeSupabase({ job: baseJob() }), { action: "complete_and_request" });
  assert.equal(b.res.statusCode, 400);
});

test("404 when the job id matches no job", async () => {
  const { res } = await run(makeSupabase({ job: null }), { action: "complete_and_request", job_id: "ghost" });
  assert.equal(res.statusCode, 404);
});

test("409 for a cancelled job (never silently completed)", async () => {
  const fake = makeSupabase({ job: baseJob({ status: "cancelled" }) });
  const { res } = await run(fake, { action: "complete_and_request", job_id: "job-1" });
  assert.equal(res.statusCode, 409);
  assert.equal(fake.updates.length, 0);
});

test("happy path: completes the job and sends both channels, logging two sent rows", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body, d } = await run(fake, { action: "complete_and_request", job_id: "job-1" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.status, "completed");
  assert.equal(body.results.email.sent, true);
  assert.equal(body.results.sms.sent, true);
  // status moved to completed
  assert.equal(fake.updates.length, 1);
  assert.equal(fake.updates[0].fields.status, "completed");
  // email fn got (address, content, resendKey); sms fn got (447..., body)
  assert.equal(d.sendEmailFn.calls[0][0], "sarah@example.com");
  assert.equal(d.sendEmailFn.calls[0][2], "re_test");
  assert.equal(d.sendSmsFn.calls[0][0], "447900123456");
  assert.match(d.sendSmsFn.calls[0][1], /Google review/);
  // two 'sent' messages logged, one per channel
  const sent = fake.inserts.filter((r) => r.status === "sent");
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((r) => r.channel).sort(), ["email", "sms"]);
  for (const r of sent) { assert.equal(r.kind, "review_request"); assert.equal(r.requires_consent, false); assert.equal(r.customer_id, "cust-1"); assert.ok(r.sent_at); }
});

test("idempotent: a channel already sent is skipped, and nothing is re-sent", async () => {
  const fake = makeSupabase({ job: baseJob(), sentChannels: ["email", "sms"] });
  const { body, d, fake: f } = await run(fake, { action: "complete_and_request", job_id: "job-1" });
  assert.equal(body.results.email.reason, "Already sent");
  assert.equal(body.results.sms.reason, "Already sent");
  assert.equal(d.sendEmailFn.calls.length, 0);
  assert.equal(d.sendSmsFn.calls.length, 0);
  assert.equal(f.inserts.length, 0);
});

test("retry sends only channels not yet sent — never re-sends a succeeded channel", async () => {
  // Partial-failure recovery: the email already went (prior success), the SMS did
  // not. A retry must send ONLY the SMS and never a duplicate email.
  const fake = makeSupabase({ job: baseJob(), sentChannels: ["email"] });
  const { body, d, fake: f } = await run(fake, { action: "complete_and_request", job_id: "job-1" });
  assert.equal(body.results.email.sent, false);
  assert.equal(body.results.email.reason, "Already sent");
  assert.equal(d.sendEmailFn.calls.length, 0);         // no duplicate email
  assert.equal(body.results.sms.sent, true);           // the unsent channel is retried
  assert.equal(d.sendSmsFn.calls.length, 1);
  const smsRow = f.inserts.find((r) => r.channel === "sms");
  assert.equal(smsRow.status, "sent");
});

test("dormant: no review link => job still completes, nothing is sent", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { body, d, fake: f } = await run(fake, { action: "complete_and_request", job_id: "job-1" }, { reviewUrl: null });
  assert.equal(body.status, "completed");
  assert.match(body.results.email.reason, /not configured/);
  assert.match(body.results.sms.reason, /not configured/);
  assert.equal(f.updates.length, 1);           // completion still happened
  assert.equal(d.sendEmailFn.calls.length, 0);
  assert.equal(f.inserts.length, 0);
});

test("fail-closed: an email send error logs 'failed' and does not block SMS", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const throwingEmail = spy(() => { throw new Error("Resend 500"); });
  const { body } = await run(fake, { action: "complete_and_request", job_id: "job-1" }, { sendEmailFn: throwingEmail });
  assert.equal(body.results.email.sent, false);
  assert.equal(body.results.email.reason, "Send failed");
  assert.equal(body.results.sms.sent, true);   // sms still attempted + sent
  const emailRow = fake.inserts.find((r) => r.channel === "email");
  assert.equal(emailRow.status, "failed");
  assert.equal(emailRow.sent_at, null);
});

test("SMS skipped for a landline; email still sends", async () => {
  const fake = makeSupabase({ job: baseJob({ customers: { name: "A", phone: "01242 279590", email: "a@x.com" } }) });
  const { body, d } = await run(fake, { action: "complete_and_request", job_id: "job-1" });
  assert.equal(body.results.email.sent, true);
  assert.equal(body.results.sms.sent, false);
  assert.match(body.results.sms.reason, /UK mobile/);
  assert.equal(d.sendSmsFn.calls.length, 0);
});

test("SMS reports 'not configured' when the gateway is off; email still sends", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { body, d } = await run(fake, { action: "complete_and_request", job_id: "job-1" }, { smsConfigured: false });
  assert.equal(body.results.email.sent, true);
  assert.match(body.results.sms.reason, /not configured/);
  assert.equal(d.sendSmsFn.calls.length, 0);
});

test("an already-completed job is not re-updated but still gets its review sent", async () => {
  const fake = makeSupabase({ job: baseJob({ status: "completed" }) });
  const { body, fake: f } = await run(fake, { action: "complete_and_request", job_id: "job-1" });
  assert.equal(f.updates.length, 0);           // no redundant status write
  assert.equal(body.results.email.sent, true);
});

// --- bookings review_sent annotation (D-025) --------------------------------

test("annotateReviewSent flags only records whose id is in the sent set", () => {
  const recs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const out = annotateReviewSent(recs, new Set(["b"]));
  assert.equal(out[0].review_sent, undefined);
  assert.equal(out[1].review_sent, true);
  assert.equal(out[2].review_sent, undefined);
});

test("annotateReviewSent is a no-op on empty input", () => {
  assert.deepEqual(annotateReviewSent([], new Set(["x"])), []);
  assert.deepEqual(annotateReviewSent(null, new Set()), []);
});

// --- provisional notice_sent annotation (D-027) -----------------------------

test("annotateNoticeSent flags only records whose id has a sent provisional notice", () => {
  const recs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const out = annotateNoticeSent(recs, new Set(["c"]));
  assert.equal(out[0].notice_sent, undefined);
  assert.equal(out[1].notice_sent, undefined);
  assert.equal(out[2].notice_sent, true);
});

test("annotateNoticeSent is a no-op on empty input", () => {
  assert.deepEqual(annotateNoticeSent([], new Set(["x"])), []);
  assert.deepEqual(annotateNoticeSent(null, new Set()), []);
});
