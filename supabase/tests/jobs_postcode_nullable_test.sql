-- pgTAP — Slice 5b (D-021): jobs.postcode is nullable, invariants intact.
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).
-- Proves the column change is real (a job can be stored without a postcode) AND
-- that the migration did not drop the double-booking invariant the booking write
-- relies on as a backstop. (D-021's trading-hours assertion was removed once D-027's
-- soft close, 20260901133038, intentionally dropped the jobs_trading_hours check.)

begin;
select plan(3);

-- postcode is now nullable
select col_is_null('jobs', 'postcode', 'jobs.postcode is nullable');

-- a booked job with NO postcode is allowed (best-effort resolve may yield null)
insert into customers (id, name, phone, email)
  values ('00000000-0000-0000-0000-0000000005b1', 'No Postcode', '01242 000000', 'nopostcode@example.com');
select lives_ok(
  $$insert into jobs (customer_id, status, address, slot_date, start_hour, slots_needed)
    values ('00000000-0000-0000-0000-0000000005b1', 'booked', '1 Test St', '2026-07-02', 10, 2)$$,
  'a job may be stored with a null postcode'
);

-- the double-booking guard still exists (must not have been dropped)
select ok(
  exists(select 1 from pg_constraint where conname = 'jobs_no_double_booking'),
  'jobs_no_double_booking exclusion constraint still exists'
);

select * from finish();
rollback;
