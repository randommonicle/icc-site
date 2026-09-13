-- D-039 operational P&L, slice 1 schema (Ben ratified D-039 2026-09-11; built 2026-09-13).
-- Design: D-039 — a LIGHT operational P&L lives in-platform (revenue the platform already
-- owns minus a simple expense log Mark keeps); operational visibility, NOT formal MTD
-- accounting. This is the expense-log half: a table Mark writes cost rows into, so the P&L
-- endpoint can compute revenue - expenses for a period. Revenue stays server-derived from
-- receipts (deposits + paid invoices, D-041); this table holds only costs.
--
-- expense_category groups costs for the P&L breakdown. RLS enabled with NO policies
-- (locked by default; the service role writes after requireAdmin, init.sql:185-194).
-- amount numeric(10,2) with a positive check (like invoices.amount_ex_vat); no VAT (D-024).
-- job_id is OPTIONAL (a general overhead has no job) and ON DELETE SET NULL, so deleting a
-- job never deletes its cost history. updated_at maintained by the shared set_updated_at().

create type expense_category as enum ('fuel', 'materials', 'equipment', 'insurance', 'software', 'other');

create table expenses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  incurred_on date not null,
  category    expense_category not null,
  description text,
  amount      numeric(10,2) not null check (amount > 0),
  job_id      uuid references jobs(id) on delete set null,
  notes       text
);
create index expenses_incurred_on_idx on expenses (incurred_on);
create index expenses_category_idx    on expenses (category);
create index expenses_job_idx         on expenses (job_id);
create trigger trg_expenses_updated_at before update on expenses
  for each row execute function set_updated_at();

alter table expenses enable row level security;

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select enumlabel from pg_enum
--   where enumtypid = 'expense_category'::regtype order by enumsortorder;
--   -- expected: fuel, materials, equipment, insurance, software, other
--
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'expenses' order by ordinal_position;
--   -- expected: id, created_at, updated_at, incurred_on (date, NOT NULL),
--   --           category (USER-DEFINED, NOT NULL), description (nullable),
--   --           amount (numeric, NOT NULL), job_id (uuid, nullable), notes (nullable)
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.expenses'::regclass and contype = 'c';
--   -- expected: CHECK ((amount > 0))
--
--   select relrowsecurity from pg_class where relname = 'expenses';
--   -- expected: t (RLS enabled)
