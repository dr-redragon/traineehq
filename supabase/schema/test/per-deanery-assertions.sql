-- Assertions for 20260907150000_registers_per_deanery.sql.
--
-- The point: the same specialty can hold a register in more than one deanery.
-- Before this, `registers` was unique on specialty_id alone, so ENT could have
-- exactly one register in existence — which on real data (every specialty owned
-- by one deanery) meant no other deanery could open one at all.
--
-- Runs at the end of scenario A. 'mersey-ent' and 'mersey-urology' exist.

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- 1. Existing registers kept the deanery their specialty implied
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.registers where deanery_id is null) then
    raise exception 'FAIL 1: a register has no deanery after the backfill';
  end if;

  if (select r.deanery_id from public.registers r where r.slug = 'mersey-ent')
     <> 'd0000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL 1: mersey-ent was not backfilled to Mersey';
  end if;
  raise notice 'ok  1  existing registers kept their deanery';
end $$;

-- ----------------------------------------------------------------------------
-- 2. The same specialty can now hold a register in a second deanery
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';   -- super_admin: every deanery

do $$
declare _id uuid;
begin
  -- Mersey ENT already exists. Wessex should be able to open its own.
  _id := public.create_register('d0000000-0000-4000-8000-000000000002',
                                '50000000-0000-4000-8000-000000000001', null);

  if _id is null then
    raise exception 'FAIL 2: a second deanery could not open a register for the same specialty';
  end if;

  if (select count(*) from public.registers
       where specialty_id = '50000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FAIL 2: expected two registers on that specialty';
  end if;

  if (select slug from public.registers where id = _id) <> 'wessex-ent' then
    raise exception 'FAIL 2: unexpected slug %', (select slug from public.registers where id = _id);
  end if;

  -- ...but not twice in the same one.
  begin
    perform public.create_register('d0000000-0000-4000-8000-000000000002',
                                   '50000000-0000-4000-8000-000000000001', null);
    raise exception 'FAIL 2: a duplicate was allowed within one deanery';
  exception when others then
    if sqlerrm not like 'A register already exists%' then raise; end if;
  end;

  raise notice 'ok  2  one register per specialty per deanery, not per specialty';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. Which deaneries each person may create in
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';   -- super_admin
do $$
begin
  if (select count(*) from public.register_creatable_deaneries()) <> 2 then
    raise exception 'FAIL 3: a super_admin cannot see both deaneries';
  end if;
  raise notice 'ok  3  a super_admin may create in any deanery';
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';   -- admin scoped to Mersey
do $$
declare _d record;
begin
  if (select count(*) from public.register_creatable_deaneries()) <> 1 then
    raise exception 'FAIL 3b: a scoped admin sees % deaneries, expected 1',
      (select count(*) from public.register_creatable_deaneries());
  end if;
  select * into _d from public.register_creatable_deaneries();
  if _d.id <> 'd0000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL 3b: a Mersey admin was offered the wrong deanery';
  end if;
  raise notice 'ok  3b an admin sees only their own deanery';
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';   -- editor of mersey-ent, no admin role
do $$
begin
  -- A plain member may start another register, in a deanery they already work in.
  if (select count(*) from public.register_creatable_deaneries()) <> 1 then
    raise exception 'FAIL 3c: an editor sees % deaneries, expected 1',
      (select count(*) from public.register_creatable_deaneries());
  end if;
  raise notice 'ok  3c an editor sees the deaneries they already hold a register in';
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000004';   -- belongs to nothing
do $$
begin
  if (select count(*) from public.register_creatable_deaneries()) <> 0 then
    raise exception 'FAIL 3d: somebody with no role and no register was offered a deanery';
  end if;
  raise notice 'ok  3d somebody with neither a role nor a register is offered none';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 4. The specialty picker excludes what is taken in THAT deanery only
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';

do $$
declare _mersey bigint; _wessex bigint;
begin
  select count(*) into _mersey
    from public.register_creatable_specialties('d0000000-0000-4000-8000-000000000001');
  select count(*) into _wessex
    from public.register_creatable_specialties('d0000000-0000-4000-8000-000000000002');

  -- Three specialties exist. Mersey has registers on two of them, Wessex on none.
  if _mersey <> 1 then
    raise exception 'FAIL 4: Mersey offers % specialties, expected 1', _mersey;
  end if;
  if _wessex <> 3 then
    raise exception 'FAIL 4: Wessex offers % specialties, expected all 3', _wessex;
  end if;

  -- The catalogue is not filtered by specialties.deanery_id: on real data every
  -- specialty belongs to one deanery, and doing so would leave the others empty.
  if not exists (
    select 1 from public.register_creatable_specialties('d0000000-0000-4000-8000-000000000002')
     where id = '50000000-0000-4000-8000-000000000001'   -- a Mersey-owned row
  ) then
    raise exception 'FAIL 4: Wessex was not offered the shared catalogue';
  end if;

  raise notice 'ok  4  the picker excludes only what is taken in that deanery';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 5. A deanery you cannot create in offers no specialties either
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';   -- Mersey admin

do $$
begin
  if (select count(*) from public.register_creatable_specialties(
        'd0000000-0000-4000-8000-000000000002')) <> 0 then
    raise exception 'FAIL 5: specialties were offered for a deanery the caller cannot use';
  end if;
  raise notice 'ok  5  a deanery you cannot use offers nothing';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 6. The directory reads the deanery off the register, not off the specialty
-- ----------------------------------------------------------------------------
begin;

-- Seeded as superuser: `authenticated` deliberately holds no INSERT on
-- registers, because creation goes through create_register().
insert into public.registers (id, deanery_id, specialty_id, name, slug)
values ('9e000000-0000-4000-8000-00000000000c',
        'd0000000-0000-4000-8000-000000000002',   -- Wessex
        '50000000-0000-4000-8000-000000000002',   -- a Mersey-owned Urology row
        'Wessex · Urology', 'wessex-urology');

set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';

do $$
begin
  if (select deanery_name from public.register_directory()
       where slug = 'wessex-urology') <> 'Wessex Deanery' then
    raise exception 'FAIL 6: the directory reported the specialty''s deanery, not the register''s';
  end if;
  raise notice 'ok  6  the directory names the register''s own deanery';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 7. anon reaches neither picker
-- ----------------------------------------------------------------------------
begin;
set local role anon;
do $$
begin
  begin
    perform public.register_creatable_deaneries();
    raise exception 'FAIL 7: anon listed deaneries';
  exception when insufficient_privilege then
    raise notice 'ok  7  anon cannot list creatable deaneries';
  end;
end $$;
rollback;

\echo ''
\echo 'All per-deanery assertions passed.'
