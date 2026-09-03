-- D-027 provisional bookings + email accept/decline (Ben, 2026-09-01). Design: the
-- cross-agent review REVIEW_d027-3pm-provisional_2026-09-01 and docs/D027_PROVISIONAL_PLAN.md.
--
-- Why. A job whose FINISH is after the auto-confirm line (15:00) is TAKEN and HOLDS its
-- slot, but must wait for Mark to accept or decline. That decision is a separate fact
-- from the job lifecycle (job_status), so it needs its own state; deriving it from the
-- clock would retro-restate what the customer was told at booking time (cross-agent
-- review, rounds 1-2). Mark accepts/declines from a one-click link in the notification
-- email, so each provisional job also carries a stored, single-use, hashed, expiring
-- action token.
--
-- The jobs table is empty (the 20260901133038 hours migration verified this), so these
-- columns are zero-risk to add. The slot HOLD is unchanged: a provisional job keeps
-- job_status='booked', so the existing exclusion constraint (jobs_no_double_booking)
-- holds the slot exactly as an auto-confirmed booking does. Decline sets
-- job_status='cancelled', which releases the hold.

-- The confirmation decision, ORTHOGONAL to job_status:
--   auto_confirmed     finish <= auto_confirm_by; taken outright, as bookings are today.
--   awaiting_operator  finish >  auto_confirm_by; held, pending Mark's email decision.
--   operator_confirmed Mark accepted a provisional job.
--   operator_declined  Mark declined (paired with job_status='cancelled').
create type confirmation_state as enum
  ('auto_confirmed', 'awaiting_operator', 'operator_confirmed', 'operator_declined');

alter table jobs
  add column confirmation_state confirmation_state not null default 'auto_confirmed',
  add column operator_decided_at timestamptz;

-- One-click email accept/decline capability. Store ONLY the SHA-256 hash of the token
-- (a DB leak must not yield a usable link); the plaintext lives only in Mark's email.
-- Single-use (used_at) and expiring (expires_at); the action endpoint additionally
-- requires confirmation_state='awaiting_operator' as the compare-and-set idempotency
-- guard, so a stale or replayed link changes nothing.
alter table jobs
  add column operator_action_token_hash       text,
  add column operator_action_token_expires_at timestamptz,
  add column operator_action_token_used_at    timestamptz;

-- The customer accept/decline notice is logged in the existing messages table (audit +
-- claim-then-send durability via message_status draft/sent/failed). message_kind needs
-- the two outcomes. NB: ALTER TYPE ... ADD VALUE commits the label, but it is NOT used
-- anywhere in this migration, so a single-transaction apply is safe.
alter type message_kind add value if not exists 'provisional_confirmed';
alter type message_kind add value if not exists 'provisional_declined';

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'jobs'
--     and column_name in ('confirmation_state','operator_decided_at',
--       'operator_action_token_hash','operator_action_token_expires_at','operator_action_token_used_at')
--   order by column_name;
--   -- expected: confirmation_state (USER-DEFINED, default 'auto_confirmed', NOT NULL);
--   --           the four operator_* columns present and nullable.
--
--   select enumlabel from pg_enum
--   where enumtypid = 'confirmation_state'::regtype order by enumsortorder;
--   -- expected: auto_confirmed, awaiting_operator, operator_confirmed, operator_declined
--
--   select enumlabel from pg_enum
--   where enumtypid = 'message_kind'::regtype and enumlabel like 'provisional_%'
--   order by enumlabel;
--   -- expected: provisional_confirmed, provisional_declined
