-- pgTAP — Slice 4e (D-020): the human_handoff message kind + customer-optional rule.
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).
-- Proves the schema change is real: a lead handoff can be stored with no customer,
-- while every other (outbound) message kind still requires one.

begin;
select plan(4);

-- the new enum value exists
select ok(
  'human_handoff' = any(enum_range(null::message_kind)::text[]),
  'message_kind has human_handoff'
);

-- customer_id is now nullable
select col_is_null('messages', 'customer_id', 'messages.customer_id is nullable');

-- a human_handoff with no customer is allowed (a lead with no customer row yet)
select lives_ok(
  $$insert into messages (kind, body) values ('human_handoff', 'Question from a lead')$$,
  'human_handoff may have a null customer_id'
);

-- a non-handoff with no customer violates the check (23514 check_violation)
select throws_ok(
  $$insert into messages (kind, body) values ('review_request', 'hi')$$,
  '23514',
  null,
  'a non-handoff message still requires a customer_id'
);

select * from finish();
rollback;
