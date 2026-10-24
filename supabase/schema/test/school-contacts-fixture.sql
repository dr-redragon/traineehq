-- Fixture for school-contacts-assertions.sql: a North West deanery with a mix
-- of surgical and non-surgical specialties, loaded before the migration runs.
insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000e1', 'North West', 'NW', 'north-west');

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5e000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e1', 'Otolaryngology', 'ENT', 'nw-ent'),
  ('5e000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000e1', 'Urology', 'Urology', 'nw-uro'),
  ('5e000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-0000000000e1', 'Trauma & Orthopaedics', 'T&O', 'nw-tando'),
  ('5e000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-0000000000e1', 'Paediatric Surgery', 'Paeds Surg', 'nw-paeds-surg'),
  ('5e000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-0000000000e1', 'Ophthalmology', 'Ophth', 'nw-ophth'),
  ('5e000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-0000000000e1', 'Obstetrics & Gynaecology', 'O&G', 'nw-og'),
  ('5e000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-0000000000e1', 'Psychiatry', 'Psych', 'nw-psych'),
  ('5e000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-0000000000e1', 'Neurology', 'Neuro', 'nw-neuro'),
  ('5e000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-0000000000e1', 'Cardiology', 'Cardio', 'nw-cardio');

insert into auth.users (id, email) values
  ('cc000000-0000-4000-8000-0000000000a2', 'nw-admin@example.invalid'),
  ('cc000000-0000-4000-8000-0000000000f2', 'nw-facilitator@example.invalid');

insert into public.user_roles (user_id, role, deanery_id) values
  ('cc000000-0000-4000-8000-0000000000a2', 'admin', 'd0000000-0000-4000-8000-0000000000e1'),
  ('cc000000-0000-4000-8000-0000000000f2', 'facilitator', null);

insert into public.facilitator_specialties (user_id, specialty_id)
values ('cc000000-0000-4000-8000-0000000000f2', '5e000000-0000-4000-8000-000000000001');
