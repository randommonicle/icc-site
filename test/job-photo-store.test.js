// jobPhotoStore.js (slice5x/photos, D-047): the booking photo into the private Storage
// bucket. The unit cases drive a recording fake of the supabase-js storage + table builders
// (no network) and pin the rules the module states: never throws and never blocks (a
// failure is an { ok:false }, and ONE deadline bounds the whole call, cleanup included),
// the path is server-derived from the validated type, the ROW goes first and the object
// second so a late completion can only leave a row without an object (never bytes no
// erasure can find), a late result tidies its own row, and signing is one bounded batch
// that tolerates a client with no .storage. The [integration] case (ICC_SUPABASE_IT=1, the
// local stack after db reset) proves the seam: a real row, a real upload, the signed URL
// returns the bytes, the anonymous public-object GET is refused, and erasure removes both.

const { test } = require("node:test");
const assert = require("node:assert");

const {
  BUCKET, EXT_BY_TYPE, STORE_DEADLINE_MS, SIGN_DEADLINE_MS, photoObjectPath, storeJobPhoto, signPhotoUrls, deleteJobPhotos,
} = require("../server/netlify/functions/jobPhotoStore.js");

const JOB = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
// 1x1 transparent PNG (67 bytes) as the booking client would send it.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const IMAGE = { base64: PNG_B64, mediaType: "image/png" };
const tick = () => new Promise((r) => setImmediate(r));
const deferred = () => { const d = {}; d.promise = new Promise((res, rej) => { d.resolve = res; d.reject = rej; }); return d; };

