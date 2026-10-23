-- Key contacts that belong to a specialty school, not the whole deanery.
--
-- A contact used to live in one of two places: on one specialty, or with no
-- specialty at all, in which case every specialty page showed it. That has no
-- room for the commonest contact there is — the School of Surgery's Head of
-- School, its programme support team, its inbox — which applies to every
-- surgical specialty and to none of the others. Filing it as general put the
-- Head of Surgery on the Ophthalmology and O&G pages; filing it on one
-- specialty hid it from the rest.
--
-- A deanery's specialties now group into schools (North West: the School of
-- Surgery covers every surgical specialty except Ophthalmology and O&G, which
-- have schools of their own), and a contact can be filed against a school.
-- Where a contact lives is then one of three:
--
--   specialty_id set          that specialty only
--   school_id set             every specialty in that school
--   neither                   the whole deanery
--
-- School contacts are written by admins only, like deanery-wide ones: a
-- facilitator of one surgical specialty changing the Head of School would
-- change it for all of them. The facilitator policies already require a
-- specialty_id, so they need no change.
--
-- Also seeds the North West School of Surgery, files its specialties under it,
-- and prefills the key contacts published on nwpgmd.nhs.uk. All of it is
-- idempotent and keyed on names, so it is a no-op on a project without a North
-- West deanery or without those specialties.

begin;

create table if not exists public.schools (
  id          uuid primary key default gen_random_uuid(),
  deanery_id  uuid not null references public.deaneries(id) on delete cascade,
  name        text not null,
  short_name  text not null,
  slug        text not null,
  sort_order  integer default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (deanery_id, slug)
);

drop trigger if exists set_updated_at on public.schools;
create trigger set_updated_at before update on public.schools
  for each row execute function public.update_updated_at_column();

alter table public.specialties
  add column if not exists school_id uuid references public.schools(id) on delete set null;

alter table public.contacts
  add column if not exists school_id uuid references public.schools(id) on delete cascade;

-- A contact is on one specialty or one school, never both.
do $$ begin
  alter table public.contacts
    add constraint contacts_one_scope check (specialty_id is null or school_id is null);
exception when duplicate_object then null; end $$;

create index if not exists specialties_school_idx on public.specialties (school_id);
create index if not exists contacts_school_idx    on public.contacts (school_id) where archived is not true;

-- ----------------------------------------------------------------- policies --
alter table public.schools enable row level security;
alter table public.schools force row level security;

drop policy if exists "schools readable by signed-in users" on public.schools;
create policy "schools readable by signed-in users"
  on public.schools for select to authenticated using (true);

drop policy if exists "admins manage schools" on public.schools;
create policy "admins manage schools"
  on public.schools for all to authenticated
  using (public.is_admin_of_deanery(auth.uid(), deanery_id))
  with check (public.is_admin_of_deanery(auth.uid(), deanery_id));

revoke all on public.schools from anon;
grant select, insert, update, delete on public.schools to authenticated;

-- A school contact's deanery is its school's. The admin policy reads the
-- contact's own deanery_id first, so a school contact must carry it.
create or replace function public.contacts_school_deanery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.school_id is not null then
    select deanery_id into new.deanery_id from public.schools where id = new.school_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.contacts_school_deanery() from public, anon;

drop trigger if exists contacts_school_deanery on public.contacts;
create trigger contacts_school_deanery before insert or update of school_id, deanery_id on public.contacts
  for each row execute function public.contacts_school_deanery();

-- -------------------------------------------- North West School of Surgery --
do $$
declare
  _deanery uuid;
  _school  uuid;
