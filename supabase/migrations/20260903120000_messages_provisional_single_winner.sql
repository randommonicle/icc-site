-- D-027 strict single-winner customer notice (Ben, 2026-09-03). Design: the flagged
-- Gemini findings 1+2 in docs/D027_PROVISIONAL_PLAN.md, built after Ben chose the strict
-- fix over the low-harm default.
--
-- Why. notifyCustomerOutcome (bookingDecision.js) sent the customer their accept/decline
-- notice and THEN logged a messages row (send-then-log). The decision CAS already makes
-- the INITIAL notice single, but the admin retry_customer_notice path used read-then-send
-- (hasSentProvisionalNotice), which loses the race: two concurrent retries, or a retry
-- racing an initial send that crashed after sending but before logging, can email the
-- customer twice. This makes the notice a strict single-winner: at most one messages row
-- per (job_id, kind) for a provisional notice, claimed via a 'sending' state before the
-- send, so exactly one sender proceeds.
--
-- Two objects:
--   * message_status gains 'sending' (the claim state, sitting between draft/failed and
--     the terminal sent/failed).
--   * a PARTIAL unique index on (job_id, kind) for the two provisional kinds enforces one
--     notice row per (job, kind). It is partial so reviewRequest's email/sms rows (a job
--     may legitimately have several over its life) are untouched. The jobs/messages tables
--     carry no provisional rows yet (feature undeployed), so there is nothing to violate.
--
-- The claim is done in JS (bookingDecision.js), NOT via ON CONFLICT: PostgREST/supabase-js
-- upsert emits ON CONFLICT (job_id,kind) with no predicate, which Postgres will not match
-- to a PARTIAL index. So the app claims with a reclaim-UPDATE-then-INSERT against this
-- index; a 15-minute stale-'sending' reclaim frees a claim whose function died mid-send,
-- so a dead claim can never permanently strand a customer notice.
--
-- 'sending' is used only at runtime, never in this migration's DDL, so a single-transaction
-- apply is safe (same as the message_kind adds in 20260901200000).

alter type message_status add value if not exists 'sending';

create unique index if not exists messages_provisional_notice_uniq
  on messages (job_id, kind)
  where kind in ('provisional_confirmed', 'provisional_declined');

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select enumlabel from pg_enum
--   where enumtypid = 'message_status'::regtype order by enumsortorder;
--   -- expected: draft, approved, sent, failed, suppressed, sending
--
--   select indexdef from pg_indexes
--   where schemaname = 'public' and indexname = 'messages_provisional_notice_uniq';
--   -- expected: a UNIQUE index on messages (job_id, kind)
--   --           WHERE (kind = ANY (ARRAY['provisional_confirmed'::message_kind, 'provisional_declined'::message_kind]))
--
-- Behavioural check (exercised as pgTAP in supabase/tests/schema_test.sql): two
-- provisional_confirmed rows for one job cannot both exist (23505 unique_violation), while
-- a same-job row of a non-provisional kind is allowed.
