// D-027 Phase 5 — the admin fallback endpoint (/api/booking-admin). handlePost is
// exercised with a fake Supabase client and injected send functions (no network),
// covering the requireAdmin-authorised accept/decline/resend/retry_customer_notice,
// the no-token / no-expiry admin authority (Gemini finding 3), token rotation, and the
// read-then-send retry idempotency. Mirrors the reviewRequest.js / bookingAction.js
// test style.

const { test } = require("node:test");
const assert = require("node:assert");
const { handler, handlePost, buildResendOperatorEmail } = require("../server/netlify/functions/bookingAdmin.js");

const headers = { "Content-Type": "application/json" };

function baseJob(over = {}) {
  return {
    id: "job-1",
    status: "booked",
    confirmation_state: "awaiting_operator",
    operator_decided_at: null,
    operator_action_token_hash: "OLDHASH",
    operator_action_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    operator_action_token_used_at: null,
    customer_id: "cust-1",
    slot_date: "2026-09-10",
    start_hour: 13,
    start_minute: 0,
    slots_needed: 3,
    rooms: "Lounge, stairs",
    address: "1 Test Street, GL3 3PT",
    price_display: "£180",
    customers: { name: "Sarah Jenkins", email: "sarah@example.com" },
    ...over,
  };
}

// Fake Supabase: a jobs update/read chain honouring the CAS guards (so decideProvisional
// and rotateActionToken behave), and a messages chain for hasSentProvisionalNotice (read)
// + logMessage (insert). The CAS MUTATES the shared job when guards match.
function makeSupabase({ job = null, sentNotice = false } = {}) {
  const inserts = [];
  const state = { job: job ? { ...job } : null };
  function jobsChain() {
    let mode = "read";
    let fields = null;
    const eqs = {};
    const isNull = {};
    function guardsMatch(j) {
      if (!j) return false;
      for (const [k, v] of Object.entries(eqs)) if (String(j[k]) !== String(v)) return false;
      for (const k of Object.keys(isNull)) if (j[k] != null) return false;
      return true;
    }
    const readResult = () => {
      const j = state.job;
      const match = j && (eqs.id == null || String(j.id) === String(eqs.id));
      return { data: match ? [j] : [], error: null };
    };
    const c = {
      select() { return c; },
      update(f) { mode = "update"; fields = f; return c; },
      eq(k, v) { eqs[k] = v; return c; },
      is(k, v) { if (v === null) isNull[k] = true; return c; },
      limit() { return Promise.resolve(readResult()); },
      then(res) {
        if (mode === "update") {
          const j = state.job;
          if (guardsMatch(j)) { Object.assign(j, fields); res({ data: [{ id: j.id }], error: null }); }
          else res({ data: [], error: null });
        } else res(readResult());
      },
    };
    return c;
  }
  // messages: models the D-027 single-winner notice (claim = reclaim-UPDATE then INSERT
  // under the partial unique index; settle mutates the claimed row IN PLACE) AND the
  // hasSentProvisionalNotice read (limit, driven by sentNotice).
  function messagesChain() {
    let mode = null; let payload = null; const eqs = {}; let ored = false;
    const c = {
      select() { if (!mode) mode = "read"; return c; },
      update(f) { mode = "update"; payload = f; return c; },
      insert(r) { mode = "insert"; payload = r; return c; },
      eq(k, v) { eqs[k] = v; return c; },
      in() { return c; },
      or() { ored = true; return c; },
      limit() { return Promise.resolve({ data: sentNotice ? [{ id: "m1" }] : [], error: null }); },
      then(res) {
        if (mode === "insert") {
          if (["provisional_confirmed", "provisional_declined"].includes(payload.kind) &&
              inserts.some((r) => r.job_id === payload.job_id && r.kind === payload.kind)) {
            return res({ data: null, error: { code: "23505", message: "duplicate key value" } });
          }
          const row = { id: `m${inserts.length + 1}`, sent_at: null, ...payload };
          inserts.push(row);
          return res({ data: [{ id: row.id }], error: null });
        }
        if (mode === "update" && ored) { // reclaim a terminal draft/failed row
          const row = inserts.find((r) => r.job_id === eqs.job_id && r.kind === eqs.kind &&
            (r.status === "draft" || r.status === "failed"));
          if (row) { Object.assign(row, payload); return res({ data: [{ id: row.id }], error: null }); }
          return res({ data: [], error: null });
        }
        if (mode === "update") { // settle by id
          const row = inserts.find((r) => r.id === eqs.id);
          if (row) Object.assign(row, payload);
          return res({ data: null, error: null });
        }
        return res({ data: [], error: null });
      },
    };
    return c;
  }
  return { client: { from: (t) => (t === "messages" ? messagesChain() : jobsChain()) }, inserts, state };
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
    adminEmail: "mark@intelligentclean.co.uk",
    sendEmailFn: spy({ id: "cust-1" }),
    sendOperatorFn: spy({ id: "op-1" }),
    enforceRateLimitFn: async () => ({ ok: true }),
    ...over,
  };
}
async function run(fake, bodyObj, over = {}) {
  const d = deps(fake, over);
  const res = await handlePost(post(bodyObj), headers, d);
  return { res, body: JSON.parse(res.body), d, fake };
}