begin
  select id into _deanery from public.deaneries
   where name ilike '%north west%' or slug in ('north-west', 'northwest', 'nw')
   order by created_at limit 1;
  if _deanery is null then
    raise notice 'No North West deanery: School of Surgery not seeded';
    return;
  end if;

  insert into public.schools (deanery_id, name, short_name, slug, sort_order)
  values (_deanery, 'School of Surgery', 'Surgery', 'surgery', 0)
  on conflict (deanery_id, slug) do nothing;
  select id into _school from public.schools where deanery_id = _deanery and slug = 'surgery';

  -- Every surgical specialty, by name. Ophthalmology and O&G have their own
  -- schools and are left out even though they operate. Only rows not yet in a
  -- school: an admin's later choice is not undone by a re-run.
  update public.specialties s
     set school_id = _school
   where s.deanery_id = _deanery
     and s.school_id is null
     and (s.name || ' ' || s.short_name) ~* '(surg|otolaryng|\yENT\y|orthopaed|\yT ?& ?O\y|\yurolog|maxillo|\yOMFS\y)'
     and (s.name || ' ' || s.short_name) !~* '(ophthalm|obstet|gynae|\yO ?& ?G\y)';
end $$;

-- ------------------------------------------------------- prefilled contacts --
-- From nwpgmd.nhs.uk (the School of Surgery and specialty pages, and the
-- Specialty School Contacts table), October 2026. Where a page names a TPD
-- without an address, the school's own inbox is given: it is where the site
-- sends enquiries for that person.
--
-- scope: 'deanery', 'school:<slug>' or a regex matched against the
-- specialty's name and short name, as above.
do $$
declare
  _deanery uuid;
  r        record;
  _spec    uuid;
  _school  uuid;
