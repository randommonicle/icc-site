// scripts/erase-job.js: the jobs half of the Art.17 erasure procedure (D-047, the photo
// bytes that a SQL delete would orphan). The unit cases drive a recording fake and pin the
// order and the refusals: nothing is deleted for an invoiced job or an unknown job; the
// photo objects go before the job row; the customer goes only with --with-customer and
// only when no other job references it. The [integration] case (ICC_SUPABASE_IT=1, the
// local stack after db reset) erases a real booking with a real stored photo and proves
// the object, the rows and the customer are gone.

const { test } = require("node:test");
const assert = require("node:assert");

const { reportJob, eraseJob, formatReport } = require("../scripts/erase-job.js");

const JOB = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const CUST = "0a1b2c3d-1111-4222-8333-444455556666";

// A recording fake: from(table) chains with count/maybeSingle/delete; storage.remove.
function fakeSupabase(plan = {}) {
  const log = [];
  const counts = Object.assign({ job_photos: 1, invoices: 0, messages: 2, job_assessments: 1, expenses: 0, jobs: 1 }, plan.counts || {});
  const job = plan.job === null ? null : Object.assign({ id: JOB, created_at: "2026-09-01T10:00:00Z", status: "completed", slot_date: "2026-09-10", customer_id: CUST, customers: { id: CUST, name: "Jane", email: "jane@example.com" } }, plan.job || {});
  function builder(table) {
    const b = { _table: table, _ops: [] };
    for (const m of ["select", "eq", "delete", "in"]) b[m] = (...a) => { b._ops.push([m, ...a]); log.push([table + "." + m, ...a]); return b; };
    b.maybeSingle = () => { b._ops.push(["maybeSingle"]); return b; };
    b.then = (res, rej) => {
      const ops = b._ops.map((o) => o[0]);
      let out;
      if (ops.includes("delete")) out = (plan.deleteErrors || {})[table] ? { error: { message: (plan.deleteErrors || {})[table] } } : { error: null };
      else if (ops.includes("maybeSingle")) out = { data: job, error: null };
      else if (table === "job_photos" && !b._ops.some((o) => o[0] === "select" && o[2] && o[2].head)) out = { data: plan.photoRows || [{ id: "p1", storage_path: `jobs/${JOB}/photo-1.png` }], error: null };
      else out = { count: counts[table], error: null };
      return Promise.resolve(out).then(res, rej);
    };
    return b;
  }
  return {
    log,
    from: (t) => builder(t),
    storage: { from(bucket) { return { remove: async (paths) => { log.push(["remove", bucket, paths]); return plan.removeError ? { error: { message: plan.removeError } } : { data: paths, error: null }; } }; } },
  };
}
const deletes = (sb) => sb.log.filter((l) => /\.delete$/.test(l[0])).map((l) => l[0]);

test("reportJob: the job, the customer with their other-job count, and every count the erasure touches", async () => {
  const sb = fakeSupabase({ counts: { jobs: 3, invoices: 0 } });
  const r = await reportJob(sb, JOB);
  assert.deepStrictEqual(r.job, { id: JOB, created_at: "2026-09-01T10:00:00Z", status: "completed", slot_date: "2026-09-10" });
  assert.deepStrictEqual(r.customer, { id: CUST, name: "Jane", email: "jane@example.com" });
  assert.strictEqual(r.otherJobs, 2, "the customer's other jobs exclude this one");
  assert.strictEqual(r.photos, 1);
  assert.strictEqual(r.messages, 2);
  assert.deepStrictEqual(deletes(sb), [], "a report never deletes");
  assert.strictEqual(await reportJob(fakeSupabase({ job: null }), JOB), null);
  await assert.rejects(reportJob(sb, "nope"), /uuid/);
  assert.ok(formatReport(r).includes("photos 1 | invoices 0"));
  assert.strictEqual(formatReport(null), "no such job");
});

test("eraseJob refuses an invoiced job and an unknown job with nothing deleted", async () => {
  const invoiced = fakeSupabase({ counts: { invoices: 2 } });
  const r = await eraseJob(invoiced, JOB, { log: () => {} });
  assert.strictEqual(r.ok, false);
  assert.match(r.refused, /2 invoice/);
  assert.deepStrictEqual(deletes(invoiced), []);
  assert.ok(!invoiced.log.some((l) => l[0] === "remove"), "no Storage call");
  assert.ok(formatReport(r.report).includes("REFUSED"));
  const missing = fakeSupabase({ job: null });
  assert.deepStrictEqual(await eraseJob(missing, JOB), { ok: false, refused: "no such job", report: null, deleted: {} });
});

