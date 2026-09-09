-- Assertions for 20260907130000_register_grants_lockdown.sql.
--
-- PostgREST checks table grants before row-level security, so the grant table is
-- the outer of the two layers the design rests on. These check it says what the
-- migrations claim, rather than what Supabase's default privileges left behind.

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- 1. anon holds nothing on any register table
-- ----------------------------------------------------------------------------
do $$
declare _t text; _p text;
begin
  foreach _t in array array[
    'classic_registers','classic_register_members','classic_register_access_requests','classic_register_stores',
    'classic_register_sessions','classic_register_attendees','classic_register_feedback','classic_register_forms'
  ]
  loop
    foreach _p in array array['SELECT','INSERT','UPDATE','DELETE']
    loop
      if has_table_privilege('anon', format('public.%I', _t), _p) then
        raise exception 'FAIL 1: anon holds % on %', _p, _t;
      end if;
    end loop;
  end loop;
  raise notice 'ok  1  anon holds no privilege on any register table';
end $$;

-- ----------------------------------------------------------------------------
-- 2. authenticated holds exactly what it needs, and nothing more
-- ----------------------------------------------------------------------------
do $$
declare
  -- table, then SELECT / INSERT / UPDATE / DELETE as t or f
  _want text[][] := array[
    ['classic_registers',                't','f','t','t'],
    ['classic_register_members',         't','t','f','f'],
    ['classic_register_access_requests', 't','f','f','t'],
    ['classic_register_stores',          't','f','f','f'],
    ['classic_register_sessions',        't','f','f','f'],
    ['classic_register_attendees',       't','f','f','f'],
    ['classic_register_feedback',        't','f','f','f'],
    ['classic_register_forms',           't','f','f','f']
  ];
  _privs text[] := array['SELECT','INSERT','UPDATE','DELETE'];
  _i int;
  _j int;
  _table text;
  _held boolean;
  _expected boolean;
begin
  for _i in 1 .. array_length(_want, 1) loop
    _table := _want[_i][1];
    for _j in 1 .. 4 loop
      _held := has_table_privilege('authenticated', format('public.%I', _table), _privs[_j]);
      _expected := _want[_i][_j + 1] = 't';
      if _held <> _expected then
        raise exception 'FAIL 2: authenticated % on % is %, expected %',
          _privs[_j], _table, _held, _expected;
      end if;
    end loop;
  end loop;
  raise notice 'ok  2  authenticated holds exactly the intended privileges';
end $$;

-- ----------------------------------------------------------------------------
-- 3. The version guard is now unavoidable at the grant layer, not only at RLS
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  update public.classic_register_stores set data = '{"hacked":true}'::jsonb;
  raise exception 'FAIL 3: a member could still issue an UPDATE on classic_register_stores';
exception when insufficient_privilege then
  raise notice 'ok  3  save_classic_register() is the only way to write the blob';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. A table added later does not arrive pre-granted
-- ----------------------------------------------------------------------------
begin;
create table public.grant_default_probe (id int);

do $$
begin
  if has_table_privilege('anon', 'public.grant_default_probe', 'SELECT')
     or has_table_privilege('authenticated', 'public.grant_default_probe', 'SELECT') then
    raise exception 'FAIL 4: a newly created table was granted to a browser role by default';
  end if;
  raise notice 'ok  4  new tables start private';
end $$;
rollback;

\echo ''
\echo 'All grant assertions passed.'