// --- guards ----------------------------------------------------------------

test("503 when Supabase is not configured", async () => {
  const res = await handlePost(post({ job_id: "x", action: "accept" }), headers, { supabase: null });
  assert.equal(res.statusCode, 503);
});

test("400 on missing job_id or unknown action", async () => {
  const a = await run(makeSupabase({ job: baseJob() }), { action: "accept" });
  assert.equal(a.res.statusCode, 400);
  const b = await run(makeSupabase({ job: baseJob() }), { job_id: "job-1", action: "nope" });
  assert.equal(b.res.statusCode, 400);
});

test("404 when the job id matches no job", async () => {
  const { res } = await run(makeSupabase({ job: null }), { job_id: "ghost", action: "accept" });
  assert.equal(res.statusCode, 404);
});

// --- accept / decline (admin authority: no token, no expiry) ----------------

test("accept transitions to operator_confirmed and notifies the customer", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body, d } = await run(fake, { job_id: "job-1", action: "accept" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "operator_confirmed");
  assert.equal(body.emailed, true);
  assert.equal(fake.state.job.confirmation_state, "operator_confirmed");
  assert.equal(d.sendEmailFn.calls[0][0], "sarah@example.com");
  assert.equal(fake.inserts[0].kind, "provisional_confirmed");
  assert.equal(fake.inserts[0].status, "sent");
});

test("decline cancels the job (releases the hold) and notifies", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body } = await run(fake, { job_id: "job-1", action: "decline" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "operator_declined");
  assert.equal(fake.state.job.status, "cancelled");
  assert.equal(fake.inserts[0].kind, "provisional_declined");
});

test("accept/decline on a job that is not awaiting returns 409", async () => {
  const fake = makeSupabase({ job: baseJob({ confirmation_state: "operator_confirmed" }) });
  const { res } = await run(fake, { job_id: "job-1", action: "decline" });
  assert.equal(res.statusCode, 409);
});

