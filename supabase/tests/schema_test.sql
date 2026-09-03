-- pgTAP schema test (D-010, real Postgres, no mocks).
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).
-- Proves the core schema exists and, crucially, that the double-booking guard is
-- a real DB invariant — two overlapping non-cancelled jobs on the same date
-- cannot both exist, while cancelled jobs are exempt.
-- Also (D-027) proves the confirmation_state surface and that the double-booking
-- guard is MINUTE-precise, so half-hour starts are judged correctly.

begin;
select plan(25);

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

-- a CANCELLED job may overlap (the partial WHERE includes only booked/in_progress)
select lives_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'cancelled', '1 Test St', 'GL50 1AA', '2026-07-01', 10, 2)$$,
  'cancelled job is exempt from the guard'
);

-- an ENQUIRY may overlap a booked job: it does not hold the slot (an abandoned
-- enquiry must never block availability).
select lives_ok(
  $$insert into jobs (id, customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
    values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-000000000001', 'enquiry', '1 Test St', 'GL50 1AA', '2026-07-01', 10, 2)$$,
  'overlapping enquiry is allowed (enquiries do not hold a slot)'
);

-- but PROMOTING that enquiry to booked, over the existing booked 10..12 slot,
-- is rejected: the slot is claimed at the booked transition.
select throws_ok(
  $$update jobs set status = 'booked'
    where id = '00000000-0000-0000-0000-0000000000e9'$$,
  '23P01',
  null,
  'promoting an overlapping enquiry to booked is rejected by the guard'
);

-- ── D-027: the confirmation-state surface (provisional bookings) ──────────────
-- The operator decision is a first-class enum, orthogonal to job_status.
select has_type('confirmation_state');
select enum_has_labels(
  'confirmation_state',
  ARRAY['auto_confirmed', 'awaiting_operator', 'operator_confirmed', 'operator_declined']
);
select col_not_null('jobs', 'confirmation_state', 'jobs.confirmation_state is NOT NULL');

-- a job written without a confirmation_state defaults to auto_confirmed (the old
-- app's writes, and every on-time booking, stay confirmed outright).
insert into jobs (id, customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
  values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-05', 9, 1);
select is(
  (select confirmation_state::text from jobs where id = '00000000-0000-0000-0000-0000000000c5'),
  'auto_confirmed',
  'a job inserted without confirmation_state defaults to auto_confirmed'
);

-- the action token is stored hashed and is nullable: the plaintext lives only in
-- Mark's email, and an on-time booking carries no token at all.
select col_is_null('jobs', 'operator_action_token_hash', 'jobs.operator_action_token_hash is nullable');

-- ── D-027: minute-precise double-booking (half-hour starts) ───────────────────
-- start_minute persists the :30 openings; the guard now judges overlap in minutes,
-- not truncated whole hours (the F2-to-the-DB-layer lesson).
select col_not_null('jobs', 'start_minute', 'jobs.start_minute is NOT NULL');
select throws_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, start_minute, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-06', 9, 15, 1)$$,
  '23514',
  null,
  'start_minute outside {0,30} is rejected by the check constraint'
);

-- a 09:30 one-hour job holds [09:30,10:30)
select lives_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, start_minute, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-07', 9, 30, 1)$$,
  'a 09:30 one-hour job inserts'
);
-- a 10:30 one-hour job is adjacent, not overlapping, so both may exist
select lives_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, start_minute, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-07', 10, 30, 1)$$,
  'an adjacent 10:30 one-hour job is allowed (minute-precise, no overlap)'
);
-- a 10:00 one-hour job overlaps the 09:30 job ONLY if minutes are honoured; under
-- hour-truncation the 09:30 would sit at 9:00 and [10:00,11:00) would miss it. The
-- guard is minute-precise, so [10:00,11:00) overlaps [09:30,10:30) and is rejected.
select throws_ok(
  $$insert into jobs (customer_id, status, address, postcode, slot_date, start_hour, start_minute, slots_needed)
    values ('00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-07', 10, 0, 1)$$,
  '23P01',
  null,
  'a 10:00 job overlaps the 09:30 job; minutes are honoured, not truncated to the hour'
);

-- ── D-027 strict single-winner notice: message_status 'sending' + partial index ──
-- (migration 20260903120000). One provisional-notice row per (job, kind) is enforced, so
-- the customer is emailed at most once; the app claims the row before sending.
select ok(
  'sending' = any(enum_range(null::message_status)::text[]),
  'message_status includes the sending claim state'
);

insert into jobs (id, customer_id, status, address, postcode, slot_date, start_hour, slots_needed)
  values ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-000000000001', 'booked', '1 Test St', 'GL50 1AA', '2026-07-08', 9, 1);

select lives_ok(
  $$insert into messages (customer_id, job_id, kind, channel, status, body)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0', 'provisional_confirmed', 'email', 'sent', 'ok')$$,
  'a provisional notice row inserts'
);
-- a SECOND provisional_confirmed row for the same job is rejected by the partial unique
-- index (the strict single winner), regardless of the row's status
select throws_ok(
  $$insert into messages (customer_id, job_id, kind, channel, status, body)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0', 'provisional_confirmed', 'email', 'sending', 'again')$$,
  '23505',
  null,
  'a second provisional_confirmed row for the same job is rejected'
);
-- a provisional_declined row for the same job is allowed (the index keys on kind too)
select lives_ok(
  $$insert into messages (customer_id, job_id, kind, channel, status, body)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0', 'provisional_declined', 'email', 'sent', 'ok')$$,
  'a different provisional kind for the same job is allowed'
);
-- a non-provisional message on the same job is outside the partial predicate, so unaffected
select lives_ok(
  $$insert into messages (customer_id, job_id, kind, channel, status, body)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0', 'review_request', 'email', 'draft', 'ok')$$,
  'a non-provisional message on the same job is unaffected by the partial index'
);

select * from finish();
rollback;
