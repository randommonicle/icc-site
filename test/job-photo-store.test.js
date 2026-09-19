// jobPhotoStore.js (slice5x/photos, D-047): the booking photo into the private Storage
// bucket. The unit cases drive a recording fake of the supabase-js storage + table builders
// (no network) and pin the four rules the module states: never throws and never blocks
// (a failure is an { ok:false }), the path is server-derived from the validated type, the
// object goes up before the row and is removed if the row fails, and signing is one batch
// that tolerates a client with no .storage. The [integration] case (ICC_SUPABASE_IT=1, the
// local stack after db reset) proves the seam: a real upload, a real row, the signed URL
// returns the bytes, the anonymous public-object GET is refused, and erasure removes both.

const { test } = require("node:test");
const assert = require("node:assert");

const {
  BUCKET, EXT_BY_TYPE, UPLOAD_DEADLINE_MS, photoObjectPath, storeJobPhoto, signPhotoUrls, deleteJobPhotos,
} = require("../server/netlify/functions/jobPhotoStore.js");

const JOB = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
// 1x1 transparent PNG (67 bytes) as the booking client would send it.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const IMAGE = { base64: PNG_B64, mediaType: "image/png" };

// A recording fake: storage.from(bucket).upload/remove/createSignedUrls and a chainable
// from(table).insert().select().single() / .select().eq() / .delete().eq(). Each op's
// outcome is scripted per test.
function fakeSupabase(plan = {}) {
  const log = [];
  const storage = {
    from(bucket) {
      log.push(["storage.from", bucket]);
      return {
        upload: async (path, body, options) => { log.push(["upload", path, body.length, options]); if (plan.uploadThrows) throw new Error("upload boom"); return plan.upload || { data: { path }, error: null }; },
        remove: async (paths) => { log.push(["remove", paths]); if (plan.removeThrows) throw new Error("remove boom"); return plan.remove || { data: paths, error: null }; },
        createSignedUrls: async (paths, exp) => { log.push(["createSignedUrls", paths, exp]); if (plan.signThrows) throw new Error("sign boom"); return plan.sign ? plan.sign(paths) : { data: paths.map((p) => ({ path: p, signedUrl: "https://x.supabase.co/storage/v1/object/sign/job-photos/" + p + "?token=t", error: null })), error: null }; },
      };
    },
  };
  function builder(table) {
    const b = { _table: table, _ops: [] };
    for (const m of ["insert", "select", "eq", "delete", "in"]) b[m] = (...a) => { b._ops.push([m, ...a]); log.push([table + "." + m, ...a]); return b; };
    b.single = () => { b._ops.push(["single"]); return b; };
    b.then = (res, rej) => {
      const ops = b._ops.map((o) => o[0]);
      let out;
      if (ops.includes("insert")) out = plan.insert || { data: { id: "photo-row-1" }, error: null };
      else if (ops.includes("delete")) out = plan.delete || { data: null, error: null };
      else out = plan.read || { data: [], error: null };
      if (out instanceof Error) return Promise.reject(out).then(res, rej);
      return Promise.resolve(out).then(res, rej);
    };
    return b;
  }
  return { log, storage: plan.noStorage ? undefined : storage, from: (t) => builder(t) };
}

