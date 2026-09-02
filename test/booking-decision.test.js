// D-027 shared decision core (bookingDecision.js): the compare-and-set (with the
// public-path hash binding), the always-log customer notice, and the token-lifecycle
// helpers. Exercised with small fakes for the two DB shapes it uses (a jobs update
// chain, a messages insert), no network.

const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const {
  mintActionToken,
  actionTokenExpiry,
  decideProvisional,
  notifyCustomerOutcome,
} = require("../server/netlify/functions/bookingDecision.js");

// --- token lifecycle -------------------------------------------------------

test("mintActionToken: 64-hex plaintext, matching sha256 hex hash, unique per call", () => {
  const a = mintActionToken();
  const b = mintActionToken();
  assert.match(a.plaintext, /^[0-9a-f]{64}$/);
  assert.equal(a.hash, crypto.createHash("sha256").update(a.plaintext).digest("hex"));
  assert.notEqual(a.plaintext, b.plaintext); // random each time
});

test("actionTokenExpiry: midnight UTC the day AFTER the slot date, incl. rollover", () => {
  assert.equal(actionTokenExpiry("2026-09-10"), "2026-09-11T00:00:00.000Z");
  assert.equal(actionTokenExpiry("2026-12-31"), "2027-01-01T00:00:00.000Z");
});

// --- decideProvisional CAS -------------------------------------------------

// Fake honouring the update chain: .update().eq()...*.is().[.eq()].select() awaited.
// Applies the update only when every eq/is guard matches the current job (the CAS).
function makeJobsFake(job) {
  const state = { job: { ...job } };
  function chain() {
    let fields = null;
    const eqs = {};
    const isNull = {};
    const c = {
      update(f) { fields = f; return c; },
      eq(k, v) { eqs[k] = v; return c; },
      is(k, v) { if (v === null) isNull[k] = true; return c; },
      select() { return c; },
      then(res) {
        const j = state.job;
        let ok = !!j;
        for (const [k, v] of Object.entries(eqs)) if (String(j[k]) !== String(v)) ok = false;
        for (const k of Object.keys(isNull)) if (j[k] != null) ok = false;
        if (ok) { Object.assign(j, fields); res({ data: [{ id: j.id }], error: null }); }
        else res({ data: [], error: null });
      },
    };
    return c;
  }
  return { client: { from: () => chain() }, state };
}

const awaitingJob = {
  id: "j1",
  confirmation_state: "awaiting_operator",
  operator_action_token_used_at: null,
  operator_action_token_hash: "HASH1",
  status: "booked",
};

test("decideProvisional accept transitions an awaiting job and consumes the token", async () => {
  const f = makeJobsFake(awaitingJob);
  assert.equal(await decideProvisional(f.client, "j1", "accept"), 1);
  assert.equal(f.state.job.confirmation_state, "operator_confirmed");
  assert.ok(f.state.job.operator_action_token_used_at);
});

test("decideProvisional decline cancels the job (releases the hold)", async () => {
  const f = makeJobsFake(awaitingJob);
  assert.equal(await decideProvisional(f.client, "j1", "decline"), 1);
  assert.equal(f.state.job.confirmation_state, "operator_declined");
  assert.equal(f.state.job.status, "cancelled");
});

test("decideProvisional with a matching expectedHash transitions", async () => {
  const f = makeJobsFake(awaitingJob);
  assert.equal(await decideProvisional(f.client, "j1", "accept", { expectedHash: "HASH1" }), 1);
});

test("decideProvisional with a STALE expectedHash affects 0 rows (rotation revokes the old link)", async () => {
  const f = makeJobsFake(awaitingJob); // job hash is HASH1
  assert.equal(await decideProvisional(f.client, "j1", "accept", { expectedHash: "HASH0" }), 0);
  assert.equal(f.state.job.confirmation_state, "awaiting_operator"); // untouched
});

test("decideProvisional on an already-resolved job affects 0 rows", async () => {
  const f = makeJobsFake({ ...awaitingJob, confirmation_state: "operator_confirmed", operator_action_token_used_at: "2026-09-02T00:00:00Z" });
  assert.equal(await decideProvisional(f.client, "j1", "accept"), 0);
});

// --- notifyCustomerOutcome (always logs a row) -----------------------------

function makeMessagesFake() {
  const inserts = [];
  return { client: { from: () => ({ insert(row) { inserts.push(row); return Promise.resolve({ error: null }); } }) }, inserts };
}
const notifyJob = { id: "j1", customer_id: "c1", slot_date: "2026-09-10", start_hour: 13, start_minute: 0, slots_needed: 3, customers: { name: "Sarah", email: "s@x.com" } };

test("notifyCustomerOutcome sends and logs 'sent' on success", async () => {
  const f = makeMessagesFake();
  const sent = [];
  const r = await notifyCustomerOutcome(f.client, notifyJob, "accept", { resendKey: "re", sendEmailFn: async (...a) => { sent.push(a); } });
  assert.equal(r.emailed, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "s@x.com");
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].status, "sent");
  assert.equal(f.inserts[0].kind, "provisional_confirmed");
});

test("notifyCustomerOutcome logs 'failed' when no RESEND key (nothing sent, still visible)", async () => {
  const f = makeMessagesFake();
  const r = await notifyCustomerOutcome(f.client, notifyJob, "decline", { resendKey: undefined });
  assert.equal(r.emailed, false);
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].status, "failed");
  assert.equal(f.inserts[0].kind, "provisional_declined");
});

test("notifyCustomerOutcome logs 'failed' when the send throws", async () => {
  const f = makeMessagesFake();
  const r = await notifyCustomerOutcome(f.client, notifyJob, "accept", { resendKey: "re", sendEmailFn: async () => { throw new Error("Resend 500"); } });
  assert.equal(r.emailed, false);
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].status, "failed");
});

test("notifyCustomerOutcome logs 'failed' when there is no email on file", async () => {
  const f = makeMessagesFake();
  const noEmailJob = { ...notifyJob, customers: { name: "Sarah", email: null } };
  const r = await notifyCustomerOutcome(f.client, noEmailJob, "accept", { resendKey: "re", sendEmailFn: async () => {} });
  assert.equal(r.emailed, false);
  assert.equal(r.reason, "no email on file");
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].status, "failed");
});
