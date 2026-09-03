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

// messages fake for the D-027 single-winner claim: a reclaim-UPDATE then an INSERT guarded
// by the partial unique index, then a settle that mutates the claimed row IN PLACE. `seed`
// pre-loads rows so the lost-claim / reclaim branches can be exercised. `inserts` is the
// live store, so an assertion on the terminal status still reads one row.
function makeMessagesFake({ seed = [] } = {}) {
  const inserts = seed.map((r) => ({ sent_at: null, ...r }));
  function chain() {
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
        if (mode === "update" && ored) {
          const row = inserts.find((r) => r.job_id === eqs.job_id && r.kind === eqs.kind &&
            (r.status === "draft" || r.status === "failed"));
          if (row) { Object.assign(row, payload); return res({ data: [{ id: row.id }], error: null }); }
          return res({ data: [], error: null });
        }
        if (mode === "update") {
          const row = inserts.find((r) => r.id === eqs.id);
          if (row) Object.assign(row, payload);
          return res({ data: null, error: null });
        }
        return res({ data: [], error: null });
      },
    };
    return c;
  }
  return { client: { from: () => chain() }, inserts };
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

// --- strict single winner (claim branches) ---------------------------------

test("notifyCustomerOutcome backs off when the notice is already sent (lost claim, nothing sent)", async () => {
  // a 'sent' row already exists: the claim cannot reclaim it (not draft/failed) and the
  // insert conflicts on the partial unique index (23505), so this sender does nothing.
  const f = makeMessagesFake({ seed: [{ id: "m1", job_id: "j1", kind: "provisional_confirmed", status: "sent" }] });
  const sent = [];
  const r = await notifyCustomerOutcome(f.client, notifyJob, "accept", { resendKey: "re", sendEmailFn: async (...a) => { sent.push(a); } });
  assert.equal(r.emailed, false);
  assert.equal(r.status, "skipped");
  assert.equal(sent.length, 0);       // no duplicate email
  assert.equal(f.inserts.length, 1);  // no new row; the existing 'sent' row is untouched
  assert.equal(f.inserts[0].status, "sent");
});

test("notifyCustomerOutcome reclaims a 'failed' row on retry and settles it 'sent' (no duplicate)", async () => {
  const f = makeMessagesFake({ seed: [{ id: "m1", job_id: "j1", kind: "provisional_confirmed", status: "failed" }] });
  const sent = [];
  const r = await notifyCustomerOutcome(f.client, notifyJob, "accept", { resendKey: "re", sendEmailFn: async (...a) => { sent.push(a); } });
  assert.equal(r.emailed, true);
  assert.equal(sent.length, 1);
  assert.equal(f.inserts.length, 1);   // same row reclaimed, not duplicated
  assert.equal(f.inserts[0].id, "m1");
  assert.equal(f.inserts[0].status, "sent");
  assert.ok(f.inserts[0].sent_at);
});

// --- Guarded integration: the claim against real Postgres (D-010, no mocks) ----
// Runs only when ICC_SUPABASE_IT=1 with local Supabase env. Proves what the fakes cannot:
// the partial unique index makes concurrent claims a strict single winner, a retry after a
// 'failed' notice reclaims the row, and a stale 'sending' claim (a dead sender) is reclaimed
// so a notice can never be permanently stranded. Cleans only its own rows (safe-smokes).
const { getSupabaseAdmin } = require("../server/netlify/functions/supabaseClient.js");

const IT_CUST = "00000000-0000-0000-0000-0000000009d1";
const IT_JOB = "00000000-0000-0000-0000-0000000009d2";
// start_hour 14 + 2 slots finishes at 16:00 (a genuine after-3pm provisional case) and
// satisfies the jobs_start_hour_check BETWEEN 9 AND 15 backstop.
const itJob = { id: IT_JOB, customer_id: IT_CUST, slot_date: "2026-12-20", start_hour: 14, start_minute: 0, slots_needed: 2, customers: { name: "IT Notify", email: "itnotify@example.com" } };

