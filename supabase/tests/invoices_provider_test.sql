-- pgTAP — D-026 invoicing slice 1 (migration 20260910120000). Proves the invoices
-- provider extension is real: the four new columns with provider's NOT NULL default,
-- the two new invoice_status labels, and the provider-invoice-id unique guard actually
-- rejects a duplicate (prove-it-can-fail: a version that dropped the index fails here).
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).

begin;
select plan(9);

-- New columns + provider's default
select col_not_null('invoices', 'provider', 'invoices.provider is NOT NULL');
select col_default_is('invoices', 'provider', 'stripe', 'invoices.provider defaults to stripe');
select has_column('invoices', 'provider_invoice_id', 'invoices.provider_invoice_id exists');
select has_column('invoices', 'number', 'invoices.number exists');
select has_column('invoices', 'payment_url', 'invoices.payment_url exists');

-- New enum labels (queried directly so we do not depend on a specific pgTAP enum helper)
select ok(
  exists(select 1 from pg_enum where enumtypid = 'invoice_status'::regtype and enumlabel = 'void'),
  'invoice_status has the void label'
);
select ok(
  exists(select 1 from pg_enum where enumtypid = 'invoice_status'::regtype and enumlabel = 'uncollectible'),
  'invoice_status has the uncollectible label'
);

-- The unique guard exists...
select has_index('invoices', 'invoices_provider_invoice_idx', 'provider-invoice-id unique index exists');

-- ...and it actually rejects a second row carrying the same Stripe invoice id.
insert into customers (id, name, phone, email)
  values ('00000000-0000-0000-0000-0000000006c1', 'Invoice Test', '01452 000000', 'invtest@example.com');
insert into jobs (id, customer_id, status, address, slot_date, start_hour, slots_needed)
  values ('00000000-0000-0000-0000-0000000006c2', '00000000-0000-0000-0000-0000000006c1',
          'completed', '1 Test St', '2026-07-03', 10, 2);
insert into invoices (job_id, amount_ex_vat, provider_invoice_id)
  values ('00000000-0000-0000-0000-0000000006c2', 90.00, 'in_testdup');
select throws_ok(
  $$insert into invoices (job_id, amount_ex_vat, provider_invoice_id)
    values ('00000000-0000-0000-0000-0000000006c2', 45.00, 'in_testdup')$$,
  '23505', null,
  'a duplicate provider_invoice_id is rejected by the unique index'
);

select * from finish();
rollback;
