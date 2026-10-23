-- Assertions for 20261023090000_school_scoped_contacts.sql.
--
-- The point: a contact can be filed against a school (the North West School of
-- Surgery) and so apply to every specialty in it and no other; the seed files
-- the surgical specialties — and not Ophthalmology or O&G — under that school
-- and prefills the published contacts; and school contacts, like deanery-wide
-- ones, are written by admins only.
--
-- Run by scripts/verify-school-contacts-schema.sh. Its fixture,
-- school-contacts-fixture.sql, is loaded BEFORE the migration, as the live data
-- would be.

\set ON_ERROR_STOP on

do $$
declare
  _school uuid;
  _n int;
begin
  select id into _school from public.schools where slug = 'surgery';
  if _school is null then raise exception 'FAIL 1: School of Surgery was not created'; end if;

  select count(*) into _n from public.specialties
   where school_id = _school and slug in ('nw-ent', 'nw-uro', 'nw-tando', 'nw-paeds-surg');
  if _n <> 4 then raise exception 'FAIL 1: % of 4 surgical specialties filed under Surgery', _n; end if;

  select count(*) into _n from public.specialties
   where school_id is not null and slug in ('nw-ophth', 'nw-og', 'nw-psych');
  if _n <> 0 then raise exception 'FAIL 1: a non-surgical specialty was filed under Surgery'; end if;

  -- Neurology and Cardiology are medical, whatever their names contain.
  select count(*) into _n from public.specialties where school_id is not null and slug in ('nw-neuro', 'nw-cardio');
  if _n <> 0 then raise exception 'FAIL 1: a medical specialty was filed under Surgery'; end if;

  select count(*) into _n from public.contacts c join public.specialties s on s.id = c.specialty_id
   where s.slug in ('nw-neuro', 'nw-cardio');
  if _n <> 0 then raise exception 'FAIL 1: surgical TPDs prefilled onto Neurology or Cardiology'; end if;

  raise notice 'ok  1  surgical specialties, and only those, are in the School of Surgery';

  select count(*) into _n from public.contacts
   where school_id = _school and name = 'Mr David van Dellen' and specialty_id is null
     and deanery_id = (select deanery_id from public.schools where id = _school);
  if _n <> 1 then raise exception 'FAIL 2: Head of School not prefilled against the school'; end if;

  select count(*) into _n from public.contacts c join public.specialties s on s.id = c.specialty_id
   where s.slug = 'nw-uro' and c.category = 'tpd';
  if _n <> 2 then raise exception 'FAIL 2: expected both Urology TPDs, got %', _n; end if;

  select count(*) into _n from public.contacts c join public.specialties s on s.id = c.specialty_id
   where s.slug = 'nw-ophth' and c.name = 'Miss Natasha Spiteri';
  if _n <> 1 then raise exception 'FAIL 2: Ophthalmology TPD not prefilled'; end if;

  select count(*) into _n from public.contacts c join public.specialties s on s.id = c.specialty_id
   where s.slug = 'nw-paeds-surg' and c.name = 'Mrs Sarah Wood';
  if _n <> 1 then raise exception 'FAIL 2: Paediatric Surgery TPD not prefilled (or prefilled twice)'; end if;

  -- "general surg" must not catch Paediatric Surgery, nor T&O catch anything else.
  select count(*) into _n from public.contacts c join public.specialties s on s.id = c.specialty_id
   where s.slug <> 'nw-tando' and c.name = 'Mrs Jo Banks';
  if _n <> 0 then raise exception 'FAIL 2: T&O TPD prefilled onto another specialty'; end if;

  raise notice 'ok  2  published contacts prefilled where they belong';
end $$;

-- A contact cannot be on a specialty and a school at once.
do $$
begin
  insert into public.contacts (name, role, category, organisation, email, specialty_id, school_id)
  select 'Both', 'x', 'tpd', '', 'both@example.invalid', s.id, s.school_id
    from public.specialties s where s.slug = 'nw-ent';
  raise exception 'FAIL 3: a contact was filed on a specialty and a school at once';
exception when check_violation then
  raise notice 'ok  3  a contact is on a specialty or a school, not both';
end $$;

-- ----------------------------------------------------------------------------
-- 4. A facilitator of a surgical specialty cannot write school contacts
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'cc000000-0000-4000-8000-0000000000f2';

do $$
declare _n int;
begin
  begin
    insert into public.contacts (name, role, category, organisation, email, school_id)
    select 'x', 'x', 'deanery', '', 'x@example.invalid', id from public.schools where slug = 'surgery';
    raise exception 'FAIL 4: facilitator added a school contact';
  exception when insufficient_privilege then null;
  end;

  update public.contacts set phone = '1' where school_id is not null;
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 4: facilitator edited a school contact'; end if;

  -- They still see them, as they see deanery-wide ones.
  select count(*) into _n from public.contacts where school_id is not null;
  if _n = 0 then raise exception 'FAIL 4: facilitator cannot read school contacts'; end if;

  raise notice 'ok  4  school contacts are readable by all, written by admins only';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 5. The NW admin can, and the contact takes the school's deanery
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'cc000000-0000-4000-8000-0000000000a2';

do $$
declare _d uuid;
begin
  insert into public.contacts (name, role, category, organisation, email, school_id)
  select 'Programme rep', 'x', 'trainee_rep', '', 'rep@example.invalid', id
    from public.schools where slug = 'surgery';

  select deanery_id into _d from public.contacts where email = 'rep@example.invalid';
  if _d is distinct from 'd0000000-0000-4000-8000-0000000000e1' then
    raise exception 'FAIL 5: school contact did not take the school''s deanery';
  end if;

  raise notice 'ok  5  admins add school contacts, filed under the school''s deanery';
end $$;
commit;
