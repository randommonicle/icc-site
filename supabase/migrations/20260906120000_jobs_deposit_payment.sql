-- D-004 deposit payment via Stripe (Ben, 2026-09-06). Design: D-004 (Stripe for
-- deposits, no card data stored locally) reusing the D-026 Stripe mechanism (a
-- provider adapter + a signed webhook, dormant behind STRIPE_SECRET_KEY). Slice 1
-- is the deposit pay-link: create a Stripe Checkout Session for the SERVER-derived
-- deposit (the existing jobs.deposit_ex_vat), email the hosted URL, and mark the
-- deposit paid from the signed webhook. Refunds are a later slice, so the
-- 'refunded' label is reserved now to avoid a second enum alter later.
--
-- These columns are ORTHOGONAL to job_status and confirmation_state: paying the
-- deposit neither holds nor releases the slot (the slot is held at the 'booked'
-- transition by jobs_no_double_booking, unchanged). deposit_status carries a
-- default, so this is safe whether or not the table currently holds rows.
--
-- LIVE deposit-taking is GATED on the /terms cancellation/refund terms being
-- signed off (docs/LEGAL_REVIEW_TERMS_2026-09.md, T-1/T-3) and go-live; the code
-- ships dormant behind STRIPE_SECRET_KEY until then.

create type deposit_status as enum ('unpaid', 'paid', 'refunded');

alter table jobs
  add column deposit_status              deposit_status not null default 'unpaid',
  add column deposit_paid_at             timestamptz,
  -- Stripe object ids for reconciliation and later refunds. The Checkout Session
  -- id is also the webhook idempotency key: mark-paid is a compare-and-set UPDATE
  -- (... where deposit_status = 'unpaid'), so a replayed webhook is a no-op and
  -- never double-marks (L-028: drive the claim from code, not a partial-index upsert).
  add column stripe_checkout_session_id  text,
  add column stripe_payment_intent_id    text;

-- Fast lookup by session id, and a guard against recording the same session on
-- two rows. Partial (the vast majority of jobs never have a session id).
create unique index jobs_stripe_session_idx
  on jobs (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'jobs'
--     and column_name in ('deposit_status','deposit_paid_at',
--       'stripe_checkout_session_id','stripe_payment_intent_id')
--   order by column_name;
--   -- expected: deposit_status (USER-DEFINED, default 'unpaid', NOT NULL);
--   --           the other three present and nullable.
--
--   select enumlabel from pg_enum
--   where enumtypid = 'deposit_status'::regtype order by enumsortorder;
--   -- expected: unpaid, paid, refunded
--
--   select indexdef from pg_indexes
--   where schemaname = 'public' and indexname = 'jobs_stripe_session_idx';
--   -- expected: a UNIQUE partial index on stripe_checkout_session_id
--   --           WHERE (stripe_checkout_session_id IS NOT NULL)
