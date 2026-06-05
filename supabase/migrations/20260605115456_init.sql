-- ICC Platform — Phase 2, Slice 2 — initial operational schema (D-002).
--
-- Normalises the Phase 0 flat booking record (Netlify Blobs) into a relational
-- model: customers, jobs, job_photos, job_assessments, invoices, messages.
-- Nothing live reads this yet — Blobs stays the live store until the Slice 5
-- migration + cutover. Local-first (D-009): applied to a local Postgres via
-- `supabase db reset`; pushed to Mark's hosted project when it exists.
--
-- Design notes:
--   * Business hours 09:00 to 16:30. Whole-hour slots: a job starts on the hour
--     (09:00 to 15:00) and ends by 16:00, so the 16:00 to 16:30 half-hour is not
--     bookable in this model (flagged: revisit if half-hour slots are wanted).
--     Availability is DERIVED from jobs (bookable hour-blocks minus COMMITTED
--     jobs.hours on a date), no second availability table to drift.
--   * Double-booking is a DB INVARIANT via a btree_gist exclusion constraint,
--     not an app-level read-modify-write check (which raced in Phase 0).
--   * Marketing-consent columns on customers are RECORD-ONLY now (D-008/Phase 4).
--   * The D-011 out-of-area surcharge/boundary is enforced server-side in Slice 3
--     (the validateBooking successor), reading shared/config/serviceArea.js.
--   * RLS is enabled on every table with NO policies yet: the public booking path
--     never touches Postgres with the anon key — the server uses the service role
--     (which bypasses RLS) after validation. Mark's admin policies arrive in
--     Slice 3 with Supabase Auth.

-- Extensions ----------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- exclusion constraint over (=, &&)

-- Enums ---------------------------------------------------------------------
create type job_status     as enum ('enquiry','booked','in_progress','completed','cancelled');
create type invoice_status as enum ('draft','sent','paid','overdue');
create type clean_method   as enum ('texatherm_low_moisture','wet_extraction','combination');
create type message_kind   as enum ('booking_confirmation','review_request','invoice_chase','reengagement');
create type message_status as enum ('draft','approved','sent','failed','suppressed');

-- updated_at touch trigger --------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- customers -----------------------------------------------------------------
-- Marketing-consent columns are recorded but NOT acted on until Phase 4 (D-008).
create table customers (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  name              text not null,
  phone             text not null,
  email             text not null,
  marketing_consent boolean not null default false,
  consent_source    text,                       -- e.g. 'booking_2026-06-05'
  consent_at        timestamptz,
  unsubscribed_at   timestamptz,
  notes             text
);
create unique index customers_email_idx on customers (email);  -- one row per customer (repeat-booking dedupe)
create index customers_phone_idx on customers (phone);
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

-- jobs ----------------------------------------------------------------------
-- One row per booking. `hours` is a generated half-open range of booked
-- hour-slots; the exclusion constraint forbids two COMMITTED jobs (booked or
-- in_progress) from overlapping on the same date, the concurrency-safe
-- double-booking guard. Enquiries do not hold a slot (see the constraint).
create table jobs (
  id                           uuid primary key default gen_random_uuid(),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  customer_id                  uuid not null references customers(id) on delete restrict,
  status                       job_status not null default 'enquiry',
  address                      text not null,
  postcode                     text not null,
  out_of_area                  boolean not null default false,    -- set server-side (Slice 3)
  slot_date                    date not null,
  start_hour                   smallint not null check (start_hour between 9 and 15),
  slots_needed                 smallint not null check (slots_needed between 1 and 7),
  rooms                        text,
  carpet_types                 text,
  concerns                     text,
  furniture_moving             boolean not null default false,
  pets                         boolean not null default false,
  recommended_method           clean_method,
  ai_assessment                text,
  rams                         text,
  estimated_price_ex_vat       numeric(10,2),
  out_of_area_surcharge_ex_vat numeric(10,2) not null default 0,  -- D-011 £15 when applicable
  deposit_ex_vat               numeric(10,2),
  price_display                text,                               -- "£475 + VAT" as quoted, verbatim
  notes                        text,
  cal_link                     text,
  legacy_blob_id               text,                               -- Phase-0 Blobs id (Slice 5 trace)
  hours int4range generated always as
    (int4range(start_hour::int, (start_hour + slots_needed)::int, '[)')) stored,
  constraint jobs_trading_hours check (start_hour + slots_needed <= 16),  -- jobs end by 16:00 (09:00-16:30 day)
  constraint jobs_no_double_booking
    -- Only COMMITTED jobs hold a slot. An enquiry does not (an abandoned enquiry
    -- must never block availability); the slot is claimed at the 'booked' transition.
    exclude using gist (slot_date with =, hours with &&) where (status in ('booked','in_progress'))
);
create index jobs_status_idx    on jobs (status);
create index jobs_slot_date_idx on jobs (slot_date);
create index jobs_customer_idx  on jobs (customer_id);
create trigger trg_jobs_updated_at before update on jobs
  for each row execute function set_updated_at();

