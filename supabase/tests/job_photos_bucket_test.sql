-- pgTAP — the job-photos Storage bucket (migration 20260919120000, D-047). Proves the
-- bucket is real and closed: the row exists, it is private, the size limit and the four
-- media types are exactly the server's own bounds, storage.objects has RLS on with NO
-- policy of ours, and the job_photos table the paths point from still cascades from jobs.
-- The upload / signed-URL / anonymous-refusal behaviour needs the Storage API, so it lives
-- in the Node [integration] test (test/job-photo-store.test.js, ICC_SUPABASE_IT=1).
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).

begin;
select plan(9);

-- the bucket row
select is(
  (select count(*) from storage.buckets where id = 'job-photos'),
  1::bigint,
  'the job-photos bucket exists'
);
select is(
  (select public from storage.buckets where id = 'job-photos'),
  false,
  'the job-photos bucket is private (no unsigned URL for any object)'
);
select is(
  (select file_size_limit from storage.buckets where id = 'job-photos'),
  4194304::bigint,
  'the object size limit is 4 MB (validateBooking caps the base64 at about 3.4 MB decoded)'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'job-photos'),
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  'exactly the four media types validateBooking accepts'
);

-- closed by default: RLS on storage.objects, no policy of ours
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'),
  'RLS is enabled on storage.objects'
);
select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  0::bigint,
  'storage.objects has no RLS policies (service role only reaches an object)'
);

-- the table the paths point from (init migration), still shaped for this
select has_table('job_photos', 'job_photos table exists');
select col_not_null('job_photos', 'storage_path', 'storage_path is NOT NULL');
select is(
  (select confdeltype from pg_constraint
   where conrelid = 'public.job_photos'::regclass and contype = 'f' and confrelid = 'public.jobs'::regclass),
  'c',
  'job_photos.job_id cascades on job delete (the object bytes do NOT: jobPhotoStore.deleteJobPhotos)'
);

select * from finish();
rollback;
