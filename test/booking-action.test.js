// D-027 — the provisional-booking accept/decline endpoint (/api/booking-action).
// handlePost is exercised with a fake Supabase client and an injected send function
// (no network), covering token auth (constant-time), the atomic compare-and-set
// transition, idempotency/monotonicity, and claim-then-send notification. Mirrors
// the reviewRequest.js test style.

const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

const {
  handler,
  handlePost,
  tokenMatches,
  messageRow,
  buildAcceptEmail,
  buildDeclineEmail,
} = require("../server/netlify/functions/bookingAction.js");

const headers = { "Content-Type": "application/json" };
const TOKEN = "b".repeat(64); // plaintext action token (handleBooking uses 32-byte hex)
const TOKEN_HASH = crypto.createHash("sha256").update(TOKEN).digest("hex");

function futureISO() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
function pastISO() {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

function baseJob(overrides = {}) {
  return {
    id: "job-1",
    status: "booked",
    confirmation_state: "awaiting_operator",
    operator_decided_at: null,
    operator_action_token_hash: TOKEN_HASH,
    operator_action_token_expires_at: futureISO(),
    operator_action_token_used_at: null,
    customer_id: "cust-1",
    slot_date: "2026-09-10",
    start_hour: 13,
    start_minute: 0,
    slots_needed: 3,
    rooms: "Lounge, stairs, landing",
    address: "1 Test Street, GL3 3PT",
    price_display: "£180",
    customers: { name: "Sarah Jenkins", email: "sarah@example.com" },
    ...overrides,
  };
}

// Fake Supabase honouring exactly the calls bookingAction makes: a jobs read
// (select/eq/limit) and the CAS update (update/eq/eq/is/select), plus a messages
// insert. The CAS MUTATES the shared job when its guards match, so a second call
// sees the new state — that is what makes the idempotency tests real.
function makeSupabase({ job = null } = {}) {
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
    const chain = {
      select() { return chain; },
      update(f) { mode = "update"; fields = f; return chain; },
      eq(c, v) { eqs[c] = v; return chain; },
      is(c, v) { if (v === null) isNull[c] = true; return chain; },
      limit() { return Promise.resolve(readResult()); },
      then(resolve) {
        if (mode === "update") {
          const j = state.job;
          if (guardsMatch(j)) {
            Object.assign(j, fields); // apply the transition atomically
            resolve({ data: [{ id: j.id }], error: null });
          } else {
            resolve({ data: [], error: null }); // 0 rows -> lost the CAS
          }
        } else {
          resolve(readResult());
        }
      },
    };
    return chain;
  }

  // messages: models the D-027 single-winner notice. The claim is a reclaim-UPDATE then an
  // INSERT guarded by the partial unique index; the settle mutates the claimed row IN PLACE,
  // so an assertion on the terminal status/sent_at still reads the one row in `inserts`.
  function messagesChain() {
    let mode = null; let payload = null; const eqs = {}; let ored = false;
    const c = {
      select() { if (!mode) mode = "read"; return c; },
      update(f) { mode = "update"; payload = f; return c; },
      insert(r) { mode = "insert"; payload = r; return c; },
      eq(k, v) { eqs[k] = v; return c; },
      in() { return c; },
      or() { ored = true; return c; },
      limit() { return Promise.resolve({ data: [], error: null }); },
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
  return { supabase: fake.client, resendKey: "re_test", sendEmailFn: spy({ id: "email-1" }), ...over };
}

async function run(fake, bodyObj, over = {}) {
  const d = deps(fake, over);
  const res = await handlePost(post(bodyObj), headers, d);
  return { res, body: JSON.parse(res.body), d, fake };
}

// --- guards ----------------------------------------------------------------

test("503 when Supabase is not configured", async () => {
  const res = await handlePost(post({ job: "x", token: TOKEN, action: "view" }), headers, { supabase: null });
  assert.equal(res.statusCode, 503);
});

test("400 on invalid JSON", async () => {
  const res = await handlePost({ httpMethod: "POST", headers: {}, body: "{not json" }, headers, deps(makeSupabase({ job: baseJob() })));
  assert.equal(res.statusCode, 400);
});

test("400 on missing job, missing token, or unknown action", async () => {
  const a = await run(makeSupabase({ job: baseJob() }), { token: TOKEN, action: "view" });
  assert.equal(a.res.statusCode, 400);
  const b = await run(makeSupabase({ job: baseJob() }), { job: "job-1", action: "view" });
  assert.equal(b.res.statusCode, 400);
  const c = await run(makeSupabase({ job: baseJob() }), { job: "job-1", token: TOKEN, action: "nope" });
  assert.equal(c.res.statusCode, 400);
});

// --- token auth (constant-time) --------------------------------------------

test("404 when the job id matches no job (id reveals nothing)", async () => {
  const { res, body } = await run(makeSupabase({ job: null }), { job: "ghost", token: TOKEN, action: "view" });
  assert.equal(res.statusCode, 404);
  assert.equal(body.booking, undefined); // no PII
});

test("404 for a wrong token — no state change, no PII leaked", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body } = await run(fake, { job: "job-1", token: "a".repeat(64), action: "accept" });
  assert.equal(res.statusCode, 404);
  assert.equal(body.booking, undefined);
  assert.equal(fake.state.job.confirmation_state, "awaiting_operator"); // untouched
});

