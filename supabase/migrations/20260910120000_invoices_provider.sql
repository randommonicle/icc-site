-- D-026 invoicing, slice 1 schema (Ben, 2026-09-10). Design: D-026 (invoicing owned
-- by the platform on Stripe Invoicing; the platform is the invoice system of record,
-- Stripe is the rail, dormant behind STRIPE_SECRET_KEY). Build note 1 (DECISIONS.md
-- :360): extend the existing (unused) `invoices` table with a provider pointer so a
-- local record maps to the Stripe invoice, and extend `invoice_status` to carry the
-- Stripe states not present today. Line-item detail stays in Stripe; the local row
-- keeps the total (amount_ex_vat), the number, the status and the pointer, so we own
-- our invoice history and are never locked out (D-026).
--
-- Safe on an empty table: `invoices` has zero rows and zero references in server/
-- today, and `provider` carries a default. RLS stays enabled with no policies
-- (the service role writes; init.sql:193), so no policy change is needed here.
--
-- Enum note: ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS. On Postgres
-- 12+ (Supabase is 15) it may run inside a transaction; the new label is only usable
-- AFTER commit, which is fine here because nothing in this migration uses it.

alter type invoice_status add value if not exists 'void';
alter type invoice_status add value if not exists 'uncollectible';

alter table invoices
  -- Which rail issued this invoice. Mirrors PAYMENT_PROVIDER on paymentProvider.js so a
  -- later Stripe->Revolut/own-PDF move is a contained swap, not a data migration (D-026).
  add column if not exists provider           text not null default 'stripe',
  -- The Stripe invoice id (in_...). Null until the draft is created on the rail.
  add column if not exists provider_invoice_id text,
  -- The human invoice number. Stripe assigns it at finalize; we store it for our record.
  add column if not exists number              text,
  -- The Stripe-hosted invoice/pay URL emailed to the customer (deliverability, D-026:363).
  add column if not exists payment_url         text;

-- Fast lookup by provider invoice id, and a guard against recording the same Stripe
-- invoice on two local rows (mirrors jobs_stripe_session_idx). Partial: the vast
-- majority of invoices in flight will carry an id, but a bare draft may not yet.
create unique index if not exists invoices_provider_invoice_idx
  on invoices (provider_invoice_id)
  where provider_invoice_id is not null;

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select enumlabel from pg_enum
--   where enumtypid = 'invoice_status'::regtype order by enumsortorder;
--   -- expected: draft, sent, paid, overdue, void, uncollectible
--
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'invoices'
--     and column_name in ('provider','provider_invoice_id','number','payment_url')
--   order by column_name;
--   -- expected: provider (text, default 'stripe'::text, NOT NULL);
--   --           number, payment_url, provider_invoice_id present and nullable.
--
--   select indexdef from pg_indexes
--   where schemaname = 'public' and indexname = 'invoices_provider_invoice_idx';
--   -- expected: a UNIQUE partial index on provider_invoice_id
--   --           WHERE (provider_invoice_id IS NOT NULL)
