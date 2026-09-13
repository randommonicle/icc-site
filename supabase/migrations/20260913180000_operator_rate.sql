-- D-040 operator assistant, Beta 4 slice 2 (converged design 2026-09-13, D-040 addendum).
-- The per-operator turn budget is a Postgres ATOMIC counter, not a per-IP Blobs list.
-- Rationale: module-level counters serialise nothing across Netlify's independent Lambda
-- instances, and the Blobs limiter (rateLimit.js) is a non-atomic get/set with no
-- compare-and-set, so two concurrent turns could both pass a "count < limit" read. Here
-- admission is ONE statement (INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit):
-- the conflict row lock serialises racing callers and exactly one wins the last slot.
--
-- Keyed on the requireAdmin-verified auth user id (never a body field). Hourly fixed
-- window (date_trunc('hour', now())); rows older than two days are pruned on each call so
-- the table never grows past a few dozen rows per operator. RLS enabled with NO policies
-- (service role only, as init.sql:185-194 describes). EXECUTE on operator_admit is
-- REVOKED from anon/authenticated so the public API key cannot burn Mark's budget through
-- PostgREST; only service_role (the endpoint, after requireAdmin) may call it.

create table operator_rate (
  user_id      uuid        not null,
  window_start timestamptz not null,
  count        integer     not null check (count >= 0),
  primary key (user_id, window_start)
);
alter table operator_rate enable row level security;

-- Returns a DEFINITE boolean: true = admitted (the counter was incremented), false = over
-- the limit, or limit < 1 (nothing changed). The endpoint treats anything else (an error,
-- NULL, a non-boolean) as "store unavailable" and fails closed, so 429 and 503 stay
-- distinguishable.
create function operator_admit(p_user_id uuid, p_limit integer)
returns boolean
language sql
as $$
  delete from operator_rate where window_start < now() - interval '2 days';
  with ins as (
    insert into operator_rate (user_id, window_start, count)
    select p_user_id, date_trunc('hour', now()), 1
    where p_limit >= 1
    on conflict (user_id, window_start) do update
      set count = operator_rate.count + 1
      where operator_rate.count < p_limit
    returning true as admitted
  )
  select coalesce((select admitted from ins), false);
$$;

revoke execute on function operator_admit(uuid, integer) from public, anon, authenticated;
grant  execute on function operator_admit(uuid, integer) to service_role;

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run after applying, expecting the noted results:
--
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'operator_rate' order by ordinal_position;
--   -- expected: user_id (uuid, NO), window_start (timestamp with time zone, NO), count (integer, NO)
--
--   select relrowsecurity from pg_class where relname = 'operator_rate';
--   -- expected: t
--
--   select has_function_privilege('anon', 'operator_admit(uuid, integer)', 'execute'),
--          has_function_privilege('authenticated', 'operator_admit(uuid, integer)', 'execute'),
--          has_function_privilege('service_role', 'operator_admit(uuid, integer)', 'execute');
--   -- expected: f, f, t
--
--   select operator_admit('00000000-0000-0000-0000-000000000001', 1),
--          operator_admit('00000000-0000-0000-0000-000000000001', 1);
--   -- expected: t, f   (then: delete from operator_rate where user_id = '00000000-0000-0000-0000-000000000001';)
