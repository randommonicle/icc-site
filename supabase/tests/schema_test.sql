-- pgTAP schema test (D-010, real Postgres, no mocks).
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).
-- Proves the core schema exists and, crucially, that the double-booking guard is
-- a real DB invariant — two overlapping non-cancelled jobs on the same date
-- cannot both exist, while cancelled jobs are exempt.

begin;
select plan(8);

-- enums + core tables exist
select has_type('job_status');
select has_type('invoice_status');
select has_table('customers');
select has_table('jobs');
select has_table('messages');

-- seed one customer
insert into customers (id, name, phone, email)
  values ('00000000-0000-0000-0000-000000000001', 'Test Customer', '01242 000000', 'test@example.com');

-- a booked job occupying hours [10,12) on 2026-07-01
insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
  values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-01', 10, 2);

-- an OVERLAPPING non-cancelled job (11..13) must violate the exclusion
-- constraint (SQLSTATE 23P01 exclusion_violation) — the double-booking guard.
select throws_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-01', 11, 2)$$,
  '23P01',
  null,
  'overlapping non-cancelled job is rejected'
);

-- a NON-overlapping job (12..14) on the same date is fine
select lives_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-01', 12, 2)$$,
  'adjacent non-overlapping job is allowed'
);

-- a CANCELLED job may overlap (the partial WHERE excludes cancelled rows)
select lives_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'cancelled', '1 Test St', 'GL50 1AA', '2026-07-01', 10, 2)$$,
  'cancelled job is exempt from the guard'
);

select * from finish();
rollback;
