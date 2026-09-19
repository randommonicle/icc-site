// Job photos in Supabase Storage (slice5x/photos, D-047). The only module that knows the
// bucket, the object path scheme and the job_photos table.
//
// The rules, in order of how much they matter:
//   1. Never blocks a booking. storeJobPhoto is called by chat.js AFTER the fail-closed
//      insert, the calendar stamp, the PDF and both emails, and it never throws: any
//      Storage or table failure is a logged { ok: false } and the customer's outcome is
//      unchanged (the email still carries the photo, the guaranteed path). It is also
//      time-bounded, because supabase-js's storage upload takes no abort signal and a
//      slow 3 MB upload must not push the function past its own deadline.
//   2. The object path is derived here from the job id and the VALIDATED media type
//      (validateBooking, chat.js), never from anything the client sent.
//   3. Upload first, row second, so a job_photos row can never point at a missing object;
//      if the row insert fails the object is removed best-effort.
//   4. The bucket is private (migration 20260919120000). Nothing here mints a public URL;
//      the admin gets one-hour signed URLs, in one batch, from bookings.js.
//
// TODO(slice5x/photos-erasure): job erasure is SQL by hand today; deleting the jobs row
// cascades job_photos but leaves the object bytes (only the Storage API removes them).
// Whatever erases a job must call deleteJobPhotos(supabase, jobId) first.

const crypto = require("node:crypto");

const BUCKET = "job-photos";
const SIGNED_URL_SECONDS = 3600;          // the admin session's own lifetime
const UPLOAD_DEADLINE_MS = 8000;          // bounded so the booking response is never held by Storage

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

function withDeadline(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// Store one validated booking image against a persisted job. Never throws.
//   -> { ok: true, path, id }            stored (object + job_photos row)
//   -> { ok: false, skipped: reason }    nothing to do (no image, no client)
//   -> { ok: false, error }              a failure, already logged
async function storeJobPhoto(supabase, jobId, image, opts = {}) {
  const log = opts.log || console.log;
  const deadlineMs = Number.isFinite(opts.deadlineMs) ? opts.deadlineMs : UPLOAD_DEADLINE_MS;
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
  try {
    const bytes = Buffer.from(image.base64, "base64");
    // cacheControl 0: a photo is looked at once or twice by Mark, and an erased object must
    // stop serving at once, not after a CDN's max-age.
    const up = await withDeadline(
      bucket.upload(path, bytes, { contentType: image.mediaType, upsert: false, cacheControl: "0" }),
      deadlineMs,
      "job photo upload"
    );
    if (!up || up.error) {
      log("job photo upload failed:", up && up.error ? up.error.message : "no response");
      return { ok: false, error: up && up.error ? up.error.message : "no response" };
    }
  } catch (e) {
    log("job photo upload failed:", e.message);
    return { ok: false, error: e.message };
  }

  try {
    const { data, error } = await withDeadline(
      supabase.from("job_photos").insert({ job_id: jobId, storage_path: path, media_type: image.mediaType }).select("id").single(),
      deadlineMs,
      "job photo row insert"
    );
    if (error || !data) {
      log("job photo row insert failed, removing the object:", error ? error.message : "no row");
      try { await bucket.remove([path]); } catch (e) { log("job photo object removal failed:", e.message); }
      return { ok: false, error: error ? error.message : "no row" };
    }
    return { ok: true, path, id: data.id };
  } catch (e) {
    log("job photo row insert failed, removing the object:", e.message);
    try { await bucket.remove([path]); } catch (e2) { log("job photo object removal failed:", e2.message); }
    return { ok: false, error: e.message };
  }
}

// Attach a one-hour signed URL to every admin record that carries a photo path, in ONE
// Storage call. Best-effort: a client without .storage, a signing failure, or a path the
// API refuses leaves that record's photo without a url and the list still answers.
async function signPhotoUrls(supabase, records, opts = {}) {
  const log = opts.log || console.log;
  const list = Array.isArray(records) ? records : [];
  const withPhoto = list.filter((r) => r && r.photo && typeof r.photo.path === "string" && r.photo.path);
  if (!withPhoto.length) return list;
  if (!supabase || !supabase.storage || typeof supabase.storage.from !== "function") return list;
  try {
    const paths = [...new Set(withPhoto.map((r) => r.photo.path))];
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, opts.expiresIn || SIGNED_URL_SECONDS);
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

module.exports = { BUCKET, SIGNED_URL_SECONDS, UPLOAD_DEADLINE_MS, EXT_BY_TYPE, photoObjectPath, storeJobPhoto, signPhotoUrls, deleteJobPhotos };