test("photoObjectPath: server-derived, extension per validated type, refuses a non-uuid id and an unlisted type", () => {
  const p = photoObjectPath(JOB, "image/jpeg", "abc");
  assert.strictEqual(p, `jobs/${JOB}/photo-abc.jpg`);
  assert.match(photoObjectPath(JOB, "image/png"), new RegExp(`^jobs/${JOB}/photo-[0-9a-f-]{36}\\.png$`));
  assert.deepStrictEqual(EXT_BY_TYPE, { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" });
  assert.throws(() => photoObjectPath("not-a-uuid", "image/png"), /not a uuid/);
  assert.throws(() => photoObjectPath(JOB, "image/svg+xml"), /not allowed/);
  assert.throws(() => photoObjectPath(JOB, "../../etc/passwd"), /not allowed/);
  assert.strictEqual(BUCKET, "job-photos");
});

test("storeJobPhoto: upload then row, the path from the job id and type, the bytes decoded, the type as contentType", async () => {
  const sb = fakeSupabase();
  const logs = [];
  const r = await storeJobPhoto(sb, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, "photo-row-1");
  assert.match(r.path, new RegExp(`^jobs/${JOB}/photo-[0-9a-f-]{36}\\.png$`));
  const ops = sb.log.map((l) => l[0]);
  assert.deepStrictEqual(ops, ["storage.from", "upload", "job_photos.insert", "job_photos.select"], "upload strictly before the row");
  const up = sb.log[1];
  assert.strictEqual(up[1], r.path);
  assert.strictEqual(up[2], Buffer.from(PNG_B64, "base64").length, "the decoded bytes go up, not the base64");
  assert.deepStrictEqual(up[3], { contentType: "image/png", upsert: false, cacheControl: "3600" });
  assert.deepStrictEqual(sb.log[2][1], { job_id: JOB, storage_path: r.path, media_type: "image/png" });
  assert.deepStrictEqual(logs, []);
});

test("storeJobPhoto never throws: no image / no client are skips; a throwing or erroring upload is { ok:false } and no row is written", async () => {
  assert.deepStrictEqual(await storeJobPhoto(fakeSupabase(), JOB, null), { ok: false, skipped: "no image" });
  assert.deepStrictEqual(await storeJobPhoto(fakeSupabase(), JOB, { base64: "", mediaType: "image/png" }), { ok: false, skipped: "no image" });
  assert.deepStrictEqual(await storeJobPhoto(fakeSupabase({ noStorage: true }), JOB, IMAGE), { ok: false, skipped: "no storage client" });
  assert.deepStrictEqual(await storeJobPhoto(null, JOB, IMAGE), { ok: false, skipped: "no storage client" });

  const logs = [];
  const thrown = fakeSupabase({ uploadThrows: true });
  const r1 = await storeJobPhoto(thrown, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.deepStrictEqual(r1, { ok: false, error: "upload boom" });
  assert.ok(!thrown.log.some((l) => l[0] === "job_photos.insert"), "no row after a failed upload");

  const errored = fakeSupabase({ upload: { data: null, error: { message: "mime type not allowed" } } });
  const r2 = await storeJobPhoto(errored, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.deepStrictEqual(r2, { ok: false, error: "mime type not allowed" });
  assert.ok(!errored.log.some((l) => l[0] === "job_photos.insert"));

  const badType = await storeJobPhoto(fakeSupabase(), JOB, { base64: PNG_B64, mediaType: "text/html" }, { log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(badType.ok, false);
  assert.match(badType.error, /not allowed/);
  const badJob = await storeJobPhoto(fakeSupabase(), "12345", IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.match(badJob.error, /not a uuid/);
  assert.strictEqual(logs.length, 4, "every failure is logged once");
});

test("storeJobPhoto: a failed row insert removes the object it just uploaded", async () => {
  const logs = [];
  const sb = fakeSupabase({ insert: { data: null, error: { message: "row boom" } } });
  const r = await storeJobPhoto(sb, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.deepStrictEqual(r, { ok: false, error: "row boom" });
  const rm = sb.log.find((l) => l[0] === "remove");
  assert.ok(rm, "the object is removed");
  assert.match(rm[1][0], new RegExp(`^jobs/${JOB}/photo-`));
  assert.ok(logs[0].includes("removing the object"));

  const thrown = fakeSupabase({ insert: new Error("network down") });
  const r2 = await storeJobPhoto(thrown, JOB, IMAGE, { log: () => {} });
  assert.deepStrictEqual(r2, { ok: false, error: "network down" });
  assert.ok(thrown.log.some((l) => l[0] === "remove"));
});

test("storeJobPhoto: a hung upload is cut by the deadline and reported, never awaited past it", async () => {
  const sb = fakeSupabase();
  sb.storage.from = () => ({ upload: () => new Promise(() => {}), remove: async () => ({ error: null }) });
  const logs = [];
  const t0 = Date.now();
  const r = await storeJobPhoto(sb, JOB, IMAGE, { deadlineMs: 50, log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /job photo upload exceeded 50 ms/);
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(UPLOAD_DEADLINE_MS <= 10000, "the default deadline leaves the function its own headroom");
});

test("signPhotoUrls: one batch for every record with a path, url attached, records without a photo untouched", async () => {
  const sb = fakeSupabase();
  const records = [
    { id: "a", photo: { path: "jobs/a/photo-1.jpg", mediaType: "image/jpeg" } },
    { id: "b" },
    { id: "c", photo: { path: "jobs/c/photo-2.png", mediaType: "image/png" } },
    { id: "d", photo: { path: "jobs/a/photo-1.jpg", mediaType: "image/jpeg" } }, // duplicate path signs once
  ];
  const out = await signPhotoUrls(sb, records);
  assert.strictEqual(out, records);
  const calls = sb.log.filter((l) => l[0] === "createSignedUrls");
  assert.strictEqual(calls.length, 1, "one Storage call for the whole list");
  assert.deepStrictEqual(calls[0][1], ["jobs/a/photo-1.jpg", "jobs/c/photo-2.png"]);
  assert.strictEqual(calls[0][2], 3600);
  assert.strictEqual(records[0].photo.url, "https://x.supabase.co/storage/v1/object/sign/job-photos/jobs/a/photo-1.jpg?token=t");
  assert.strictEqual(records[3].photo.url, records[0].photo.url);
  assert.strictEqual(records[1].photo, undefined);
  assert.ok(records[2].photo.url.includes("photo-2.png"));
});

test("signPhotoUrls is best-effort: no .storage, a throw, an error, or a per-path error leaves url unset and the list intact", async () => {
  const mk = () => [{ id: "a", photo: { path: "jobs/a/p.jpg", mediaType: "image/jpeg" } }];
  const noStorage = mk();
  assert.strictEqual(await signPhotoUrls(fakeSupabase({ noStorage: true }), noStorage), noStorage);
  assert.strictEqual(noStorage[0].photo.url, undefined);
  const logs = [];
  const thrown = mk();
  await signPhotoUrls(fakeSupabase({ signThrows: true }), thrown, { log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(thrown[0].photo.url, undefined);
  const errored = mk();
  await signPhotoUrls(fakeSupabase({ sign: () => ({ data: null, error: { message: "sign fail" } }) }), errored, { log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(errored[0].photo.url, undefined);
  const perPath = mk();
  await signPhotoUrls(fakeSupabase({ sign: (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: null, error: "Object not found" })), error: null }) }), perPath, { log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(perPath[0].photo.url, undefined);
  assert.strictEqual(logs.length, 2);
  assert.deepStrictEqual(await signPhotoUrls(null, []), []);
  assert.deepStrictEqual(await signPhotoUrls(null, undefined), []);
});

test("deleteJobPhotos: reads the rows, removes the objects, then the rows; refuses a non-uuid; reports the first failure", async () => {
  const sb = fakeSupabase({ read: { data: [{ id: "r1", storage_path: "jobs/x/p1.jpg" }, { id: "r2", storage_path: "jobs/x/p2.png" }], error: null } });
  const r = await deleteJobPhotos(sb, JOB);
  assert.deepStrictEqual(r, { ok: true, removed: 2 });
  const ops = sb.log.map((l) => l[0]);
  assert.ok(ops.indexOf("remove") < ops.indexOf("job_photos.delete"), "objects go before rows");
  assert.deepStrictEqual(sb.log.find((l) => l[0] === "remove")[1], ["jobs/x/p1.jpg", "jobs/x/p2.png"]);
  assert.deepStrictEqual(await deleteJobPhotos(sb, "nope"), { ok: false, error: "job id is not a uuid" });
  const none = fakeSupabase({ read: { data: [], error: null } });
  assert.deepStrictEqual(await deleteJobPhotos(none, JOB), { ok: true, removed: 0 });
  assert.ok(!none.log.some((l) => l[0] === "remove"), "nothing to remove, no Storage call");
  const rmFail = fakeSupabase({ read: { data: [{ id: "r1", storage_path: "jobs/x/p1.jpg" }], error: null }, remove: { data: null, error: { message: "rm fail" } } });
  assert.deepStrictEqual(await deleteJobPhotos(rmFail, JOB), { ok: false, error: "rm fail" });
  assert.ok(!rmFail.log.some((l) => l[0] === "job_photos.delete"), "rows are kept when the objects could not be removed");
});

// --- Guarded integration: real local Supabase + Storage (D-010 real services, no mocks) ---
// Needs the local stack after `supabase db reset` (the bucket migration), ICC_SUPABASE_IT=1
// and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY pointing at 127.0.0.1. safe-smokes: its own
// customer/job (by a test email), cleaned before and after; jobs before customers.
const { getSupabaseAdmin, _resetForTest } = require("../server/netlify/functions/supabaseClient.js");
const { insertBooking } = require("../server/netlify/functions/bookingsStore.js");
const IT_EMAIL = "it-photos@example.com";
const IT_BOOKING = {
  name: "IT Photos", phone: "01242 000001", email: IT_EMAIL, address: "2 Integration Way, Cheltenham GL52 1AB", postcode: "GL52 1AB",
  date: "2026-12-16", start_time: "10:00", slots_needed: 1, rooms: "Hall", carpet_types: "Wool", concerns: "none",
  furniture_moving: false, pets: false, estimated_price: "£100", deposit: "£10", recommended_method: "Texatherm low-moisture", ai_assessment: "ok", rams: "Activity: cleaning",
};
async function cleanupIT(sb) {
  const { data: custs } = await sb.from("customers").select("id").in("email", [IT_EMAIL]);
  const ids = (custs || []).map((c) => c.id);
  if (ids.length) {
    const { data: jobs } = await sb.from("jobs").select("id").in("customer_id", ids);
    for (const j of jobs || []) await deleteJobPhotos(sb, j.id);
    await sb.from("jobs").delete().in("customer_id", ids);
    await sb.from("customers").delete().in("id", ids);
  }
}

test("[integration] a real upload, row, signed URL round-trip; the public object path is refused; erasure removes both", {
  skip: process.env.ICC_SUPABASE_IT === "1" ? false : "set ICC_SUPABASE_IT=1 with local Supabase env to run",
}, async () => {
  _resetForTest();
  const sb = getSupabaseAdmin();
  assert.ok(sb, "expected a Supabase client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  assert.match(process.env.SUPABASE_URL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/, "refusing: SUPABASE_URL is not the local stack");
  await cleanupIT(sb);
  try {
    const ins = await insertBooking(sb, IT_BOOKING, { calLink: null });
    assert.strictEqual(ins.ok, true, ins.error && ins.error.message);
    const jobId = ins.id;

    const stored = await storeJobPhoto(sb, jobId, IMAGE);
    assert.strictEqual(stored.ok, true, stored.error);
    assert.match(stored.path, new RegExp(`^jobs/${jobId}/photo-[0-9a-f-]{36}\\.png$`));

    // the row points at the object
    const { data: rows } = await sb.from("job_photos").select("id,storage_path,media_type").eq("job_id", jobId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].storage_path, stored.path);
    assert.strictEqual(rows[0].media_type, "image/png");

    // the signed URL returns the bytes
    const recs = [{ id: jobId, photo: { path: stored.path, mediaType: "image/png" } }];
    await signPhotoUrls(sb, recs);
    assert.ok(recs[0].photo.url && recs[0].photo.url.startsWith(process.env.SUPABASE_URL + "/storage/v1/"), "signed url is on the Supabase origin under /storage/v1/: " + recs[0].photo.url);
    const got = await fetch(recs[0].photo.url);
    assert.strictEqual(got.status, 200, "signed GET answers 200");
    assert.strictEqual(Buffer.from(await got.arrayBuffer()).toString("base64"), PNG_B64, "the bytes round-trip");

    // negative control: the bucket is private, the public object path is refused
    const pub = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${stored.path}`);
    assert.ok(pub.status === 400 || pub.status === 403 || pub.status === 404, "public path refused, got " + pub.status);

    // a second, unrelated type is refused by the bucket's allowlist (the server's own bound, mirrored)
    const bad = await sb.storage.from(BUCKET).upload(`jobs/${jobId}/evil.html`, Buffer.from("<html>"), { contentType: "text/html" });
    assert.ok(bad.error, "text/html is refused by allowed_mime_types");

    // erasure removes the object and the row
    const erased = await deleteJobPhotos(sb, jobId);
    assert.deepStrictEqual(erased, { ok: true, removed: 1 });
    const gone = await fetch(recs[0].photo.url);
    assert.notStrictEqual(gone.status, 200, "the signed URL no longer serves after erasure");
    const { data: after } = await sb.from("job_photos").select("id").eq("job_id", jobId);
    assert.deepStrictEqual(after, []);
  } finally {
    await cleanupIT(sb);
  }
});
