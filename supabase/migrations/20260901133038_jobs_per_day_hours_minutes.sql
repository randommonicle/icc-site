-- D-027 (Mark, 24 August 2026) — per-day trading hours, 1pm last START, soft close.
--
-- Why. The app-layer model (shared/config/tradingHours.js + chat.js) moved to
-- per-day start windows with half-hour openings (Mon/Wed/Fri/Sat 09:30, Tue 10:30,
-- Thu 10:00) and a SOFT close: 1pm is the last time a job may START, and the finish
-- follows the job length rather than a fixed clock hour. The live jobs schema could
-- not represent that:
--   * start_hour was a whole-hour smallint, so a 09:30 booking truncated to 9:00
--     (bookingsStore.bookingToJobRow does parseInt(start_time)); and
--   * constraint jobs_trading_hours forced start_hour + slots_needed <= 16, i.e.
--     every job to finish by 16:00, which contradicts the soft close.
--
-- Backward compatibility (this is the "expand" step, safe for the CURRENTLY DEPLOYED
-- app, which still offers whole-hour starts up to 15:00):
--   * start_minute defaults to 0 for the old app's writes and for every existing row;
--   * the dropped `hours` column is not selected by the app (it recomputes occupancy
--     from start_hour/slots_needed), so dropping it breaks nothing live;
--   * the old app also enforced "finish by 16:00" in its own validateBooking, so
--     dropping the DB check introduces no bad write while the old code is live.
-- The new per-day 1pm limit is enforced in the APP, not here, precisely so this
-- migration can land before the new code deploys without breaking the old one. The
-- DB keeps only the coarse `start_hour BETWEEN 9 AND 15` backstop already on the column.
--
-- Concurrency. The double-booking guard is rebuilt on a MINUTE-precise range so it
-- matches what the app now offers; for existing whole-hour rows the guard is
-- unchanged in effect. btree_gist (used by the exclusion) is already installed.

-- Minutes: half-hour starts. Only :00 and :30 occur in the D-027 cadence.
alter table jobs
  add column start_minute smallint not null default 0
  check (start_minute in (0, 30));

-- Soft close (D-027): drop the hard "finish by 16:00" rule. slots_needed (1..7)
-- still bounds a tampered payload; the per-day 1pm last-start is enforced in the app.
alter table jobs drop constraint jobs_trading_hours;

-- Minute-precise double-booking guard. Replace the whole-hour generated range and
-- its exclusion constraint with a minute range so two half-hour-offset jobs are
-- judged correctly. Drop the constraint before the column it reads.
alter table jobs drop constraint jobs_no_double_booking;
alter table jobs drop column hours;

alter table jobs
  add column span_minutes int4range generated always as (
    int4range(
      (start_hour * 60 + start_minute),
      (start_hour * 60 + start_minute + slots_needed * 60),
      '[)'
    )
  ) stored;

alter table jobs
  add constraint jobs_no_double_booking
  exclude using gist (slot_date with =, span_minutes with &&)
  where (status in ('booked', 'in_progress'));

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'jobs'
--     and column_name in ('start_minute', 'span_minutes', 'hours')
--   order by column_name;
--   -- expected: start_minute (smallint, default 0); span_minutes (present); hours ABSENT
--
--   select conname from pg_constraint
--   where conrelid = 'public.jobs'::regclass
--     and conname in ('jobs_trading_hours', 'jobs_no_double_booking');
--   -- expected: jobs_no_double_booking present; jobs_trading_hours ABSENT
--
-- Behavioural check (exercised as pgTAP in supabase/tests/schema_test.sql): on one
-- date, a 09:30 one-hour job and a 10:30 one-hour job must BOTH insert (adjacent, no
-- overlap), while a second 09:30 one-hour job must be rejected (23P01), proving the
-- guard is minute-precise.