test("tokenMatches: right token matches; wrong/short/non-hex/empty do not; no throw", () => {
  assert.equal(tokenMatches(TOKEN, TOKEN_HASH), true);
  assert.equal(tokenMatches("a".repeat(64), TOKEN_HASH), false);
  assert.equal(tokenMatches("short", TOKEN_HASH), false);
  assert.equal(tokenMatches(TOKEN, "zz"), false);
  assert.equal(tokenMatches("", TOKEN_HASH), false);
  assert.equal(tokenMatches(TOKEN, null), false);
  assert.equal(tokenMatches(undefined, TOKEN_HASH), false);
});

// --- view (read-only) ------------------------------------------------------

test("view returns the booking summary only after the token verifies", async () => {
  const { res, body } = await run(makeSupabase({ job: baseJob() }), { job: "job-1", token: TOKEN, action: "view" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "awaiting_operator");
  assert.equal(body.expired, false);
  assert.equal(body.booking.name, "Sarah Jenkins");
  assert.equal(body.booking.time, "1pm"); // 13:00 in the business voice
  assert.equal(body.booking.date, "2026-09-10");
});

test("view of an already-actioned job reports its resolved state (does not require awaiting_operator)", async () => {
  const job = baseJob({ confirmation_state: "operator_confirmed", operator_decided_at: "2026-09-02T10:00:00Z" });
  const { res, body } = await run(makeSupabase({ job }), { job: "job-1", token: TOKEN, action: "view" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "operator_confirmed");
  assert.equal(body.decidedAt, "2026-09-02T10:00:00Z");
});

// --- accept ----------------------------------------------------------------

test("accept: transitions to operator_confirmed, emails the customer, logs one 'sent' row", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body, d } = await run(fake, { job: "job-1", token: TOKEN, action: "accept" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "operator_confirmed");
  assert.equal(body.emailed, true);
  assert.equal(fake.state.job.confirmation_state, "operator_confirmed");
  assert.equal(fake.state.job.status, "booked"); // accept keeps the slot held
  assert.ok(fake.state.job.operator_action_token_used_at); // token consumed
  assert.equal(d.sendEmailFn.calls[0][0], "sarah@example.com");
  assert.equal(fake.inserts.length, 1);
  assert.equal(fake.inserts[0].kind, "provisional_confirmed");
  assert.equal(fake.inserts[0].status, "sent");
  assert.equal(fake.inserts[0].customer_id, "cust-1");
  assert.ok(fake.inserts[0].sent_at);
});

// --- decline ---------------------------------------------------------------

test("decline: cancels the job (releases the hold), emails the customer, logs 'sent' declined", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body } = await run(fake, { job: "job-1", token: TOKEN, action: "decline" });
  assert.equal(res.statusCode, 200);
  assert.equal(body.state, "operator_declined");
  assert.equal(fake.state.job.confirmation_state, "operator_declined");
  assert.equal(fake.state.job.status, "cancelled"); // hold released
  assert.equal(fake.inserts[0].kind, "provisional_declined");
  assert.equal(fake.inserts[0].status, "sent");
});

// --- idempotency / monotonicity (the CAS) ----------------------------------

test("double accept: the second click is 409 and sends nothing more", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const first = await run(fake, { job: "job-1", token: TOKEN, action: "accept" });
  assert.equal(first.res.statusCode, 200);
  const second = await run(fake, { job: "job-1", token: TOKEN, action: "accept" });
  assert.equal(second.res.statusCode, 409);
  assert.equal(second.d.sendEmailFn.calls.length, 0); // no second email
  assert.equal(fake.inserts.length, 1); // still just the one 'sent' row
});

test("accept then decline: the decline is 409, the job stays confirmed, no cancel/decline email", async () => {
  const fake = makeSupabase({ job: baseJob() });
  await run(fake, { job: "job-1", token: TOKEN, action: "accept" });
  const decline = await run(fake, { job: "job-1", token: TOKEN, action: "decline" });
  assert.equal(decline.res.statusCode, 409);
  assert.equal(fake.state.job.confirmation_state, "operator_confirmed"); // monotonic
  assert.equal(fake.state.job.status, "booked"); // not cancelled
  assert.equal(decline.d.sendEmailFn.calls.length, 0);
});