test("ADMIN can decide a stale awaiting booking whose token has EXPIRED and date has passed (Gemini 3)", async () => {
  // The public endpoint would 410 here; the admin path has no expiry gate.
  const fake = makeSupabase({ job: baseJob({ operator_action_token_expires_at: new Date(Date.now() - 86400000).toISOString(), slot_date: "2020-01-01" }) });
  const { res, body } = await run(fake, { job_id: "job-1", action: "decline" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "operator_declined");
  assert.equal(fake.state.job.status, "cancelled");
});

// --- resend (rotate the token + re-email Mark) ------------------------------

test("resend rotates the token and emails Mark a fresh link", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body, d } = await run(fake, { job_id: "job-1", action: "resend" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.resent, true);
  assert.notEqual(fake.state.job.operator_action_token_hash, "OLDHASH"); // rotated
  assert.equal(d.sendOperatorFn.calls.length, 1);
  const content = d.sendOperatorFn.calls[0][0];
  assert.match(content.html, /Review &amp; respond|Review & respond/);
  assert.match(content.html, /booking-action#job=job-1&amp;token=/); // fresh link (& escaped)
});

test("resend with no RESEND key does NOT rotate (would kill the link with no replacement)", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, d } = await run(fake, { job_id: "job-1", action: "resend" }, { resendKey: undefined });
  assert.equal(res.statusCode, 503);
  assert.equal(fake.state.job.operator_action_token_hash, "OLDHASH"); // unchanged
  assert.equal(d.sendOperatorFn.calls.length, 0);
});

test("resend refuses when the booking's day has passed (fresh token would be born expired)", async () => {
  const fake = makeSupabase({ job: baseJob({ slot_date: "2020-01-01" }) });
  const { res } = await run(fake, { job_id: "job-1", action: "resend" });
  assert.equal(res.statusCode, 409);
  assert.equal(fake.state.job.operator_action_token_hash, "OLDHASH"); // not rotated
});

test("resend on a job that is not awaiting returns 409", async () => {
  const fake = makeSupabase({ job: baseJob({ confirmation_state: "operator_declined" }) });
  const { res } = await run(fake, { job_id: "job-1", action: "resend" });
  assert.equal(res.statusCode, 409);
});

// --- retry_customer_notice (resolved booking, read-then-send) ---------------

test("retry_customer_notice sends the confirm email for a confirmed booking with no sent notice", async () => {
  const fake = makeSupabase({ job: baseJob({ confirmation_state: "operator_confirmed" }), sentNotice: false });
  const { res, body, d } = await run(fake, { job_id: "job-1", action: "retry_customer_notice" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.emailed, true);
  assert.equal(d.sendEmailFn.calls.length, 1);
  assert.equal(fake.inserts[0].kind, "provisional_confirmed"); // derived from final state
});

test("retry_customer_notice is idempotent: skips when a notice was already sent", async () => {
  const fake = makeSupabase({ job: baseJob({ confirmation_state: "operator_declined" }), sentNotice: true });
  const { res, body, d } = await run(fake, { job_id: "job-1", action: "retry_customer_notice" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.emailed, false);
  assert.match(body.reason, /already notified/);
  assert.equal(d.sendEmailFn.calls.length, 0);
});

test("retry_customer_notice on an unresolved (awaiting) booking returns 409", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res } = await run(fake, { job_id: "job-1", action: "retry_customer_notice" });
  assert.equal(res.statusCode, 409);
});

// --- rate cap on the email-sending actions ----------------------------------

test("resend is capped per (admin, job) when the limiter says no", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res } = await run(fake, { job_id: "job-1", action: "resend" }, { enforceRateLimitFn: async () => ({ ok: false, retryAfter: 3600 }) });
  assert.equal(res.statusCode, 429);
  assert.equal(fake.state.job.operator_action_token_hash, "OLDHASH"); // not rotated
});

// --- operator email builder + handler discipline ----------------------------

test("buildResendOperatorEmail carries the action link, escaped", () => {
  const c = buildResendOperatorEmail({ name: "Sarah", date: "2026-09-10", time: "1pm", hours: 3 }, "https://x/booking-action#job=1&token=abc");
  assert.match(c.subject, /link resent/i);
  assert.match(c.html, /href="https:\/\/x\/booking-action#job=1&amp;token=abc"/);
});

test("handler: OPTIONS is 200 (preflight before auth)", async () => {
  const res = await handler({ httpMethod: "OPTIONS", headers: {} });
  assert.equal(res.statusCode, 200);
});
