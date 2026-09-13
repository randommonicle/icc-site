-- pgTAP — D-040 operator assistant, Beta 4 slice 2 (migration 20260913180000). Proves the
-- operator turn budget is real: the table shape + RLS, the operator_admit function and its
-- privilege boundary (anon/authenticated CANNOT call it, service_role can), and the
-- admission semantics — a definite true up to the limit, a definite false past it, false
-- for a limit below 1 with no row written, the count check, and pruning of stale windows.
-- The concurrent last-slot race needs two real connections, so it lives in the Node
-- [integration] test (test/operator-admission.test.js, ICC_SUPABASE_IT=1); this file pins
-- the single-connection semantics the race relies on.
-- Run with: supabase test db   (needs the local stack: supabase start -> Docker).

begin;
select plan(19);

-- shape
select has_table('operator_rate', 'operator_rate table exists');
select col_not_null('operator_rate', 'user_id', 'user_id is NOT NULL');
select col_not_null('operator_rate', 'window_start', 'window_start is NOT NULL');
select col_not_null('operator_rate', 'count', 'count is NOT NULL');
select ok(
  (select relrowsecurity from pg_class where relname = 'operator_rate'),
  'RLS is enabled on operator_rate'
);

-- the function and its privilege boundary
select has_function('operator_admit', array['uuid', 'integer'], 'operator_admit(uuid, integer) exists');
select ok(
  not has_function_privilege('anon', 'operator_admit(uuid, integer)', 'execute'),
  'anon cannot execute operator_admit (the public API key cannot burn the budget)'
);
select ok(
  not has_function_privilege('authenticated', 'operator_admit(uuid, integer)', 'execute'),
  'authenticated cannot execute operator_admit'
);
select ok(
  has_function_privilege('service_role', 'operator_admit(uuid, integer)', 'execute'),
  'service_role can execute operator_admit (the endpoint, after requireAdmin)'
);

-- admission semantics, limit 2: true, true, then a DEFINITE false
select is(operator_admit('00000000-0000-0000-0000-0000000000a1', 2), true,  'limit 2: first turn admitted');
select is(operator_admit('00000000-0000-0000-0000-0000000000a1', 2), true,  'limit 2: second turn admitted');
select is(operator_admit('00000000-0000-0000-0000-0000000000a1', 2), false, 'limit 2: third turn refused with false, not NULL');
select is(
  (select count from operator_rate where user_id = '00000000-0000-0000-0000-0000000000a1' and window_start = date_trunc('hour', now())),
  2,
  'the refused turn did not increment the counter'
);

-- another operator is independent
select is(operator_admit('00000000-0000-0000-0000-0000000000a2', 2), true, 'a different user id has its own counter');

-- limit below 1: refused, and no row is written
select is(operator_admit('00000000-0000-0000-0000-0000000000a3', 0), false, 'limit 0 is refused');
select is(
  (select count(*) from operator_rate where user_id = '00000000-0000-0000-0000-0000000000a3'),
  0::bigint,
  'limit 0 writes no row'
);

-- the count check rejects a negative value
select throws_ok(
  $$insert into operator_rate (user_id, window_start, count) values ('00000000-0000-0000-0000-0000000000a4', now(), -1)$$,
  '23514', null,
  'a negative count is rejected by the check constraint'
);

-- stale windows are pruned on the next call
insert into operator_rate (user_id, window_start, count)
  values ('00000000-0000-0000-0000-0000000000a5', now() - interval '3 days', 7);
select is(operator_admit('00000000-0000-0000-0000-0000000000a6', 5), true, 'a fresh user is admitted (this call also runs the prune)');
select is(
  (select count(*) from operator_rate where user_id = '00000000-0000-0000-0000-0000000000a5'),
  0::bigint,
  'a window older than two days is pruned by the next admission call'
);

select * from finish();
rollback;
