-- Assertions for 20261011130000_resources_storage_object_path.sql.
--
-- The point: whether somebody may touch a file in the `resources` bucket is
-- decided by the subsection named in THAT FILE's path, and by nothing else.
-- Before the fix, an unqualified `name` resolved to subsections.name, so the
-- object's path was never read: ordinary users were refused everything, and a
-- facilitator who titled a subsection "x/<its own id>/y" reached every file.
--
-- Runs on a fresh baseline with its own fixture (see verify-storage-schema.sh).

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- Fixture: one deanery, two specialties each with a subsection and a file, a
-- facilitator of ENT, an ENT trainee, and an admin.
-- ----------------------------------------------------------------------------
insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000e1', 'Storage Deanery', 'SD', 'storage-deanery');

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5e000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e1', 'Otolaryngology', 'ENT', 'ent'),
  ('5e000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000e1', 'Urology', 'Uro', 'uro');

insert into public.subsections (id, specialty_id, name) values
  ('5b000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', 'ENT curriculum'),
  ('5b000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000002', 'Uro curriculum');

insert into auth.users (id, email) values
  ('ee000000-0000-4000-8000-00000000000a', 'admin@example.invalid'),
  ('ee000000-0000-4000-8000-00000000000f', 'facilitator@example.invalid'),
  ('ee000000-0000-4000-8000-00000000000e', 'trainee@example.invalid');

insert into public.user_roles (user_id, role, deanery_id) values
  ('ee000000-0000-4000-8000-00000000000a', 'admin', 'd0000000-0000-4000-8000-0000000000e1'),
  ('ee000000-0000-4000-8000-00000000000f', 'facilitator', null);

insert into public.facilitator_specialties (user_id, specialty_id)
values ('ee000000-0000-4000-8000-00000000000f', '5e000000-0000-4000-8000-000000000001');

insert into public.trainee_specialties (user_id, specialty_id)
values ('ee000000-0000-4000-8000-00000000000e', '5e000000-0000-4000-8000-000000000001');

insert into storage.objects (id, bucket_id, name) values
  ('0b000000-0000-4000-8000-000000000001', 'resources',
   '5e000000-0000-4000-8000-000000000001/5b000000-0000-4000-8000-000000000001/ent.pdf'),
  ('0b000000-0000-4000-8000-000000000002', 'resources',
   '5e000000-0000-4000-8000-000000000002/5b000000-0000-4000-8000-000000000002/uro.pdf');

-- ----------------------------------------------------------------------------
-- 1. A trainee reads their own specialty's file, and only that one
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ee000000-0000-4000-8000-00000000000e';

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects where bucket_id = 'resources';
  if _n <> 1 then raise exception 'FAIL 1: trainee sees % resource files, expected 1', _n; end if;
  perform 1 from storage.objects where id = '0b000000-0000-4000-8000-000000000001';
  if not found then raise exception 'FAIL 1: trainee cannot read their own specialty''s file'; end if;
  raise notice 'ok  1  trainee reads their own specialty''s file and no other';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 2. A facilitator uploads to, and deletes from, their own subsection only
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ee000000-0000-4000-8000-00000000000f';

do $$
declare _n int;
begin
  insert into storage.objects (bucket_id, name) values ('resources',
    '5e000000-0000-4000-8000-000000000001/5b000000-0000-4000-8000-000000000001/new.pdf');

  begin
    insert into storage.objects (bucket_id, name) values ('resources',
      '5e000000-0000-4000-8000-000000000002/5b000000-0000-4000-8000-000000000002/x.pdf');
    raise exception 'FAIL 2: facilitator uploaded into a subsection they do not manage';
  exception when insufficient_privilege then null;
  end;

  delete from storage.objects where id = '0b000000-0000-4000-8000-000000000002';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 2: facilitator deleted another specialty''s file'; end if;

  raise notice 'ok  2  facilitator writes to their own subsection only';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 3. THE BUG: retitling a subsection to look like a path reaches nothing more
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ee000000-0000-4000-8000-00000000000f';

do $$
declare _n int;
begin
  update public.subsections
     set name = 'x/5b000000-0000-4000-8000-000000000001/y'
   where id = '5b000000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 3: fixture — facilitator could not rename their subsection'; end if;

  select count(*) into _n from storage.objects
   where id = '0b000000-0000-4000-8000-000000000002';
  if _n <> 0 then raise exception 'FAIL 3: a path-shaped subsection title exposed another specialty''s file'; end if;

  delete from storage.objects where id = '0b000000-0000-4000-8000-000000000002';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 3: a path-shaped subsection title allowed deleting another specialty''s file'; end if;

  raise notice 'ok  3  a subsection''s title cannot widen access to files';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. An outsider with no enrolment reads nothing
-- ----------------------------------------------------------------------------
insert into auth.users (id, email)
values ('ee000000-0000-4000-8000-000000000000', 'outsider@example.invalid');

begin;
set local role authenticated;
set local test.uid = 'ee000000-0000-4000-8000-000000000000';

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects where bucket_id = 'resources';
  if _n <> 0 then raise exception 'FAIL 4: an unenrolled user sees % resource files', _n; end if;
  raise notice 'ok  4  an unenrolled user reads no files';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 5. The admin still reaches every file in their deanery
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ee000000-0000-4000-8000-00000000000a';

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects where bucket_id = 'resources';
  if _n < 2 then raise exception 'FAIL 5: admin sees only % resource files', _n; end if;
  raise notice 'ok  5  admin reads every file in their deanery';
end $$;
commit;
