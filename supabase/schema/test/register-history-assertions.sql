-- Assertions for 20261012100000_register_history_and_guard.sql.
--
-- The point: a register's records cannot be destroyed in one careless or
-- hostile save; an owner can get them back; the archive window cannot be
-- skipped; and losing records leaves a trace in the audit log.

\set ON_ERROR_STOP on

insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000c8', 'History Deanery', 'HD', 'history-deanery');
insert into public.specialties (id, deanery_id, name, short_name, slug)
values ('5c800000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000c8', 'ENT', 'ENT', 'ent');
insert into public.registers (id, deanery_id, specialty_id, name, slug)
values ('9c800000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000c8',
        '5c800000-0000-4000-8000-000000000001', 'HD · ENT', 'history-ent');
insert into public.register_stores (register_id, data) values
  ('9c800000-0000-4000-8000-000000000001', jsonb_build_object(
     'trainees', jsonb_build_array(jsonb_build_object('id','t1','name','One'),
                                   jsonb_build_object('id','t2','name','Two')),
     'sessions', jsonb_build_array(jsonb_build_object('id','s1')),
     'attendance', jsonb_build_object('t1|s1', '{}'::jsonb, 't2|s1', '{}'::jsonb)));

insert into auth.users (id, email) values
  ('c8000000-0000-4000-8000-00000000000a', 'owner@example.invalid'),
  ('c8000000-0000-4000-8000-00000000000e', 'editor@example.invalid');
insert into public.register_members (register_id, user_id, role) values
  ('9c800000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-00000000000a', 'owner'),
  ('9c800000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-00000000000e', 'editor');

-- ----------------------------------------------------------------------------
-- 1. An editor's wiping save is kept in history and logged
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'c8000000-0000-4000-8000-00000000000e';
do $$
begin
  perform public.save_register('9c800000-0000-4000-8000-000000000001', '{}'::jsonb, 1);
end $$;
reset role;

do $$
begin
  perform 1 from public.register_store_history
   where register_id = '9c800000-0000-4000-8000-000000000001' and version = 1
     and jsonb_array_length(data -> 'trainees') = 2;
  if not found then raise exception 'FAIL 1: the version a save replaced was not kept'; end if;

  perform 1 from public.audit_log
   where action = 'register.records_removed'
     and details ->> 'register_id' = '9c800000-0000-4000-8000-000000000001'
     and (details -> 'before' ->> 'trainees')::int = 2
     and (details -> 'after' ->> 'trainees')::int = 0;
  if not found then raise exception 'FAIL 1: removing every trainee was not audited'; end if;

  raise notice 'ok  1  a wiping save is kept in history and audited';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 2. Only an owner can see the history and restore from it
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'c8000000-0000-4000-8000-00000000000e';
do $$
begin
  begin
    perform * from public.register_history('9c800000-0000-4000-8000-000000000001');
    raise exception 'FAIL 2: an editor read the history';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.restore_register_version('9c800000-0000-4000-8000-000000000001', 1);
    raise exception 'FAIL 2: an editor restored a version';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform 1 from public.register_store_history;
    raise exception 'FAIL 2: the history table is readable directly';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local test.uid = 'c8000000-0000-4000-8000-00000000000a';
do $$
declare _n int;
begin
  select count(*) into _n from public.register_history('9c800000-0000-4000-8000-000000000001');
  if _n < 1 then raise exception 'FAIL 2: the owner sees no history'; end if;
  perform public.restore_register_version('9c800000-0000-4000-8000-000000000001', 1);
end $$;
reset role;
do $$
begin
  perform 1 from public.register_stores
   where register_id = '9c800000-0000-4000-8000-000000000001'
     and jsonb_array_length(data -> 'trainees') = 2 and version = 3;
  if not found then raise exception 'FAIL 2: restoring did not bring the records back as a new version'; end if;
  raise notice 'ok  2  only an owner reads history and restores; the restore is itself a version';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 3. The archive window cannot be skipped by a direct update
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'c8000000-0000-4000-8000-00000000000a';
do $$
begin
  begin
    update public.registers set archived_at = now() - interval '30 days'
     where id = '9c800000-0000-4000-8000-000000000001';
    raise exception 'FAIL 3: an owner backdated archived_at directly';
  exception when insufficient_privilege then null;
  end;

  update public.registers set certificate_logo_path = null
   where id = '9c800000-0000-4000-8000-000000000001';
  if not found then raise exception 'FAIL 3: an owner can no longer set the certificate badge'; end if;

  perform public.archive_register('9c800000-0000-4000-8000-000000000001');
  raise notice 'ok  3  archived_at moves only through archive_register()';
end $$;
reset role;
do $$
begin
  perform 1 from public.audit_log where action = 'register.archived'
     and details ->> 'register_id' = '9c800000-0000-4000-8000-000000000001';
  if not found then raise exception 'FAIL 3: archiving was not audited'; end if;
end $$;
rollback;
