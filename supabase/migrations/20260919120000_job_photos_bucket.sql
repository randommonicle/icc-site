-- Job photos into Supabase Storage (TODO(slice5x/photos), resolved; D-047 is recorded in
-- the docs commit of the same batch). The job_photos table has waited since the init
-- migration (June 2026) for a bucket: a Postgres-mode booking's photo reached Mark only by
-- email and in the PDF job card, and the admin card said "No photo uploaded" for every live
-- booking. This creates the bucket the table's storage_path points into.
--
-- Private on purpose: `public = false` means no object has a URL without a signature, and
-- storage.objects keeps Supabase's default RLS (enabled, no policies), so only the service
-- role, from the functions, can write an object or mint a signed URL; the admin page never
-- sees a durable URL, only a one-hour signed one from bookings.js. The object path is
-- derived server-side (jobs/<job_id>/photo-<uuid>.<ext>, jobPhotoStore.js), never from the
-- client. The size limit is the server's own bound (validateBooking caps the base64 at
-- 4.5M characters, about 3.4 MB decoded) and the allowed types are exactly the four
-- validateBooking accepts, so the bucket refuses what the function would never send.
--
-- Idempotent AND corrective: on conflict the row is brought to exactly these values, so a
-- bucket of this name made by hand first (public, or with wider limits) is closed by the
-- migration rather than preserved by it (cross-agent review, GPT, 19 Sept 2026: "do nothing"
-- would have kept a misconfigured pre-existing bucket on hosted).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  false,
  4194304,                                                    -- 4 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run each query on its own after applying, expecting the noted results:
--
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'job-photos';
--   -- one row: job-photos | f | 4194304 | {image/jpeg,image/png,image/webp,image/gif}
--
--   select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'storage' and c.relname = 'objects';
--   -- t  (Supabase's default; this migration adds no policy, so nothing but the service role reaches an object)
--
--   select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects';
--   -- 0  (no policy of ours; if a later slice adds one it must name a role and a bucket)
--
--   select count(*) from storage.objects where bucket_id = 'job-photos';
--   -- 0 on hosted at apply time (objects arrive only from confirm_booking)
