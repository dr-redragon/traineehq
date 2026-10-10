-- Assertions for 20261010120000_facilitators_manage_specialty_contacts.sql.
--
-- The point: a specialty's facilitator can add, edit and remove that
-- specialty's key contacts, and nothing else — not another specialty's, not
-- the general directory every specialty shows. Admins keep their old reach.
--
-- Runs on a fresh baseline with its own fixture (see verify-contacts-schema.sh).

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- Fixture: one deanery, two specialties, an admin, a facilitator of ENT only,
-- and a trainee. One contact in each place a contact can live.
-- ----------------------------------------------------------------------------
insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000c1', 'Contacts Deanery', 'CD', 'contacts-deanery');

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5c000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000c1', 'Otolaryngology', 'ENT', 'ent'),
  ('5c000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000c1', 'Urology', 'Uro', 'uro');

insert into auth.users (id, email) values
  ('cc000000-0000-4000-8000-00000000000a', 'admin@example.invalid'),
  ('cc000000-0000-4000-8000-00000000000f', 'facilitator@example.invalid'),
  ('cc000000-0000-4000-8000-00000000000e', 'trainee@example.invalid');

-- Signing up already gave each of them the trainee role (handle_new_user).
insert into public.user_roles (user_id, role, deanery_id) values
  ('cc000000-0000-4000-8000-00000000000a', 'admin', 'd0000000-0000-4000-8000-0000000000c1'),
  ('cc000000-0000-4000-8000-00000000000f', 'facilitator', null);

insert into public.facilitator_specialties (user_id, specialty_id)
values ('cc000000-0000-4000-8000-00000000000f', '5c000000-0000-4000-8000-000000000001');

insert into public.trainee_specialties (user_id, specialty_id)
values ('cc000000-0000-4000-8000-00000000000e', '5c000000-0000-4000-8000-000000000001');

insert into public.contacts (id, name, role, category, organisation, email, specialty_id) values
  ('c0000000-0000-4000-8000-000000000001', 'ENT TPD',   'TPD', 'tpd',     'Trust', 'ent@example.invalid', '5c000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'Uro TPD',   'TPD', 'tpd',     'Trust', 'uro@example.invalid', '5c000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000003', 'Deanery',   'Office', 'deanery', 'HEE', 'all@example.invalid', null);

-- ----------------------------------------------------------------------------
-- 1. The facilitator can add, edit and remove contacts of their specialty
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'cc000000-0000-4000-8000-00000000000f';

do $$
declare _n int;
begin
  insert into public.contacts (name, role, category, organisation, email, specialty_id)
  values ('New rep', 'Trainee rep', 'trainee_rep', '', 'rep@example.invalid', '5c000000-0000-4000-8000-000000000001');

  update public.contacts set phone = '0151 000 0000'
   where id = 'c0000000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 1: facilitator could not edit their own specialty''s contact'; end if;

  delete from public.contacts where email = 'rep@example.invalid';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 1: facilitator could not remove their own specialty''s contact'; end if;

  raise notice 'ok  1  facilitator adds, edits and removes their specialty''s contacts';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 2. ...but not another specialty's, nor the general directory
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'cc000000-0000-4000-8000-00000000000f';

do $$
declare _n int;
begin
  begin
    insert into public.contacts (name, role, category, organisation, email, specialty_id)
    values ('x', 'x', 'tpd', '', 'x@example.invalid', '5c000000-0000-4000-8000-000000000002');
    raise exception 'FAIL 2: facilitator added a contact to a specialty they do not facilitate';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.contacts (name, role, category, organisation, email, specialty_id)
    values ('x', 'x', 'tpd', '', 'x@example.invalid', null);
    raise exception 'FAIL 2: facilitator added a contact to the general directory';
  exception when insufficient_privilege then null;
  end;

  update public.contacts set phone = '1' where id in (
    'c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003');
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 2: facilitator edited a contact they do not manage'; end if;

  delete from public.contacts where id in (
    'c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003');
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 2: facilitator removed a contact they do not manage'; end if;

  -- Nor move their own contact out of the specialty they manage.
  begin
    update public.contacts set specialty_id = null
     where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2: facilitator moved a contact into the general directory';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok  2  facilitator cannot touch other specialties or the general directory';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 3. A trainee still cannot write contacts at all
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'cc000000-0000-4000-8000-00000000000e';

do $$
declare _n int;
begin
  begin
    insert into public.contacts (name, role, category, organisation, email, specialty_id)
    values ('x', 'x', 'tpd', '', 'x@example.invalid', '5c000000-0000-4000-8000-000000000001');
    raise exception 'FAIL 3: a trainee added a contact';
  exception when insufficient_privilege then null;
  end;

  update public.contacts set phone = '1' where id = 'c0000000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 3: a trainee edited a contact'; end if;

  raise notice 'ok  3  trainees still cannot write contacts';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 4. Admins keep the reach they had, general directory included
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'cc000000-0000-4000-8000-00000000000a';

do $$
declare _n int;
begin
  update public.contacts set phone = '2' where id in (
    'c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003');
  get diagnostics _n = row_count;
  if _n <> 2 then raise exception 'FAIL 4: admin lost the ability to edit contacts (% rows)', _n; end if;

  insert into public.contacts (name, role, category, organisation, email, specialty_id)
  values ('Admin added', 'x', 'deanery', '', 'admin-added@example.invalid', null);

  raise notice 'ok  4  admins still manage every contact';
end $$;
commit;
