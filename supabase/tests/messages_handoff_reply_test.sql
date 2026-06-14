-- pgTAP — Slice 5e-2 (D-020): the handoff reply columns exist and are nullable.
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).
-- Proves the 5e-2 migration is real: a handoff can carry a structured reason,
-- contact, question and a draft reply, all optional (a legacy 5a row has none of
-- them, which the admin treats as "manual only" — the safe default).

begin;
select plan(8);

select has_column('messages', 'handoff_reason',   'messages.handoff_reason exists');
select has_column('messages', 'customer_contact', 'messages.customer_contact exists');
select has_column('messages', 'handoff_question', 'messages.handoff_question exists');
select has_column('messages', 'draft_reply',      'messages.draft_reply exists');

select col_is_null('messages', 'handoff_reason',   'handoff_reason is nullable');
select col_is_null('messages', 'customer_contact', 'customer_contact is nullable');
select col_is_null('messages', 'handoff_question', 'handoff_question is nullable');
select col_is_null('messages', 'draft_reply',      'draft_reply is nullable');

select * from finish();
rollback;