test("eraseJob: photo objects, then photo rows, then the job; the customer only with the flag and only when unreferenced", async () => {
  const sb = fakeSupabase({ counts: { jobs: 1 } });
  const r = await eraseJob(sb, JOB, { withCustomer: true, log: () => {} });
  assert.strictEqual(r.ok, true, r.refused);
  assert.deepStrictEqual(r.deleted, { photos: 1, job: true, customer: true });
  const order = sb.log.map((l) => l[0]).filter((o) => o === "remove" || /\.delete$/.test(o));
  assert.deepStrictEqual(order, ["remove", "job_photos.delete", "jobs.delete", "customers.delete"]);
  assert.deepStrictEqual(sb.log.find((l) => l[0] === "remove").slice(1), ["job-photos", [`jobs/${JOB}/photo-1.png`]]);

  const kept = fakeSupabase({ counts: { jobs: 2 } });
  const logs = [];
  const r2 = await eraseJob(kept, JOB, { withCustomer: true, log: (...a) => logs.push(a.join(" ")) });
  assert.deepStrictEqual(r2.deleted, { photos: 1, job: true, customer: false });
  assert.ok(!deletes(kept).includes("customers.delete"), "a referenced customer is kept");
  assert.ok(logs.some((l) => /customer .* kept: 1 other job/.test(l)));

  const noFlag = fakeSupabase({ counts: { jobs: 1 } });
  const r3 = await eraseJob(noFlag, JOB, { log: () => {} });
  assert.deepStrictEqual(r3.deleted, { photos: 1, job: true, customer: false });
  assert.ok(!deletes(noFlag).includes("customers.delete"), "without the flag the customer stays");
});

test("eraseJob stops at the first failure and says what was already erased", async () => {
  const rmFail = fakeSupabase({ removeError: "storage down" });
  const r = await eraseJob(rmFail, JOB, { log: () => {} });
  assert.strictEqual(r.ok, false);
  assert.match(r.refused, /photo erasure failed, nothing else deleted: storage down/);
  assert.deepStrictEqual(deletes(rmFail), [], "the job row is untouched when the objects could not be removed");
  const jobFail = fakeSupabase({ deleteErrors: { jobs: "restrict" } });
  const r2 = await eraseJob(jobFail, JOB, { log: () => {} });
  assert.match(r2.refused, /jobs delete failed \(photos already erased\)/);
  assert.deepStrictEqual(r2.deleted, { photos: 1, job: false, customer: false });
});

// --- Guarded integration: real local Supabase + Storage --------------------------------
const { getSupabaseAdmin, _resetForTest } = require("../server/netlify/functions/supabaseClient.js");
const { insertBooking } = require("../server/netlify/functions/bookingsStore.js");
const { storeJobPhoto, BUCKET } = require("../server/netlify/functions/jobPhotoStore.js");
const IT_EMAIL = "it-erase@example.com";
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const IT_BOOKING = {
  name: "IT Erase", phone: "01242 000002", email: IT_EMAIL, address: "3 Integration Way, Cheltenham GL52 1AB", postcode: "GL52 1AB",
  date: "2026-12-17", start_time: "10:00", slots_needed: 1, rooms: "Hall", carpet_types: "Wool", concerns: "none",
  furniture_moving: false, pets: false, estimated_price: "£100", deposit: "£10", recommended_method: "Texatherm low-moisture", ai_assessment: "ok", rams: "Activity: cleaning",
};
async function cleanupIT(sb) {
  const { data: custs } = await sb.from("customers").select("id").in("email", [IT_EMAIL]);
  for (const c of custs || []) {
    const { data: jobs } = await sb.from("jobs").select("id").eq("customer_id", c.id);
    for (const j of jobs || []) await eraseJob(sb, j.id, { withCustomer: false, log: () => {} });
    await sb.from("customers").delete().eq("id", c.id);
  }
}

test("[integration] eraseJob removes the stored photo bytes, the rows, the job and the unreferenced customer on the local stack", {
  skip: process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run",
}, async () => {
  _resetForTest();
  const sb = getSupabaseAdmin();
  assert.ok(sb);
  assert.match(process.env.SUPABASE_URL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/, "refusing: SUPABASE_URL is not the local stack");
  await cleanupIT(sb);
  try {
    const ins = await insertBooking(sb, IT_BOOKING, { calLink: null });
    assert.strictEqual(ins.ok, true, ins.error && ins.error.message);
    const stored = await storeJobPhoto(sb, ins.id, { base64: PNG_B64, mediaType: "image/png" });
    assert.strictEqual(stored.ok, true, stored.error);
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls([stored.path], 60);
    assert.strictEqual((await fetch(signed[0].signedUrl)).status, 200, "the photo serves before erasure");

    const before = await reportJob(sb, ins.id);
    assert.strictEqual(before.photos, 1);
    assert.strictEqual(before.otherJobs, 0);

    const r = await eraseJob(sb, ins.id, { withCustomer: true, log: () => {} });
    assert.strictEqual(r.ok, true, r.refused);
    assert.deepStrictEqual(r.deleted, { photos: 1, job: true, customer: true });
    assert.notStrictEqual((await fetch(signed[0].signedUrl)).status, 200, "the bytes are gone");
    assert.strictEqual(await reportJob(sb, ins.id), null, "the job is gone");
    const { data: custs } = await sb.from("customers").select("id").eq("email", IT_EMAIL);
    assert.deepStrictEqual(custs, [], "the customer is gone");
    const { data: rows } = await sb.from("job_photos").select("id").eq("job_id", ins.id);
    assert.deepStrictEqual(rows, []);
  } finally {
    await cleanupIT(sb);
  }
});
