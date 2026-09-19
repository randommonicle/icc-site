// Job photos in Supabase Storage (slice5x/photos, D-047). The only module that knows the
// bucket, the object path scheme and the job_photos table.
//
// The rules, in order of how much they matter:
//   1. Never blocks a booking. storeJobPhoto is called by chat.js AFTER the fail-closed
//      insert, the calendar stamp, the PDF and both emails, and it never throws: any
//      Storage or table failure is a logged { ok: false } and the customer's outcome is
//      unchanged (the email still carries the photo, the guaranteed path). The WHOLE call
//      is bounded by one deadline (STORE_DEADLINE_MS), cleanup is never awaited, and no new
//      step starts once the deadline has fired, because supabase-js's storage upload takes
//      no abort signal and a slow 3 MB upload must not hold the response (cross-agent
//      review, GPT, 19 Sept 2026: two sequential deadlines plus unbounded cleanup awaits
//      let the helper hold the response for about 16 s).
//   2. The object path is derived here from the job id and the VALIDATED media type
//      (validateBooking, chat.js), never from anything the client sent.
//   3. Row FIRST, object second. A deadline cannot cancel an in-flight call, so a late
//      completion always leaves one of two states behind: a row without an object (the
//      card says "No photo uploaded", erasure deletes the row, nothing leaks) or an object
//      without a row (bytes of a customer's home that no erasure path can find). The order
//      is chosen so the only reachable inconsistent state is the harmless one, and a late
//      result that arrives after the deadline tidies itself (a row whose upload never
//      started or definitely failed is deleted, fire-and-forget).
//   4. The bucket is private (migration 20260919120000). Nothing here mints a public URL;
//      the admin gets one-hour signed URLs, in one batch, from bookings.js.
//
// Erasure: deleting the jobs row cascades job_photos but leaves the object bytes (only
// the Storage API removes them), so scripts/erase-job.js calls deleteJobPhotos first.
// TODO(slice5x/photos-erasure): an admin-UI erase action, when one is built, must do the same.

const crypto = require("node:crypto");

const BUCKET = "job-photos";
const SIGNED_URL_SECONDS = 3600;          // the admin session's own lifetime
const STORE_DEADLINE_MS = 5000;           // the whole store call: chat.js awaits this AFTER the emails, inside a 10 s function
const SIGN_DEADLINE_MS = 5000;            // the admin list is never held by a hung signing call

// The four types validateBooking accepts, and the extension each gets on the object.
const EXT_BY_TYPE = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
});

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// jobs/<job_id>/photo-<uuid>.<ext>. Throws on a non-uuid job id or an unlisted type, so a
// caller can never build a path from client data by accident; storeJobPhoto catches it.
function photoObjectPath(jobId, mediaType, id = crypto.randomUUID()) {
  if (!isUuid(jobId)) throw new Error("photoObjectPath: job id is not a uuid");
  const ext = EXT_BY_TYPE[mediaType];
  if (!ext) throw new Error(`photoObjectPath: media type not allowed: ${String(mediaType)}`);
  return `jobs/${jobId}/photo-${id}.${ext}`;
}

// Race a promise against a deadline. Rejects when the deadline fires (after calling
// onExpire, so the racer can stop starting new work); it cannot cancel the promise.
function withDeadline(promise, ms, label, onExpire) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { if (onExpire) onExpire(); reject(new Error(`${label} exceeded ${ms} ms`)); }, ms);
  });
  return Promise.race([Promise.resolve(promise), deadline]).finally(() => clearTimeout(timer));
}

// Start a cleanup and forget it: never awaited, a failure (a rejection, an { error }, or a
// synchronous throw while building the call) is logged, never thrown.
function fireAndForget(build, what, log) {
  Promise.resolve().then(build).then(
    (r) => { if (r && r.error) log(`job photo ${what} failed:`, r.error.message); },
    (e) => log(`job photo ${what} failed:`, e && e.message)
  );
}

