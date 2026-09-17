-- pgTAP — D-045 operator assistant background turn (migration 20260917220000). Proves the
-- turn store is real: the table shape, the two check constraints, RLS on with NO policies
-- (an anon read of an existing row returns nothing), and the single-connection semantics
-- the background function's guard relies on — a claim matches a `queued` row exactly once
-- (the second identical statement matches zero rows), and a record matches only a
-- `running` row. The concurrent claim race needs two real connections, so it lives in the
-- Node [integration] test (test/operator-turn-store.test.js, ICC_SUPABASE_IT=1).
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).

begin;
select plan(15);

-- shape
select has_table('operator_turns', 'operator_turns table exists');
select col_not_null('operator_turns', 'user_id', 'user_id is NOT NULL');
select col_not_null('operator_turns', 'status', 'status is NOT NULL');
select col_not_null('operator_turns', 'messages', 'messages is NOT NULL');
select col_has_default('operator_turns', 'id', 'id has a default (gen_random_uuid)');

-- locked by default: RLS on, no policies, so the anon role sees no rows even when rows exist
select ok(
  (select relrowsecurity from pg_class where relname = 'operator_turns'),
  'RLS is enabled on operator_turns'
);
select is(
  (select count(*) from pg_policy where polrelid = 'public.operator_turns'::regclass),
  0::bigint,
  'operator_turns has no RLS policies (service role only)'
);
insert into operator_turns (id, user_id, status, messages)
  values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'queued', '[{"role":"user","content":"hi"}]');
set local role anon;
select is(
  (select count(*) from operator_turns),
  0::bigint,
  'anon reads zero rows from operator_turns although a row exists'
);
reset role;

-- the check constraints reject a bad status and a non-array transcript
select throws_ok(
  $$insert into operator_turns (user_id, status, messages) values ('00000000-0000-4000-8000-0000000000a1', 'bogus', '[]')$$,
  '23514', null,
  'a status outside queued/running/done/stopped/failed is rejected'
);
select throws_ok(
  $$insert into operator_turns (user_id, status, messages) values ('00000000-0000-4000-8000-0000000000a1', 'queued', '{"role":"user"}')$$,
  '23514', null,
  'a transcript that is not a JSON array is rejected'
);

-- the claim: queued -> running matches exactly once. A data-modifying CTE cannot sit in
-- a subquery, so each statement runs at the top level and its effect is read back.
update operator_turns set status = 'running', started_at = now()
  where id = '00000000-0000-4000-8000-0000000000b1' and status = 'queued';
select is(
  (select status from operator_turns where id = '00000000-0000-4000-8000-0000000000b1'),
  'running',
  'the first claim on a queued row moves it to running'
);
select isnt(
  (select started_at from operator_turns where id = '00000000-0000-4000-8000-0000000000b1'),
  null,
  'the claim stamps started_at'
);
update operator_turns set status = 'running', started_at = '2000-01-01T00:00:00Z'
  where id = '00000000-0000-4000-8000-0000000000b1' and status = 'queued';
select isnt(
  (select started_at from operator_turns where id = '00000000-0000-4000-8000-0000000000b1'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'a second claim on the same row matches zero rows (a replay or retry changes nothing)'
);

-- the record: only a running row takes a terminal state, and the first terminal state stands
update operator_turns set status = 'done', result = '{"content":[]}', finished_at = now()
  where id = '00000000-0000-4000-8000-0000000000b1' and status = 'running';
select is(
  (select status from operator_turns where id = '00000000-0000-4000-8000-0000000000b1'),
  'done',
  'a record on the running row moves it to done'
);
update operator_turns set status = 'failed', finished_at = now()
  where id = '00000000-0000-4000-8000-0000000000b1' and status = 'running';
select is(
  (select status from operator_turns where id = '00000000-0000-4000-8000-0000000000b1'),
  'done',
  'a second record on the now-terminal row matches zero rows (the first result stands)'
);

select * from finish();
rollback;