begin
  select id into _deanery from public.deaneries
   where name ilike '%north west%' or slug in ('north-west', 'northwest', 'nw')
   order by created_at limit 1;
  if _deanery is null then
    raise notice 'No North West deanery: contacts not prefilled';
    return;
  end if;

  for r in
    select * from (values
      -- School of Surgery
      ('school:surgery', 'Mr David van Dellen', 'Head of School of Surgery', 'deanery'::public.contact_category,
       'Manchester Royal Infirmary', 'david.vandellen1@nhs.net', null::text),
      ('school:surgery', 'Dr Joanne Rowell', 'Associate Dean for Surgery', 'associate_dean',
       'NHS England – North West', 'joanne.rowell4@nhs.net', null),
      ('school:surgery', 'Ms Ambareen Kausar', 'Associate Head of School of Surgery', 'deanery',
       'NHS England – North West', 'england.surgery.nw@nhs.net', null),
      ('school:surgery', 'Mr Euan Green', 'Associate Head of School of Surgery', 'deanery',
       'NHS England – North West', 'england.surgery.nw@nhs.net', null),
      ('school:surgery', 'School of Surgery Programme Management Team', 'General enquiries', 'deanery',
       'NHS England – North West, Three Piccadilly Place, Manchester', 'england.surgery.nw@nhs.net', '0161 268 9588'),
      ('school:surgery', 'Ian Griffiths', 'Programme Support Administrator, School of Surgery', 'rota_admin',
       'NHS England – North West, Three Piccadilly Place, Manchester', 'england.surgery.nw@nhs.net', '0161 268 9575'),

      -- Surgical specialties
      ('general surg', 'Mr Kulbir Mann', 'General Surgery Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Liverpool University Hospitals NHS FT', 'kulbir.mann@liverpoolft.nhs.uk', null),
      ('general surg', 'Mrs Emma Davies', 'General Surgery Training Programme Director (Greater Manchester, Lancashire & South Cumbria)', 'tpd',
       'Royal Preston Hospital', 'england.surgery.nw@nhs.net', null),
      ('orthopaed|\yT ?& ?O\y', 'Mrs Jo Banks', 'T&O Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Aintree University Hospital', 'england.surgery.nw@nhs.net', null),
      ('orthopaed|\yT ?& ?O\y', 'Mr Mike Woodruff', 'T&O Training Programme Director (Greater Manchester, Lancashire & South Cumbria)', 'tpd',
       'Royal Preston Hospital', 'england.surgery.nw@nhs.net', null),
      ('\yurolog', 'Mr Snehal Patel', 'Urology Training Programme Director (Cheshire, Merseyside & North Wales)', 'tpd',
       'Arrowe Park Hospital', 'england.surgery.nw@nhs.net', null),
      ('\yurolog', 'Miss Louise Olson', 'Urology Training Programme Director (Greater Manchester & Lancashire)', 'tpd',
       'Salford Royal Hospital', 'england.surgery.nw@nhs.net', null),
      ('cardiothor', 'Mr Steve Woolley', 'Cardiothoracic Surgery Training Programme Director', 'tpd',
       'Liverpool Heart and Chest Hospital', 'steven.woolley@lhch.nhs.uk', null),
      ('neurosurg', 'Ms Deborah Ferguson', 'Neurosurgery Training Programme Director (Greater Manchester & Lancashire)', 'tpd',
       'NHS England – North West', 'england.surgery.nw@nhs.net', null),
      ('plastic', 'Mr Chidi Ekwobi', 'Plastic Surgery Training Programme Director (Greater Manchester, Lancashire & South Cumbria)', 'tpd',
       'Royal Preston Hospital', 'england.surgery.nw@nhs.net', null),
      ('maxillo|\yOMFS\y', 'Mr Sherif Bayoumi', 'OMFS Training Programme Director', 'tpd',
       'North Manchester General Hospital', 'england.surgery.nw@nhs.net', null),
      ('paediatric surg', 'Mrs Sarah Wood', 'Paediatric Surgery Training Programme Director', 'tpd',
       'Alder Hey Children''s Hospital', 'england.surgery.nw@nhs.net', null),

      -- Other schools
      ('ophthalm', 'Miss Natasha Spiteri', 'Ophthalmology Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Countess of Chester Hospital', 'n.spiteri@nhs.net', null),
      ('anaesth', 'North West School of Anaesthesia', 'School enquiries', 'deanery',
       'NHS England – North West', 'england.anaesthesia.nw@nhs.net', null),
      ('anaesth|intensive|\yICM\y', 'Dr Gurinder Tack', 'Associate Dean for Intensive Care Medicine', 'associate_dean',
       'NHS England – North West', 'gurinder.tack1@nhs.net', null),
      ('anaesth|intensive|\yICM\y', 'North West School of Intensive Care Medicine', 'School enquiries', 'deanery',
       'NHS England – North West', 'england.icm.nw@nhs.net', null),
      ('psychiat', 'North West School of Psychiatry', 'School enquiries', 'deanery',
       'NHS England – North West', 'england.psychiatry.nw@nhs.net', null),
      ('internal medicine|\yIMT\y|general medicine', 'North West School of Medicine', 'School enquiries', 'deanery',
       'NHS England – North West', 'england.medicine.nw@nhs.net', null)
    ) as v(scope, name, role, category, organisation, email, phone)
  loop
    if r.scope like 'school:%' then
      select id into _school from public.schools
       where deanery_id = _deanery and slug = substr(r.scope, 8);
      if _school is null then continue; end if;
      if not exists (select 1 from public.contacts
                      where school_id = _school and name = r.name and role = r.role) then
        insert into public.contacts (name, role, category, organisation, email, phone, school_id, deanery_id)
        values (r.name, r.role, r.category, r.organisation, r.email, r.phone, _school, _deanery);
      end if;
    else
      -- Every matching specialty: "Anaesthetics & ICM" and a separate "ICM"
      -- both want the ICM contacts.
      for _spec in
        select id from public.specialties
         where deanery_id = _deanery and deleted_at is null
           and (name || ' ' || short_name) ~* r.scope
      loop
        if not exists (select 1 from public.contacts
                        where specialty_id = _spec and name = r.name and role = r.role) then
          insert into public.contacts (name, role, category, organisation, email, phone, specialty_id, deanery_id)
          values (r.name, r.role, r.category, r.organisation, r.email, r.phone, _spec, _deanery);
        end if;
      end loop;
    end if;
  end loop;
end $$;

commit;
