-- Assertions for 20260907100000_seed_first_register.sql.
--
-- Run against a database that has had stubs, the baseline, seed-fixture.sql, the
-- tenancy migration and the seed migration (twice, to prove it is idempotent)
-- applied. See scripts/verify-register-schema.sh.

\set ON_ERROR_STOP on
\timing off

\set OPERATOR '11111111-0000-4000-8000-0000000000aa'
\set OUTSIDER '11111111-0000-4000-8000-0000000000bb'

-- ----------------------------------------------------------------------------
-- 1. The operator is a TraineeHQ super_admin
-- ----------------------------------------------------------------------------
do $$
begin
  if not public.has_role('11111111-0000-4000-8000-0000000000aa', 'super_admin') then
    raise exception 'FAIL 1: the operator was not made a super_admin';
  end if;
  raise notice 'ok  1  operator is a TraineeHQ super_admin';
end $$;

-- ----------------------------------------------------------------------------
-- 2. Exactly one register, on the ENT specialty, named as create_register would
-- ----------------------------------------------------------------------------
do $$
declare _r record;
begin
  if (select count(*) from public.registers) <> 1 then
    raise exception 'FAIL 2: expected exactly one register, found %',
      (select count(*) from public.registers);
  end if;

  select * into _r from public.registers;

  if _r.specialty_id <> '50000000-0000-4000-8000-0000000000aa' then
    raise exception 'FAIL 2: the register was not attached to the ENT specialty';
  end if;

  if _r.slug <> 'mersey-ent' then
    raise exception 'FAIL 2: unexpected slug %', _r.slug;
  end if;

  if _r.name <> 'Mersey · Otolaryngology' then
    raise exception 'FAIL 2: unexpected name %', _r.name;
  end if;

  raise notice 'ok  2  one register, on ENT, named like an app-created one';
end $$;

-- ----------------------------------------------------------------------------
-- 3. The operator owns it, and is its only member
-- ----------------------------------------------------------------------------
do $$
declare _rid uuid := (select id from public.registers);
begin
  if not public.is_register_owner('11111111-0000-4000-8000-0000000000aa', _rid) then
    raise exception 'FAIL 3: the operator does not own the register';
  end if;

  if (select count(*) from public.register_members where register_id = _rid) <> 1 then
    raise exception 'FAIL 3: the register has members other than the operator';
  end if;

  raise notice 'ok  3  operator is the sole owner';
end $$;

-- ----------------------------------------------------------------------------
-- 4. The legacy blob was imported intact
-- ----------------------------------------------------------------------------
do $$
declare _data jsonb := (select data from public.register_stores);
begin
  if _data is null then
    raise exception 'FAIL 4: no register_stores row was created';
  end if;

  if jsonb_array_length(_data -> 'trainees') <> 3 then
    raise exception 'FAIL 4: expected 3 trainees, got %',
      jsonb_array_length(_data -> 'trainees');
  end if;

  if jsonb_array_length(_data -> 'sessions') <> 2 then
    raise exception 'FAIL 4: expected 2 sessions, got %',
      jsonb_array_length(_data -> 'sessions');
  end if;

  if _data <> (select data from public.register_store where id = 'default') then
    raise exception 'FAIL 4: the imported blob differs from the legacy one';
  end if;

  raise notice 'ok  4  legacy blob imported intact';
end $$;

-- ----------------------------------------------------------------------------
-- 5. The legacy table is left alone — Stage 10 drops it, not this
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.register_store') is null then
    raise exception 'FAIL 5: the legacy register_store table was removed';
  end if;
  raise notice 'ok  5  legacy register_store left in place';
end $$;

-- ----------------------------------------------------------------------------
-- 6. Re-running changed nothing (the migration ran twice before this file)
-- ----------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.registers) <> 1 then
    raise exception 'FAIL 6: a second run created another register';
  end if;
  if (select count(*) from public.register_members) <> 1 then
    raise exception 'FAIL 6: a second run duplicated the membership';
  end if;
  if (select count(*) from public.user_roles
       where user_id = '11111111-0000-4000-8000-0000000000aa' and role = 'super_admin') <> 1 then
    raise exception 'FAIL 6: a second run duplicated the super_admin role';
  end if;
  raise notice 'ok  6  re-running the migration is a no-op';
end $$;

-- ----------------------------------------------------------------------------
-- 7. A second run does NOT roll a live register back to the import.
--    Simulated by advancing the blob, then re-running the migration below.
-- ----------------------------------------------------------------------------
update public.register_stores
   set data = jsonb_build_object('trainees', jsonb_build_array(), 'sessions', jsonb_build_array()),
       version = version + 1;

\ir ../../migrations/20260907100000_seed_first_register.sql

do $$
begin
  if jsonb_array_length((select data -> 'trainees' from public.register_stores)) <> 0 then
    raise exception 'FAIL 7: re-running overwrote live register data with the import';
  end if;
  raise notice 'ok  7  a populated register is not overwritten by a re-run';
end $$;

-- ----------------------------------------------------------------------------
-- 8. The operator can read the register through RLS; nobody else can.
--    super_admin is not what grants it — the membership row is (assertion 3).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-0000000000aa';
do $$
begin
  if (select count(*) from public.register_stores) <> 1 then
    raise exception 'FAIL 8: the owner cannot read their own register';
  end if;
  raise notice 'ok  8  owner can read the register';
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-0000000000bb';
do $$
begin
  if (select count(*) from public.register_stores) <> 0 then
    raise exception 'FAIL 8b: another account can read the register';
  end if;
  raise notice 'ok  8b nobody else can read the register';
end $$;
commit;

\echo ''
\echo 'All seed assertions passed.'