-- job_photos ----------------------------------------------------------------
-- Bytes live in Supabase Storage (bucket created in Slice 3); the row holds the
-- storage PATH, never base64 (the deliberate fix to Phase 0's inline base64).
create table job_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  storage_path text not null,
  media_type   text not null,
  created_at   timestamptz not null default now()
);
create index job_photos_job_idx on job_photos (job_id);

-- job_assessments -----------------------------------------------------------
-- History for "persist & re-run the photo assessment": each AI assessment of a
-- job (at booking, or an admin re-run) is appended here; the latest also lives
-- on jobs.ai_assessment for convenience.
create table job_assessments (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references jobs(id) on delete cascade,
  created_at         timestamptz not null default now(),
  model              text not null,        -- from shared/config/models
  source             text not null check (source in ('booking','admin_rerun')),
  assessment         text not null,
  recommended_method clean_method
);
create index job_assessments_job_idx on job_assessments (job_id);

-- invoices ------------------------------------------------------------------
-- Raised against a COMPLETED job. Amounts ex-VAT for arithmetic.
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete restrict,
  status        invoice_status not null default 'draft',
  amount_ex_vat numeric(10,2) not null check (amount_ex_vat > 0),
  issued_at     timestamptz,
  due_at        timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index invoices_status_idx on invoices (status);
create index invoices_job_idx    on invoices (job_id);
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

-- messages ------------------------------------------------------------------
-- Every AI-drafted / sent customer comm flows through here: draft -> approved
-- -> sent (Mark approves before send). review_request + invoice_chase are
-- TRANSACTIONAL (no consent gate); reengagement is MARKETING (requires_consent;
-- honour customers.unsubscribed_at — D-008).
create table messages (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  customer_id      uuid not null references customers(id) on delete cascade,
  job_id           uuid references jobs(id) on delete set null,
  invoice_id       uuid references invoices(id) on delete set null,
  kind             message_kind not null,
  channel          text not null default 'email',
  status           message_status not null default 'draft',
  ai_drafted       boolean not null default false,
  requires_consent boolean not null default false,   -- true only for reengagement
  subject          text,
  body             text,
  approved_at      timestamptz,
  sent_at          timestamptz,
  constraint messages_sent_has_body check (status <> 'sent' or body is not null)
);
create index messages_customer_idx on messages (customer_id);
create index messages_status_idx   on messages (status);
create index messages_kind_idx     on messages (kind);
create trigger trg_messages_updated_at before update on messages
  for each row execute function set_updated_at();

-- Row Level Security --------------------------------------------------------
-- Enabled with NO policies: locked by default. The server uses the service role
-- (bypasses RLS) after validation; Mark's authenticated-admin policies arrive in
-- Slice 3 with Supabase Auth. The anon key never reaches these tables.
alter table customers       enable row level security;
alter table jobs            enable row level security;
alter table job_photos      enable row level security;
alter table job_assessments enable row level security;
alter table invoices        enable row level security;
alter table messages        enable row level security;
