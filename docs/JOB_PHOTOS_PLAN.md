# Job photos into Supabase Storage (`TODO(slice5x/photos)`): plan and checkpoint log

**Opened:** 19 September 2026, unattended session (Ben at the gym), on `claude/unattended-work-session-798e3e`. Plan reviewed with the session advisor before the first commit. Decision record drafted as D-047 for Ben's acceptance.

**Why now.** Since Slice 5b (14 June 2026) a Postgres-mode booking's photo has reached Mark only by email and in the PDF job card; the admin card says "No photo uploaded" for every live booking (`bookingsStore.js` `jobRowToAdminRecord`, the anchor). The `job_photos` table has existed since the init migration (June) with a `storage_path`, waiting for a bucket. Nothing in the slice needs a decision from Mark or Ben beyond accepting the shape below.

## Shape

- **Bucket** `job-photos`, private (`public = false`), 4 MB object limit (the validated base64 cap of 4.5M chars decodes to about 3.4 MB), exactly the four media types `validateBooking` accepts (JPEG, PNG, WebP, GIF). Created by a migration (`insert into storage.buckets`), verified by inline catalog queries and pgTAP. `storage.objects` keeps Supabase's default RLS (enabled, no policies), so only the service role can read or write; the admin never gets a public URL.
- **Object path** derived server-side, never from the client: `jobs/<job_id>/photo-<uuid>.<ext>`, the extension from the validated media type.
- **Upload placement** in `chat.js` `handleBooking` (Postgres branch only): AFTER the fail-closed insert, the calendar stamp, the PDF and both emails, immediately before the response. Best-effort and time-bounded (`Promise.race` against a short deadline; supabase-js storage `upload()` takes no abort signal, a dangling upload after the response is harmless in a function). A Storage failure never touches the booking outcome or the emails (the email still carries the photo, the guaranteed path). Upload first, then the `job_photos` row, so a row can never point at a missing object; if the row insert fails the object is removed best-effort. No-op without `booking.image`.
- **Admin read**: `fetchBookingsFromJobs` selects `job_photos(id,storage_path,media_type)`; `jobRowToAdminRecord` maps the first photo to `photo: { path, mediaType }`; `bookings.js` signs every path in ONE batch (`createSignedUrls`, one hour, the session's own lifetime) and attaches `photo.url`, best-effort (a signing failure, or a client with no `.storage`, leaves `url` unset and the list still answers). `admin.html` `buildCard` renders the image only when `photo.url` starts with the Supabase origin plus `/storage/v1/` (pinned in `admin-html-syntax`); legacy Blobs records keep their `image.base64` path, both shapes live in the same merged list.
- **Erasure**: `job_photos` rows cascade from `jobs`, but deleting a `storage.objects` row by SQL orphans the bytes; only the Storage API deletes them. `deleteJobPhotos(supabase, jobId)` ships in the module with `TODO(slice5x/photos-erasure)` beside it; D-047 says job erasure (SQL by hand today) must call it.
- **Privacy notice**: already covers photos as data collected, Supabase (London) as the processor holding booking records, and the retention; no copy change is needed for this slice.

## File list

- `supabase/migrations/20260919120000_job_photos_bucket.sql` (+ inline verification queries)
- `supabase/tests/job_photos_bucket_test.sql` (pgTAP)
- `server/netlify/functions/jobPhotoStore.js` (new: `photoObjectPath`, `storeJobPhoto`, `signPhotoUrls`, `deleteJobPhotos`)
- `server/netlify/functions/chat.js` (the best-effort call before the response)
- `server/netlify/functions/bookingsStore.js` (select + mapping; the anchor retired)
- `server/netlify/functions/bookings.js` (batch signing)
- `admin.html` (`buildCard` render + guard)
- `test/job-photo-store.test.js` (unit with fakes + `[integration]` on the local stack with a negative control)
- `test/bookings-store.test.js`, `test/bookings-admin.test.js`, `test/bookings-chat.test.js`, `test/admin-html-syntax.test.js` (the shapes and pins that move)
- `DECISIONS.md` (D-047 draft), `ROADMAP.md` (Phase 2 lines), `CLAUDE.md` (the Supabase infrastructure row), `NEXT_SESSION.md` (CP-4, the pending-migration merge note), this log

## Test list

- Unit: the path derivation (ext per media type, uuid shape, job id embedded, never a client string); `storeJobPhoto` returns `{ok:false}` and never throws on a throwing/erroring storage client; upload-then-row order, and object removal when the row insert fails; the deadline branch; no-op without an image; `signPhotoUrls` batches once, tolerates a client with no `.storage`, leaves `url` unset on failure; `jobRowToAdminRecord` maps `job_photos` (first row) and omits `photo` without one; `bookings.js` attaches urls; `chat.js` booking outcome unchanged when the upload fails.
- Behavioural: the `admin.html` guard renders only a same-origin `/storage/v1/` url (static pin).
- `[integration]` (local stack, `ICC_SUPABASE_IT=1`, after `db reset`): bucket present and private; upload a small PNG, row inserted, signed URL returns the bytes; the anonymous public-object GET is refused; `deleteJobPhotos` removes object and row.
- pgTAP: bucket row, `public = false`, the limit and the four types, `storage.objects` RLS on with zero policies.

## Out of scope

Photo re-assessment history (`job_assessments`), more than one photo per booking (the chat client sends one `booking.image`), the legacy Blobs path, the field app's read of photos, the email and PDF paths (unchanged), a job-erasure endpoint or script (the function ships, the caller is a later slice).

## Checkpoint log

- (open) plan written; commits follow in the order: migration + pgTAP; module + tests; wiring; admin render; docs.