// Store one validated booking image against a persisted job. Never throws. Bounded by
// opts.deadlineMs (default STORE_DEADLINE_MS) for the whole call.
//   -> { ok: true, path, id }            stored (job_photos row + object)
//   -> { ok: false, skipped: reason }    nothing to do (no image, no client)
//   -> { ok: false, error }              a failure or the deadline, already logged
async function storeJobPhoto(supabase, jobId, image, opts = {}) {
  const log = opts.log || console.log;
  const deadlineMs = Number.isFinite(opts.deadlineMs) ? opts.deadlineMs : STORE_DEADLINE_MS;
  if (!image || typeof image !== "object" || typeof image.base64 !== "string" || !image.base64) return { ok: false, skipped: "no image" };
  if (!supabase || !supabase.storage || typeof supabase.storage.from !== "function") return { ok: false, skipped: "no storage client" };

  let path;
  try {
    path = photoObjectPath(jobId, image.mediaType);
  } catch (e) {
    log("job photo skipped:", e.message);
    return { ok: false, error: e.message };
  }

  const bucket = supabase.storage.from(BUCKET);
  const state = { expired: false };
  // A row whose upload never STARTED can go straight away: no object can exist.
  const dropRow = (id, why) => fireAndForget(() => supabase.from("job_photos").delete().eq("id", id), `row removal (${why})`, log);
  // A row whose upload FAILED is undone in two steps, because an upload error is not proof
  // that nothing landed: storage-js reports a committed object whose success body it could
  // not parse as an error too (cross-agent review, GPT round 2). So remove the object first
  // (a no-op when nothing landed: Storage answers { data: [] } for a missing key, measured on
  // the local stack) and delete the row only when that removal succeeded; if it did not,
  // the row stays and still names what may exist.
  const undoPair = (id, why) => fireAndForget(async () => {
    const rm = await bucket.remove([path]);
    if (rm && rm.error) { log(`job photo object removal (${why}) failed, row kept:`, rm.error.message); return null; }
    return supabase.from("job_photos").delete().eq("id", id);
  }, `undo (${why})`, log);

  const run = async () => {
    // 1. The row, first (rule 3). A row that commits after the deadline has no upload
    //    behind it (none is started once expired), so it is dropped by the continuation.
    const insert = Promise.resolve(supabase.from("job_photos").insert({ job_id: jobId, storage_path: path, media_type: image.mediaType }).select("id").single());
    insert.then((r) => { if (state.expired && r && r.data && !r.error) dropRow(r.data.id, "row committed after the deadline"); }, () => {});
    const { data, error } = await insert;
    if (state.expired) return { ok: false, error: "deadline" };
    if (error || !data) {
      log("job photo row insert failed:", error ? error.message : "no row");
      return { ok: false, error: error ? error.message : "no row" };
    }
    const rowId = data.id;

    // 2. The object. A late success leaves a consistent pair (kept); a late failure is
    //    undone object-then-row by the continuation (see undoPair).
    const bytes = Buffer.from(image.base64, "base64");
    // cacheControl 0: a photo is looked at once or twice by Mark, and an erased object must
    // stop serving at once, not after a CDN's max-age.
    const upload = Promise.resolve(bucket.upload(path, bytes, { contentType: image.mediaType, upsert: false, cacheControl: "0" }));
    upload.then(
      (up) => { if (state.expired && (!up || up.error)) undoPair(rowId, "upload failed after the deadline"); },
      () => { if (state.expired) undoPair(rowId, "upload threw after the deadline"); }
    );
    let up;
    try {
      up = await upload;
    } catch (e) {
      if (state.expired) return { ok: false, error: "deadline" };
      log("job photo upload failed:", e.message);
      undoPair(rowId, "upload threw");
      return { ok: false, error: e.message };
    }
    if (state.expired) return { ok: false, error: "deadline" };
    if (!up || up.error) {
      const msg = up && up.error ? up.error.message : "no response";
      log("job photo upload failed:", msg);
      undoPair(rowId, "upload failed");
      return { ok: false, error: msg };
    }
    return { ok: true, path, id: rowId };
  };

  try {
    return await withDeadline(run(), deadlineMs, "job photo store", () => { state.expired = true; });
  } catch (e) {
    log("job photo store failed:", e.message);
    return { ok: false, error: e.message };
  }
}

// Attach a one-hour signed URL to every admin record that carries a photo path, in ONE
// Storage call, bounded by SIGN_DEADLINE_MS. Best-effort: a client without .storage, a
// signing failure, the deadline, or a path the API refuses leaves that record's photo
// without a url and the list still answers.
async function signPhotoUrls(supabase, records, opts = {}) {
  const log = opts.log || console.log;
  const list = Array.isArray(records) ? records : [];
  const withPhoto = list.filter((r) => r && r.photo && typeof r.photo.path === "string" && r.photo.path);
  if (!withPhoto.length) return list;
  if (!supabase || !supabase.storage || typeof supabase.storage.from !== "function") return list;
  try {
    const paths = [...new Set(withPhoto.map((r) => r.photo.path))];
    const { data, error } = await withDeadline(
      supabase.storage.from(BUCKET).createSignedUrls(paths, opts.expiresIn || SIGNED_URL_SECONDS),
      Number.isFinite(opts.deadlineMs) ? opts.deadlineMs : SIGN_DEADLINE_MS,
      "job photo signing"
    );
    if (error || !Array.isArray(data)) {
      log("job photo signing failed:", error ? error.message : "no data");
      return list;
    }
    const urlByPath = new Map();
    for (const d of data) if (d && d.path && d.signedUrl && !d.error) urlByPath.set(d.path, d.signedUrl);
    for (const r of withPhoto) {
      const url = urlByPath.get(r.photo.path);
      if (url) r.photo.url = url;
    }
  } catch (e) {
    log("job photo signing failed:", e.message);
  }
  return list;
}

// Remove every object and row for a job (the erasure half the cascade cannot do).
// Objects first, then rows: a failure part-way leaves rows that still name what is left.
//   -> { ok: true, removed: n } | { ok: false, error }
async function deleteJobPhotos(supabase, jobId, opts = {}) {
  const log = opts.log || console.log;
  if (!isUuid(jobId)) return { ok: false, error: "job id is not a uuid" };
  if (!supabase || !supabase.storage) return { ok: false, error: "no storage client" };
  try {
    const { data: rows, error: readErr } = await supabase.from("job_photos").select("id,storage_path").eq("job_id", jobId);
    if (readErr) return { ok: false, error: readErr.message };
    const paths = (rows || []).map((r) => r.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rmErr) return { ok: false, error: rmErr.message };
    }
    const { error: delErr } = await supabase.from("job_photos").delete().eq("job_id", jobId);
    if (delErr) return { ok: false, error: delErr.message };
    return { ok: true, removed: paths.length };
  } catch (e) {
    log("job photo erasure failed:", e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { BUCKET, SIGNED_URL_SECONDS, STORE_DEADLINE_MS, SIGN_DEADLINE_MS, EXT_BY_TYPE, photoObjectPath, storeJobPhoto, signPhotoUrls, deleteJobPhotos };