async function seedItJob(sb) {
  const c = await sb.from("customers").upsert({ id: IT_CUST, name: "IT Notify", phone: "01242 000000", email: "itnotify@example.com" });
  if (c.error) throw new Error("seed customer failed: " + c.error.message);
  const j = await sb.from("jobs").upsert({ id: IT_JOB, customer_id: IT_CUST, status: "booked", confirmation_state: "awaiting_operator", address: "1 IT St", postcode: "GL52 1AB", slot_date: "2026-12-20", start_hour: 14, start_minute: 0, slots_needed: 2 });
  if (j.error) throw new Error("seed job failed: " + j.error.message);
}
async function cleanupItJob(sb) {
  await sb.from("messages").delete().eq("job_id", IT_JOB);
  await sb.from("jobs").delete().eq("id", IT_JOB);
  await sb.from("customers").delete().eq("id", IT_CUST);
}
async function itNoticeRows(sb) {
  const { data } = await sb.from("messages").select("id,status,kind").eq("job_id", IT_JOB);
  return data || [];
}
const IT_SKIP = process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run";

test("[integration] concurrent notices are a strict single winner (partial unique index)", { skip: IT_SKIP }, async () => {
  const sb = getSupabaseAdmin();
  assert.ok(sb, "expected a Supabase client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  await cleanupItJob(sb);
  await seedItJob(sb);
  try {
    let sends = 0;
    const send = async () => { await new Promise((r) => setTimeout(r, 5)); sends++; };
    const outcomes = await Promise.all([
      notifyCustomerOutcome(sb, itJob, "accept", { resendKey: "re", sendEmailFn: send }),
      notifyCustomerOutcome(sb, itJob, "accept", { resendKey: "re", sendEmailFn: send }),
    ]);
    assert.equal(outcomes.filter((r) => r.emailed).length, 1, "exactly one sender wins the claim");
    assert.equal(sends, 1, "the email is sent exactly once");
    const rows = await itNoticeRows(sb);
    assert.equal(rows.length, 1, "exactly one provisional notice row exists");
    assert.equal(rows[0].status, "sent");
  } finally {
    await cleanupItJob(sb);
  }
});

test("[integration] a retry after a 'failed' notice reclaims the row and re-sends", { skip: IT_SKIP }, async () => {
  const sb = getSupabaseAdmin();
  await cleanupItJob(sb);
  await seedItJob(sb);
  try {
    const first = await notifyCustomerOutcome(sb, itJob, "decline", { resendKey: "re", sendEmailFn: async () => { throw new Error("Resend 500"); } });
    assert.equal(first.emailed, false);
    let rows = await itNoticeRows(sb);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "failed");
    let sends = 0;
    const second = await notifyCustomerOutcome(sb, itJob, "decline", { resendKey: "re", sendEmailFn: async () => { sends++; } });
    assert.equal(second.emailed, true);
    assert.equal(sends, 1);
    rows = await itNoticeRows(sb);
    assert.equal(rows.length, 1, "the failed row was reclaimed, not duplicated");
    assert.equal(rows[0].status, "sent");
  } finally {
    await cleanupItJob(sb);
  }
});

test("[integration] a stale 'sending' claim is reclaimed (a dead sender cannot strand a notice)", { skip: IT_SKIP }, async () => {
  const sb = getSupabaseAdmin();
  await cleanupItJob(sb);
  await seedItJob(sb);
  try {
    const staleAt = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
    await sb.from("messages").insert({ customer_id: IT_CUST, job_id: IT_JOB, kind: "provisional_confirmed", channel: "email", status: "sending", body: "(stale claim)", updated_at: staleAt });
    let sends = 0;
    const r = await notifyCustomerOutcome(sb, itJob, "accept", { resendKey: "re", sendEmailFn: async () => { sends++; } });
    assert.equal(r.emailed, true, "the stale claim is reclaimed and the notice re-sends");
    assert.equal(sends, 1);
    const rows = await itNoticeRows(sb);
    assert.equal(rows.length, 1, "reclaimed in place, not duplicated");
    assert.equal(rows[0].status, "sent");
  } finally {
    await cleanupItJob(sb);
  }
});