// A recording fake: storage.from(bucket).upload/remove/createSignedUrls and a chainable
// from(table).insert().select().single() / .select().eq() / .delete().eq(). Each op's
// outcome is scripted per test; a `Deferred` outcome hangs until the test settles it.
function fakeSupabase(plan = {}) {
  const log = [];
  const settle = (out) => (out && out.promise ? out.promise : out instanceof Error ? Promise.reject(out) : Promise.resolve(out));
  const storage = {
    from(bucket) {
      log.push(["storage.from", bucket]);
      return {
        upload: (path, body, options) => { log.push(["upload", path, body.length, options]); if (plan.uploadThrows) return Promise.reject(new Error("upload boom")); return settle(plan.upload || { data: { path }, error: null }); },
        remove: (paths) => { log.push(["remove", paths]); if (plan.removeThrows) return Promise.reject(new Error("remove boom")); return settle(plan.remove || { data: paths, error: null }); },
        createSignedUrls: (paths, exp) => { log.push(["createSignedUrls", paths, exp]); if (plan.signThrows) return Promise.reject(new Error("sign boom")); return settle(plan.sign ? plan.sign(paths) : { data: paths.map((p) => ({ path: p, signedUrl: "https://x.supabase.co/storage/v1/object/sign/job-photos/" + p + "?token=t", error: null })), error: null }); },
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
      return settle(out).then(res, rej);
    };
    return b;
  }
  return { log, storage: plan.noStorage ? undefined : storage, from: (t) => builder(t) };
}
const ops = (sb) => sb.log.map((l) => l[0]);
const rowDrops = (sb) => sb.log.filter((l) => l[0] === "job_photos.delete").length;
const removes = (sb) => sb.log.filter((l) => l[0] === "remove").length;
const settled = async () => { for (let i = 0; i < 4; i++) await tick(); };

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

test("storeJobPhoto: the ROW first, then the object; the path from the job id and type; the bytes decoded; the type as contentType; no cache max-age", async () => {
  const sb = fakeSupabase();
  const logs = [];
  const r = await storeJobPhoto(sb, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, "photo-row-1");
  assert.match(r.path, new RegExp(`^jobs/${JOB}/photo-[0-9a-f-]{36}\\.png$`));
  const o = ops(sb);
  assert.ok(o.indexOf("job_photos.insert") >= 0 && o.indexOf("upload") > o.indexOf("job_photos.insert"), "the row is written strictly before the upload starts: " + o.join(","));
  const ins = sb.log.find((l) => l[0] === "job_photos.insert");
  assert.deepStrictEqual(ins[1], { job_id: JOB, storage_path: r.path, media_type: "image/png" });
  const up = sb.log.find((l) => l[0] === "upload");
  assert.strictEqual(up[1], r.path);
  assert.strictEqual(up[2], Buffer.from(PNG_B64, "base64").length, "the decoded bytes go up, not the base64");
  assert.deepStrictEqual(up[3], { contentType: "image/png", upsert: false, cacheControl: "0" }, "no CDN max-age: an erased photo must stop serving at once");
  await tick();
  assert.strictEqual(rowDrops(sb), 0, "nothing is dropped on the happy path");
  assert.deepStrictEqual(logs, []);
});

test("storeJobPhoto never throws: no image / no client are skips; a refused id or type never touches the client", async () => {
  assert.deepStrictEqual(await storeJobPhoto(fakeSupabase(), JOB, null), { ok: false, skipped: "no image" });
  assert.deepStrictEqual(await storeJobPhoto(fakeSupabase(), JOB, { base64: "", mediaType: "image/png" }), { ok: false, skipped: "no image" });
  assert.deepStrictEqual(await storeJobPhoto(fakeSupabase({ noStorage: true }), JOB, IMAGE), { ok: false, skipped: "no storage client" });
  assert.deepStrictEqual(await storeJobPhoto(null, JOB, IMAGE), { ok: false, skipped: "no storage client" });
  const logs = [];
  const badType = fakeSupabase();
  const r1 = await storeJobPhoto(badType, JOB, { base64: PNG_B64, mediaType: "text/html" }, { log: (...a) => logs.push(a.join(" ")) });
  assert.match(r1.error, /not allowed/);
  assert.deepStrictEqual(ops(badType), [], "a refused type reaches neither the table nor Storage");
  const badJob = fakeSupabase();
  const r2 = await storeJobPhoto(badJob, "12345", IMAGE, { log: (...a) => logs.push(a.join(" ")) });
  assert.match(r2.error, /not a uuid/);
  assert.deepStrictEqual(ops(badJob), []);
  assert.strictEqual(logs.length, 2, "every failure is logged once");
});

test("storeJobPhoto: a failed row insert starts no upload; a failed or throwing upload undoes the pair, object first, row only when the removal succeeded (never awaited)", async () => {
  const logs = [];
  const rowFail = fakeSupabase({ insert: { data: null, error: { message: "row boom" } } });
  assert.deepStrictEqual(await storeJobPhoto(rowFail, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) }), { ok: false, error: "row boom" });
  assert.ok(!ops(rowFail).includes("upload"), "no upload after a failed row");

  const upErr = fakeSupabase({ upload: { data: null, error: { message: "mime type not allowed" } } });
  assert.deepStrictEqual(await storeJobPhoto(upErr, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) }), { ok: false, error: "mime type not allowed" });
  await settled();
  // An upload error is not proof that nothing landed (storage-js reports a committed object
  // whose success body failed to parse as an error too), so the undo removes the object first
  // (a no-op when nothing landed) and only then the row.
  const order = ops(upErr).filter((o) => o === "remove" || o === "job_photos.delete");
  assert.deepStrictEqual(order, ["remove", "job_photos.delete"], "object removal before the row delete");
  assert.deepStrictEqual(upErr.log.find((l) => l[0] === "remove")[1], [upErr.log.find((l) => l[0] === "upload")[1]], "the removal names the path that was uploaded");
  assert.deepStrictEqual(upErr.log.find((l) => l[0] === "job_photos.eq")[1], "id");

  const upThrow = fakeSupabase({ uploadThrows: true });
  assert.deepStrictEqual(await storeJobPhoto(upThrow, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) }), { ok: false, error: "upload boom" });
  await settled();
  assert.strictEqual(removes(upThrow), 1);
  assert.strictEqual(rowDrops(upThrow), 1);

  // The removal failing keeps the row: it still names what may exist in the bucket.
  const rmFail = fakeSupabase({ upload: { data: null, error: { message: "ambiguous" } }, remove: { data: null, error: { message: "storage down" } } });
  assert.strictEqual((await storeJobPhoto(rmFail, JOB, IMAGE, { log: (...a) => logs.push(a.join(" ")) })).ok, false);
  await settled();
  assert.strictEqual(removes(rmFail), 1);
  assert.strictEqual(rowDrops(rmFail), 0, "the row is kept when the object could not be removed");

  // A hung cleanup never holds the caller: the removal never settles, the call still returns.
  const hungDrop = fakeSupabase({ upload: { data: null, error: { message: "boom" } }, remove: deferred() });
  const t0 = Date.now();
  assert.strictEqual((await storeJobPhoto(hungDrop, JOB, IMAGE, { log: () => {} })).ok, false);
  assert.ok(Date.now() - t0 < 1000, "cleanup is fire-and-forget");
  assert.strictEqual(logs.length, 5, "the three failures and the kept-row note are logged: " + JSON.stringify(logs));
});