test("an already-resolved job returns 409 with its state before any CAS", async () => {
  const fake = makeSupabase({ job: baseJob({ confirmation_state: "operator_declined", status: "cancelled" }) });
  const { res, body, d } = await run(fake, { job: "job-1", token: TOKEN, action: "accept" });
  assert.equal(res.statusCode, 409);
  assert.equal(body.state, "operator_declined");
  assert.equal(d.sendEmailFn.calls.length, 0);
});

// --- expiry ----------------------------------------------------------------

test("an expired token cannot accept/decline (410) and does not transition", async () => {
  const fake = makeSupabase({ job: baseJob({ operator_action_token_expires_at: pastISO() }) });
  const { res } = await run(fake, { job: "job-1", token: TOKEN, action: "accept" });
  assert.equal(res.statusCode, 410);
  assert.equal(fake.state.job.confirmation_state, "awaiting_operator"); // untouched
});

// --- claim-then-send failure modes -----------------------------------------

test("no resendKey: the decision still applies, and a 'failed' notice row is logged (visible + retryable)", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { res, body, d } = await run(fake, { job: "job-1", token: TOKEN, action: "decline" }, { resendKey: undefined });
  assert.equal(res.statusCode, 200);
  assert.equal(body.emailed, false);
  assert.equal(fake.state.job.status, "cancelled"); // transition still happened
  assert.equal(d.sendEmailFn.calls.length, 0);       // nothing sent
  assert.equal(fake.inserts.length, 1);              // but the outcome is durably recorded
  assert.equal(fake.inserts[0].status, "failed");
  assert.equal(fake.inserts[0].kind, "provisional_declined");
});

test("send failure is claimed-then-logged 'failed': the decision stands, no second message", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const throwingEmail = spy(() => { throw new Error("Resend 500"); });
  const { res, body } = await run(fake, { job: "job-1", token: TOKEN, action: "decline" }, { sendEmailFn: throwingEmail });
  assert.equal(res.statusCode, 200); // the decision succeeded even though the email did not
  assert.equal(body.emailed, false);
  assert.equal(fake.state.job.confirmation_state, "operator_declined");
  assert.equal(fake.state.job.status, "cancelled");
  assert.equal(fake.inserts.length, 1);
  assert.equal(fake.inserts[0].status, "failed");
  assert.equal(fake.inserts[0].sent_at, null);
});

// --- messageRow shape + email copy -----------------------------------------

test("messageRow: a 'sent' row always carries a body (messages_sent_has_body)", () => {
  const row = messageRow(baseJob(), "provisional_confirmed", "sent", { subject: "s", text: "the body" });
  assert.equal(row.body, "the body");
  assert.equal(row.channel, "email");
  assert.equal(row.requires_consent, false);
  assert.ok(row.sent_at);
});

test("decline email never promises the same slot; accept email confirms it", () => {
  const summary = { name: "Sarah Jenkins", email: "s@x.com", date: "2026-09-10", time: "1pm", hours: 3 };
  const accept = buildAcceptEmail(summary, "https://x/privacy");
  assert.match(accept.subject, /confirmed/i);
  assert.match(accept.text, /confirmed/i);
  const decline = buildDeclineEmail(summary, "https://x/privacy");
  assert.match(decline.text, /no longer being held/i);
  assert.doesNotMatch(decline.text, /secured|is confirmed/i);
});

// --- deposit pay-link hook (D-004/D-026, dormant until Stripe is live) -------

test("accept email carries a deposit pay link only when a URL is supplied", () => {
  const summary = { name: "Sarah Jenkins", email: "s@x.com", date: "2026-09-10", time: "1pm", hours: 3 };
  const without = buildAcceptEmail(summary, "https://x/privacy");
  assert.doesNotMatch(without.html, /Pay your deposit/);
  assert.match(without.text, /Mark will be in touch/);
  const withLink = buildAcceptEmail(summary, "https://x/privacy", "https://pay.example/deposit/1");
  assert.match(withLink.html, /Pay your deposit securely/);
  assert.match(withLink.html, /href="https:\/\/pay\.example\/deposit\/1"/);
  assert.match(withLink.text, /https:\/\/pay\.example\/deposit\/1/);
  assert.doesNotMatch(withLink.text, /Mark will be in touch/);
});

test("handlePost threads the deposit pay URL into the sent accept email", async () => {
  const fake = makeSupabase({ job: baseJob() });
  const { d } = await run(fake, { job: "job-1", token: TOKEN, action: "accept" }, { depositPayUrl: "https://pay.example/deposit/1" });
  const content = d.sendEmailFn.calls[0][1];
  assert.match(content.html, /Pay your deposit securely/);
  assert.match(content.html, /href="https:\/\/pay\.example\/deposit\/1"/);
});

// --- handler method discipline ---------------------------------------------

test("handler: GET is 405, OPTIONS is 200 (POST-only mutation surface)", async () => {
  const get = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(get.statusCode, 405);
  const opt = await handler({ httpMethod: "OPTIONS", headers: {} });
  assert.equal(opt.statusCode, 200);
});
