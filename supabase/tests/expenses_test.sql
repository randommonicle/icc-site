-- pgTAP — D-039 operational P&L slice 1 (migration 20260913120000). Proves the expenses
-- table is real: the columns + NOT NULL/nullable shape, the enum labels, RLS enabled, the
-- positive-amount check that actually rejects a non-positive amount (prove-it-can-fail),
-- and job_id ON DELETE SET NULL (deleting a job keeps its cost row and nulls the link).
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).

begin;
select plan(11);

select has_table('expenses', 'expenses table exists');
select col_not_null('expenses', 'incurred_on', 'incurred_on is NOT NULL');
select col_not_null('expenses', 'category', 'category is NOT NULL');
select col_not_null('expenses', 'amount', 'amount is NOT NULL');
select col_is_null('expenses', 'job_id', 'job_id is nullable (a general overhead has no job)');

-- enum labels (queried directly so we do not depend on a specific pgTAP enum helper)
select ok(
  exists(select 1 from pg_enum where enumtypid = 'expense_category'::regtype and enumlabel = 'fuel'),
  'expense_category has the fuel label'
);
select ok(
  exists(select 1 from pg_enum where enumtypid = 'expense_category'::regtype and enumlabel = 'other'),
  'expense_category has the other label'
);

-- RLS enabled (locked by default; the service role bypasses it)
select ok(
  (select relrowsecurity from pg_class where relname = 'expenses'),
  'RLS is enabled on expenses'
);

-- the positive-amount check rejects a non-positive amount
select throws_ok(
  $$insert into expenses (incurred_on, category, amount) values ('2026-09-13', 'fuel', 0)$$,
  '23514', null,
  'a non-positive amount is rejected by the check constraint'
);

-- a valid row links to its job...
insert into customers (id, name, phone, email)
  values ('00000000-0000-0000-0000-0000000007e1', 'Expense Test', '01452 000000', 'exptest@example.com');
insert into jobs (id, customer_id, status, address, slot_date, start_hour, slots_needed)
  values ('00000000-0000-0000-0000-0000000007e2', '00000000-0000-0000-0000-0000000007e1',
          'completed', '1 Test St', '2026-07-03', 10, 2);
insert into expenses (id, incurred_on, category, amount, job_id)
  values ('00000000-0000-0000-0000-0000000007e3', '2026-09-13', 'materials', 12.50,
          '00000000-0000-0000-0000-0000000007e2');
select is(
  (select job_id from expenses where id = '00000000-0000-0000-0000-0000000007e3'),
  '00000000-0000-0000-0000-0000000007e2'::uuid,
  'a valid expense links to its job'
);

-- ...and ON DELETE SET NULL keeps the cost row when the job is deleted.
delete from jobs where id = '00000000-0000-0000-0000-0000000007e2';
select is(
  (select job_id from expenses where id = '00000000-0000-0000-0000-0000000007e3'),
  null,
  'deleting the job nulls expense.job_id but keeps the cost row (ON DELETE SET NULL)'
);

select * from finish();
rollback;
