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
-- and prefills the key contacts published on nwpgmd.nhs.uk: deanery-wide
-- services, the School of Surgery's team, and each specialty's leads and TPDs. All of it is
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
-- Copied from nwpgmd.nhs.uk on 23 October 2026: the School of Surgery home
-- page and each surgical specialty's page and sector pages, the other schools'
-- home pages, and the Specialty School Contacts table. Where a page names a
-- TPD without an address, the school's own inbox is given and the organisation
-- says so: it is where the site sends enquiries for them.
--
-- scope: 'deanery' (every specialty), 'school:<slug>', or a regex matched
-- against each specialty's name and short name. A specialty this project does
-- not have simply gets nothing.
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
      ('deanery', 'Lead Employer Team', 'HR enquiries for all resident doctors in the North West', 'trust_lead'::public.contact_category,
       'Mersey and West Lancashire Teaching Hospitals NHS Trust', 'lead.employer@merseywestlancs.nhs.uk', '0151 478 7777'::text),
      ('deanery', 'Lead Employer Payroll', 'Payroll enquiries', 'trust_lead',
       'Mersey and West Lancashire Teaching Hospitals NHS Trust', 'leademployerpayroll@sthk.nhs.uk', '0151 290 4658'),
      ('deanery', 'Study Leave Team', 'Study leave enquiries', 'deanery',
       'NHS England – North West', 'england.studyleave.nw@nhs.net', null),
      ('deanery', 'SuppoRTT Team', 'Supported Return to Training', 'deanery',
       'NHS England – North West', 'england.supportt.nw@nhs.net', null),
      ('deanery', 'Revalidation Team', 'Revalidation and Form R', 'deanery',
       'NHS England – North West', 'england.revalidation.nw@nhs.net', null),
      ('deanery', 'Careers Advice Team', 'Careers advice', 'deanery',
       'NHS England – North West', 'england.careers.nw@nhs.net', null),
      ('deanery', 'Inter Deanery Transfer Team', 'Inter Deanery Transfers (IDT)', 'deanery',
       'NHS England – North West', 'england.nw.idt@nhs.net', null),
      ('school:surgery', 'Mr David van Dellen', 'Head of School of Surgery', 'deanery',
       'Manchester Royal Infirmary', 'david.vandellen1@nhs.net', null),
      ('school:surgery', 'Dr Joanne Rowell', 'Associate Dean for Surgery', 'associate_dean',
       'NHS England – North West, Three Piccadilly Place', 'joanne.rowell4@nhs.net', '0161 268 9714'),
      ('school:surgery', 'Ms Ambareen Kausar', 'Associate Head of School of Surgery', 'deanery',
       'Royal Blackburn Hospital', 'ambareen.kausar@elht.nhs.uk', null),
      ('school:surgery', 'Mr Euan Green', 'Associate Head of School of Surgery', 'deanery',
       'Salford Royal Hospital', 'euan.green@nca.nhs.uk', null),
      ('school:surgery', 'School of Surgery Programme Management Team', 'General enquiries', 'rota_admin',
       'NHS England – North West, Three Piccadilly Place, Manchester', 'england.surgery.nw@nhs.net', null),
      ('school:surgery', 'Ashley Barrett', 'Programme Support Manager for Surgery (Core Surgery, T&O)', 'rota_admin',
       'NHS England – North West, Manchester', 'england.surgery.nw@nhs.net', '0161 268 9520'),
      ('school:surgery', 'Jennifer Sneade', 'Programme Support Co-ordinator for Surgery (General Surgery, ENT)', 'rota_admin',
       'NHS England – North West, Manchester', 'england.surgery.nw@nhs.net', '0161 268 9588'),
      ('school:surgery', 'Ian Griffiths', 'Programme Support Administrator for Surgery (Cardiothoracic, Neurosurgery, OMFS, Paediatric Surgery, Plastics, Urology, Vascular)', 'rota_admin',
       'NHS England – North West, Manchester', 'england.surgery.nw@nhs.net', '0161 268 9575'),
      ('school:surgery', 'Miss Nazia Munir', 'School of Surgery TRES Training Programme Director (Trainees Requiring Extra Support)', 'tpd',
       'Liverpool University Hospitals NHS FT', 'nazia.munir@liverpoolft.nhs.uk', null),
      ('school:surgery', 'Mrs Sarah Wood', 'School of Surgery TRES Training Programme Director (Trainees Requiring Extra Support)', 'tpd',
       'Alder Hey Children''s Hospital', 'sarah.wood@alderhey.nhs.uk', null),
      ('school:surgery', 'MACH Team', 'Mentorship, Advice and Connection Hub (surgical mentoring)', 'trainee_rep',
       'NHS England – North West School of Surgery', 'surgicalcareersnw@gmail.com', null),
      ('school:surgery', 'Sheun Amosu', 'JCST Committee and Trainee Services Manager for the North West', 'royal_college',
       'Joint Committee on Surgical Training', 'OAmosu@jcst.org', null),
      ('school:surgery', 'Bev Nhira', 'JCST Trainee Services Coordinator for the North West', 'royal_college',
       'Joint Committee on Surgical Training', 'BNhira@jcst.org', null),
      ('school:surgery', 'Joint Committee on Surgical Training', 'General enquiries', 'royal_college',
       'JCST', 'specialties@jcst.org', '0207 869 6246'),
      ('otolaryng|\yENT\y', 'Mr Sunil Sharma', 'Otolaryngology (ENT) Training Programme Director (whole North West)', 'tpd',
       'Alder Hey Children''s Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('general surg', 'Mr Jonathan Wild', 'General Surgery Training Programme Director (Greater Manchester, Lancashire & South Cumbria)', 'tpd',
       'The Christie (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('general surg', 'Mr Kulbir Mann', 'General Surgery Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Liverpool University Hospitals NHS FT (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('orthopaed|\yT ?& ?O\y', 'Mr Mike Woodruff', 'T&O Training Programme Director (Greater Manchester, Lancashire & South Cumbria)', 'tpd',
       'Royal Preston Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('orthopaed|\yT ?& ?O\y', 'Mrs Jo Banks', 'T&O Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Aintree University Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('\yurolog', 'Miss Louise Olson', 'Urology Training Programme Director (Greater Manchester & Lancashire)', 'tpd',
       'Salford Royal Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('\yurolog', 'Mr Snehal Patel', 'Urology Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Arrowe Park Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('cardiothor', 'Mr Antony Walker', 'Cardiothoracic Surgery Training Programme Director', 'tpd',
       'Blackpool Victoria Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('neurosurg', 'Ms Deborah Ferguson', 'Neurosurgery Training Programme Director (Greater Manchester & Lancashire)', 'tpd',
       'Royal Manchester Children''s Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('neurosurg', 'Mr Nick Carleton-Bland', 'Neurosurgery Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'The Walton Centre (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('plastic', 'Rachel Holt', 'Plastic Surgery Training Programme Director (Greater Manchester, Lancashire & South Cumbria)', 'tpd',
       'Wythenshawe Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('plastic', 'Mrs Emma Osanlou', 'Plastic Surgery Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Whiston Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('maxillo|\yOMFS\y', 'Mr Sherif Bayoumi', 'OMFS Training Programme Director', 'tpd',
       'North Manchester General Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('paediatric surg', 'Mrs Charlotte Melling', 'Paediatric Surgery Training Programme Director', 'tpd',
       'Alder Hey Children''s Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('vascular', 'Mr Tawqeer Rashid', 'Vascular Surgery Training Programme Director', 'tpd',
       'Manchester Royal Infirmary (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('core surg|\yCST\y', 'Miss Corinne Owers', 'Core Surgery Training Programme Director (Greater Manchester, Lancashire & South Cumbria) – CT1s', 'tpd',
       'Blackpool Victoria Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('core surg|\yCST\y', 'Mr James Pollard', 'Core Surgery Training Programme Director (Greater Manchester, Lancashire & South Cumbria) – CT2s', 'tpd',
       'Royal Bolton Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('core surg|\yCST\y', 'Miss Bethan Jones', 'Core Surgery Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Arrowe Park Hospital (email via the School of Surgery)', 'england.surgery.nw@nhs.net', null),
      ('core surg|\yCST\y', 'Susan Walsh', 'Core Surgical Training Teaching Programme Coordinator', 'rota_admin',
       'Wythenshawe Hospital', 'coresurgery@mft.nhs.uk', '0161 291 5767'),
      ('ophthalm', 'Dr Ruth Gottstein', 'Associate Dean for Ophthalmology', 'associate_dean',
       'NHS England – North West', 'ruth.gottstein1@nhs.net', null),
      ('ophthalm', 'Mrs Anshoo Choudhary', 'Head of School of Ophthalmology', 'deanery',
       'Liverpool University Hospitals NHS FT', 'anshoo.choudhary@liverpoolft.nhs.uk', null),
      ('ophthalm', 'Ms Natasha Spiteri', 'Ophthalmology Training Programme Director (Cheshire & Merseyside)', 'tpd',
       'Countess of Chester Hospital', 'n.spiteri@nhs.net', null),
      ('ophthalm', 'Mr Ken Yau', 'Ophthalmology Training Programme Director (Greater Manchester & Lancashire)', 'tpd',
       'Manchester Royal Eye Hospital', 'kenneth.yau@mft.nhs.uk', null),
      ('ophthalm', 'Miss Fidan Jmor', 'Ophthalmology Training Programme Director for Exam Support', 'tpd',
       'Royal Liverpool University Hospital', 'fidan.jmor@liverpoolft.nhs.uk', null),
      ('ophthalm', 'School of Ophthalmology Programme Support Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.ophthalmology.nw@nhs.net', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Rebekah Samangaya', 'Head of School of Obstetrics and Gynaecology', 'deanery',
       'St Mary''s Hospital, Manchester', 'rebekah.samangaya@mft.nhs.uk', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Andrea Pilkington', 'Deputy Head of School of O&G (including SITM director)', 'deanery',
       'Wythenshawe Hospital', 'andrea.pilkington3@nhs.net', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Richard Hughes', 'Associate Dean for Obstetrics and Gynaecology', 'associate_dean',
       'NHS England – North West', 'richard.hughes31@nhs.net', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Helen Bradshaw', 'O&G Training Programme Director ST1–2 (Mersey)', 'tpd',
       'Liverpool Women''s Hospital', 'Helen.bradshaw1@lwh.nhs.uk', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Rachel Owen', 'O&G Training Programme Director ST1–2 (North Western)', 'tpd',
       'Stepping Hill Hospital', 'rachel.owen@stockport.nhs.uk', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Nira Ramachandran', 'O&G Training Programme Director ST3–5 (Mersey)', 'tpd',
       'Ormskirk Hospital', 'n.ramachandran1@nhs.net', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Syma Ahmed', 'O&G Training Programme Director ST3–5 (North Western)', 'tpd',
       'Royal Preston Hospital', 'syma.ahmed@lthtr.nhs.uk', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Clare Mullan', 'O&G Training Programme Director ST6–7 (Mersey and North Western)', 'tpd',
       'St Mary''s Hospital, Manchester', 'clare.mullan@mft.nhs.uk', null),
      ('obstet|gynae|\yO ?& ?G\y', 'Dr Louise Howarth', 'O&G Training Programme Director for Exam Support', 'tpd',
       'Wythenshawe Hospital', 'louise.howarth@mft.nhs.uk', null),
      ('obstet|gynae|\yO ?& ?G\y', 'School of O&G Programme Support Team', 'General enquiries', 'rota_admin',
       'NHS England – North West, Liverpool', 'england.obsgyn.nw@nhs.net', null),
      ('anaesth', 'Dr Geraint Briggs', 'Head of School of Anaesthetics', 'deanery',
       'NHS England – North West', 'geraintbriggs@mac.com', null),
      ('anaesth', 'Dr Janet Slee', 'Associate Head of School of Anaesthetics', 'deanery',
       'Mersey and West Lancashire Teaching Hospitals', 'janet.slee@sthk.nhs.uk', null),
      ('anaesth', 'Dr Carol Kenyon', 'Anaesthetics Training Programme Director, Stage 1 Core (Mersey)', 'tpd',
       'Liverpool Women''s Hospital', 'carol.kenyon1@lwh.nhs.uk', null),
      ('anaesth', 'Dr Sophie Bishop', 'Anaesthetics Training Programme Director, Stage 1 Core (North West)', 'tpd',
       'Manchester University NHS FT', 'sophie.bishop@mft.nhs.uk', null),
      ('anaesth', 'Dr Catherine Gerrard', 'Anaesthetics Training Programme Director, Stages 2–3 Higher (Mersey)', 'tpd',
       'Mersey and West Lancashire Teaching Hospitals', 'catherine.gerrard@merseywestlancs.nhs.uk', null),
      ('anaesth', 'Dr Louise Evans', 'Anaesthetics Training Programme Director, Stages 2–3 Higher (North West)', 'tpd',
       'Stockport NHS FT', 'louise.evans@stockport.nhs.uk', null),
      ('anaesth', 'Dr Andrew Marchetti', 'RCoA Regional Advisor (Mersey)', 'royal_college',
       'Royal College of Anaesthetists', 'a.marchetti@nhs.net', null),
      ('anaesth', 'Dr Oliver Pratt', 'RCoA Regional Advisor (North West)', 'royal_college',
       'Royal College of Anaesthetists', 'oliver.pratt@nca.nhs.uk', null),
      ('anaesth', 'School of Anaesthetics Administration Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.anaesthesia.nw@nhs.net', null),
      ('intensive|\yICM\y', 'Dr Gurinder Tack', 'Associate Dean for Intensive Care Medicine', 'associate_dean',
       'NHS England – North West, Regatta Place, Liverpool', 'gurinder.tack1@nhs.net', null),
      ('intensive|\yICM\y', 'Dr Paul Jeanrenaud', 'Head of School for Intensive Care Medicine', 'deanery',
       'Arrowe Park Hospital', 'p.jeanrenaud@nhs.net', null),
      ('intensive|\yICM\y', 'School of ICM Programme Management Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.icm.nw@nhs.net', '0151 479 2509'),
      ('radiolog', 'Dr Sujesh Bansal', 'Associate Dean for Radiology', 'associate_dean',
       'NHS England – North West, Regatta Place, Liverpool', 'sujesh.bansal@nhs.net', null),
      ('radiolog', 'Dr Dhivya Paravasthu', 'Head of School of Radiology', 'deanery',
       'Mersey and West Lancashire Teaching Hospitals', 'dhivya.paravasthu@nhs.net', null),
      ('radiolog', 'Dr Vamsi Rachapalli', 'Associate Head of School of Radiology; TPD for ST5; SuppoRTT Champion', 'tpd',
       'Mersey and West Lancashire Teaching Hospitals', 'vamsidhar.rachapalli@sthk.nhs.uk', null),
      ('radiolog', 'Dr Sara Meredith', 'Radiology Training Programme Director for ST1; LTFT Lead', 'tpd',
       'NHS England – North West', 'sara.meredith@nhs.net', null),
      ('radiolog', 'Dr David Gendy', 'Radiology Training Programme Director for ST3 (Rotations)', 'tpd',
       'NHS England – North West', 'david.gendy2@nhs.net', null),
      ('radiolog', 'Dr Dekan Albasha', 'Radiology Training Programme Director for ST4 (Study Leave)', 'tpd',
       'NHS England – North West', 'dekan.albasha@liverpool.nhs.uk', null),
      ('radiolog', 'Dr Rosie Cadwallader', 'Training Programme Director for Interventional Radiology', 'tpd',
       'Manchester University NHS FT', 'rosemary.cadwallader@mft.nhs.uk', null),
      ('radiolog', 'Dr Yousef Alwan', 'Radiology Academy and Curriculum Lead', 'tpd',
       'Manchester University NHS FT', 'yousef.alwan@mft.nhs.uk', null),
      ('radiolog', 'School of Radiology Programme Management Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.radiology.nw@nhs.net', null),
      ('radiolog', 'Radiology Academy Team', 'Teaching and Academy enquiries', 'rota_admin',
       'NHS England – North West', 'england.radiologyacademy.nw@nhs.net', null),
      ('psychiat', 'Dr Hannah Cappleman', 'Head of School of Psychiatry', 'deanery',
       'Greater Manchester Mental Health NHS FT', 'Hannah.cappleman2@nhs.net', null),
      ('psychiat', 'School of Psychiatry Programme Support Team', 'General enquiries', 'rota_admin',
       'NHS England – North West, Liverpool', 'england.psychiatry.nw@nhs.net', null),
      ('psychiat', 'Psychiatry Recruitment Team', 'National recruitment enquiries', 'rota_admin',
       'NHS England – North West', 'england.psychiatryrecruitment.nw@nhs.net', null),
      ('internal medicine|\yIMT\y|general medicine|general \(internal\)', 'Dr Raj Parikh', 'Head of the School of Medicine', 'deanery',
       'Northern Care Alliance NHS FT', 'raj.parikh@nca.nhs.uk', null),
      ('internal medicine|\yIMT\y|general medicine|general \(internal\)', 'Professor Simon Carley', 'Postgraduate Associate Dean for Medicine', 'associate_dean',
       'NHS England – North West', 'simon.carley@nhs.net', null),
      ('internal medicine|\yIMT\y|general medicine|general \(internal\)', 'Dr Christopher Cassidy', 'Associate Head of School of Medicine', 'deanery',
       'NHS England – North West', 'christopher.cassidy2@nhs.net', null),
      ('internal medicine|\yIMT\y|general medicine|general \(internal\)', 'Dr Elizabeth Jones', 'Associate Head of School of Medicine', 'deanery',
       'NHS England – North West', 'elizabethjones5@nhs.net', null),
      ('internal medicine|\yIMT\y|general medicine|general \(internal\)', 'School of Medicine Programme Support Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.medicine.nw@nhs.net', null),
      ('emergency', 'Dr David Ross', 'Associate Dean for Emergency Medicine', 'associate_dean',
       'NHS England – North West, Regatta Place, Liverpool', 'david.ross15@nhs.net', null),
      ('emergency', 'Dr Richard Parris', 'Head of School of Emergency Medicine', 'deanery',
       'Royal Bolton Hospital', 'richard.parris2@nhs.net', null),
      ('emergency', 'Dr Sarah Langston', 'Associate Head of School of Emergency Medicine', 'deanery',
       'Mersey and West Lancashire Teaching Hospitals', 'sarah.langston@sthk.nhs.uk', null),
      ('emergency', 'Dr Catherine Jackson', 'EM Training Programme Director, ST4 and higher (North Western)', 'tpd',
       'NHS England – North West', 'catherine.jackson37@nhs.net', null),
      ('emergency', 'Dr Hayley Millar', 'EM Training Programme Director, ST3 (North Western)', 'tpd',
       'Northern Care Alliance NHS FT', 'hayley.millar2@nca.nhs.uk', null),
      ('emergency', 'Dr Alex Nixon', 'EM Training Programme Director, ST3 and ST4+ (Mersey)', 'tpd',
       'Mersey and West Lancashire Teaching Hospitals', 'alexander.nixon@sthk.nhs.uk', null),
      ('emergency', 'School of Emergency Medicine Programme Management Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.accsem.nw@nhs.net', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Guy Makin', 'Head of School of Paediatrics', 'deanery',
       'Manchester University NHS FT', 'Guy.Makin@mft.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Sunil Bagewadi', 'Associate Head of School of Paediatrics', 'deanery',
       'Northern Care Alliance NHS FT', 'Sunil.Bagewadi@nca.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Sahena Haque', 'Associate Dean for Paediatrics', 'associate_dean',
       'NHS England – North West', 'sahena.haque@mft.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Eleanor Derwas', 'Paediatrics Training Programme Director ST1–2 (Mersey)', 'tpd',
       'NHS England – North West', 'ederwas@nhs.net', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Sally Ogden', 'Paediatrics Training Programme Director ST3–4 (Mersey)', 'tpd',
       'Liverpool Women''s Hospital', 'sally.ogden@lwh.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Meriel Tolhurst-Cleaver', 'Paediatrics Training Programme Director ST5–8 (Mersey)', 'tpd',
       'Alder Hey Children''s Hospital', 'Meriel.Tolhurst-Cleaver@alderhey.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Sudhakar Kandasamy', 'Paediatrics Training Programme Director ST1–2 (Manchester)', 'tpd',
       'Mersey and West Lancashire Teaching Hospitals', 'sudhakar.kandasamy@merseywestlancs.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Jill Mant', 'Paediatrics Training Programme Director ST3–4 / Regional Lead (Manchester)', 'tpd',
       'Northern Care Alliance NHS FT', 'Jill.Mant@nca.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'Dr Ranganna Ranganath', 'Paediatrics Training Programme Director ST5–8 (Manchester)', 'tpd',
       'Manchester University NHS FT', 'Ranganath.Ranganna@mft.nhs.uk', null),
      ('\ypaediatrics\y|paediatric medicine', 'School of Paediatrics Programme Support Team', 'General enquiries', 'rota_admin',
       'NHS England – North West', 'england.paediatrics.nw@nhs.net', null)
    ) as v(scope, name, role, category, organisation, email, phone)
  loop
    if r.scope = 'deanery' then
      if not exists (select 1 from public.contacts
                      where deanery_id = _deanery and specialty_id is null and school_id is null
                        and name = r.name and role = r.role) then
        insert into public.contacts (name, role, category, organisation, email, phone, deanery_id)
        values (r.name, r.role, r.category, r.organisation, r.email, r.phone, _deanery);
      end if;
    elsif r.scope like 'school:%' then
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