test("storeJobPhoto: ONE deadline bounds the whole call; a hung upload leaves a row that a late definite failure drops and a late success keeps", async () => {
  assert.ok(STORE_DEADLINE_MS <= 5000, "the default leaves a 10 s function its own headroom after the emails");
  // late failure
  const lateFail = deferred();
  const sb = fakeSupabase({ upload: lateFail });
  const logs = [];
  const t0 = Date.now();
  const r = await storeJobPhoto(sb, JOB, IMAGE, { deadlineMs: 60, log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /job photo store exceeded 60 ms/);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(ops(sb).includes("job_photos.insert") && ops(sb).includes("upload"), "the row was written and the upload started before the deadline");
  assert.strictEqual(rowDrops(sb), 0, "nothing dropped while the upload is still in flight");
  lateFail.resolve({ data: null, error: { message: "late 500" } });
  await settled();
  assert.strictEqual(removes(sb), 1, "a failure after the deadline removes whatever may have landed first");
  assert.strictEqual(rowDrops(sb), 1, "then drops the row");
  // late success
  const lateOk = deferred();
  const sb2 = fakeSupabase({ upload: lateOk });
  assert.strictEqual((await storeJobPhoto(sb2, JOB, IMAGE, { deadlineMs: 60, log: () => {} })).ok, false);
  lateOk.resolve({ data: { path: "x" }, error: null });
  await tick(); await tick();
  assert.strictEqual(rowDrops(sb2), 0, "a late success is a consistent pair and is kept");
});

test("storeJobPhoto: a hung row insert returns within the deadline, starts no upload, and a row that commits late is dropped", async () => {
  const lateRow = deferred();
  const sb = fakeSupabase({ insert: lateRow });
  const t0 = Date.now();
  const r = await storeJobPhoto(sb, JOB, IMAGE, { deadlineMs: 60, log: () => {} });
  assert.strictEqual(r.ok, false);
  assert.ok(Date.now() - t0 < 1000);
  lateRow.resolve({ data: { id: "late-row" }, error: null });
  await tick(); await tick();
  assert.ok(!ops(sb).includes("upload"), "no upload starts after the deadline");
  assert.strictEqual(rowDrops(sb), 1, "the late row is dropped");
  assert.deepStrictEqual(sb.log.find((l) => l[0] === "job_photos.eq").slice(1), ["id", "late-row"]);
});

test("signPhotoUrls: one bounded batch for every record with a path, url attached, records without a photo untouched", async () => {
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
  assert.ok(SIGN_DEADLINE_MS <= 5000);
});

test("signPhotoUrls is best-effort: no .storage, a throw, an error, a per-path error, or a hung call leaves url unset and the list intact", async () => {
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
  const hung = mk();
  const t0 = Date.now();
  await signPhotoUrls(fakeSupabase({ sign: () => deferred() }), hung, { deadlineMs: 60, log: (...a) => logs.push(a.join(" ")) });
  assert.strictEqual(hung[0].photo.url, undefined);
  assert.ok(Date.now() - t0 < 1000, "a hung signing call is cut by its deadline");
  assert.ok(logs.some((l) => /job photo signing exceeded 60 ms/.test(l)));
  assert.strictEqual(logs.length, 3);
  assert.deepStrictEqual(await signPhotoUrls(null, []), []);
  assert.deepStrictEqual(await signPhotoUrls(null, undefined), []);
});

test("deleteJobPhotos: reads the rows, removes the objects, then the rows; refuses a non-uuid; reports the first failure", async () => {
  const sb = fakeSupabase({ read: { data: [{ id: "r1", storage_path: "jobs/x/p1.jpg" }, { id: "r2", storage_path: "jobs/x/p2.png" }], error: null } });
  const r = await deleteJobPhotos(sb, JOB);
  assert.deepStrictEqual(r, { ok: true, removed: 2 });
  const o = ops(sb);
  assert.ok(o.indexOf("remove") < o.indexOf("job_photos.delete"), "objects go before rows");
  assert.deepStrictEqual(sb.log.find((l) => l[0] === "remove")[1], ["jobs/x/p1.jpg", "jobs/x/p2.png"]);
  assert.deepStrictEqual(await deleteJobPhotos(sb, "nope"), { ok: false, error: "job id is not a uuid" });
  const none = fakeSupabase({ read: { data: [], error: null } });
  assert.deepStrictEqual(await deleteJobPhotos(none, JOB), { ok: true, removed: 0 });
  assert.ok(!ops(none).includes("remove"), "nothing to remove, no Storage call");
  const rmFail = fakeSupabase({ read: { data: [{ id: "r1", storage_path: "jobs/x/p1.jpg" }], error: null }, remove: { data: null, error: { message: "rm fail" } } });
  assert.deepStrictEqual(await deleteJobPhotos(rmFail, JOB), { ok: false, error: "rm fail" });
  assert.ok(!ops(rmFail).includes("job_photos.delete"), "rows are kept when the objects could not be removed");
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
