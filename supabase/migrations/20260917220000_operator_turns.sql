-- D-045 operator assistant background turn (L-042; D-045 is recorded in the docs commit of
-- the same batch). The operator turn no longer runs inside the request that admitted it:
-- POST /api/v1/operator-chat admits the turn (operator_admit, unchanged) and then stores
-- it here as `queued`, triggers the operatorTurn-background function with the row id, and
-- answers 202; the background function claims the row, runs the turn and records the
-- result; the admin page polls GET /api/v1/operator-chat?turn=<id> until it is terminal.
--
-- Why a table and not a callback: a Netlify background function returns 202 to its caller
-- before it runs and has no channel back to the browser, so the result needs a place the
-- poll can read. Why the row is the guard: the background function's URL is public, so it
-- runs a turn ONLY after a compare-and-set claim (`queued` -> `running`, filtered on id
-- AND status) matched exactly one row. A row is written only by the gated endpoint, its id
-- is a v4 uuid, and a second claim (a replay, a platform retry, a guessed id) matches zero
-- rows and spends nothing. That claim is the primary spend defence for the background
-- function; the per-IP cap and the atomic admission stay on the endpoint that creates rows.
--
-- The transcript (the operator's questions and the assistant's replies; customer names and
-- postcodes at most, the fields the privacy notice already discloses for this surface) is
-- stored for the life of the turn only: the endpoint prunes rows older than an hour on
-- every call. RLS enabled with NO policies (service role only, as init.sql:185-194
-- describes); anon/authenticated reach nothing through PostgREST.

create table operator_turns (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null,                       -- requireAdmin-verified; the poll is scoped to it
  status      text        not null check (status in ('queued', 'running', 'done', 'stopped', 'failed')),
  messages    jsonb       not null check (jsonb_typeof(messages) = 'array'),  -- the validated transcript
  result      jsonb,                                      -- { content, usage, truncated?, stopped? } once terminal
  created_at  timestamptz not null default now(),
  started_at  timestamptz,                                -- set by the claim
  finished_at timestamptz                                 -- set by the record
);
alter table operator_turns enable row level security;

-- Post-apply verification (read catalog state directly; db-migration-verification).
-- Run each query on its own after applying, expecting the noted results:
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'operator_turns' order by ordinal_position;
--   -- expected 8 rows, in order: id (uuid, NO, gen_random_uuid()), user_id (uuid, NO),
--   --   status (text, NO), messages (jsonb, NO), result (jsonb, YES),
--   --   created_at (timestamp with time zone, NO, now()), started_at (…, YES), finished_at (…, YES)
--
--   select conname, contype, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid = 'public.operator_turns'::regclass order by conname;
--   -- expected 3 rows: operator_turns_messages_check (c, CHECK ((jsonb_typeof(messages) = 'array'::text))),
--   --   operator_turns_pkey (p, PRIMARY KEY (id)),
--   --   operator_turns_status_check (c, CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'stopped'::text, 'failed'::text]))))
--
--   select relrowsecurity from pg_class where relname = 'operator_turns';
--   -- expected: t
--
--   select count(*) from pg_policy where polrelid = 'public.operator_turns'::regclass;
--   -- expected: 0   (locked by default; only the service role, which bypasses RLS, reads or writes)
--
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'operator_turns' and grantee in ('anon', 'authenticated') order by 1, 2;
--   -- expected: the platform's default grants may list anon/authenticated here; with RLS on and
--   --   no policies those grants reach no rows, which the pgTAP file proves with a real anon read.
