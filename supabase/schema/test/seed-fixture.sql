-- Fixture for the Stage 2 seed migration (20260907100000_seed_first_register.sql).
--
-- Stands up the state that migration expects to find on the live project: an ENT
-- specialty in a deanery, the operator's account, and the Lovable-era
-- public.register_store table holding the real register blob.
--
-- register_store is deliberately absent from 0001_traineehq_baseline.sql — it is
-- legacy, not part of the schema the app builds from — so it is created here to
-- reproduce a project that still carries it.

create table if not exists public.register_store (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.register_store (id, data) values (
  'default',
  jsonb_build_object(
    'trainees', jsonb_build_array(
      jsonb_build_object('id', 't1', 'name', 'A Trainee'),
      jsonb_build_object('id', 't2', 'name', 'B Trainee'),
      jsonb_build_object('id', 't3', 'name', 'C Trainee')
    ),
    'sessions', jsonb_build_array(
      jsonb_build_object('id', 's1', 'month', '2025-09', 'title', 'Head & neck'),
      jsonb_build_object('id', 's2', 'month', '2025-10', 'title', 'Otology')
    ),
    'attendance', jsonb_build_object('t1|s1', jsonb_build_object('grade', 'ST6')),
    'excused',    jsonb_build_array(),
    'status',     jsonb_build_array()
  )
) on conflict (id) do nothing;

insert into public.deaneries (id, name, short_name, slug) values
  ('d0000000-0000-4000-8000-0000000000aa', 'Mersey Deanery', 'Mersey', 'mersey')
on conflict do nothing;

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('50000000-0000-4000-8000-0000000000aa',
   'd0000000-0000-4000-8000-0000000000aa',
   'Otolaryngology', 'ENT', 'ent')
on conflict do nothing;

-- A second specialty with no register, to prove the seed picks ENT and not
-- simply the first row it finds.
insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('50000000-0000-4000-8000-0000000000bb',
   'd0000000-0000-4000-8000-0000000000aa',
   'Urology', 'Urol', 'urology')
on conflict do nothing;

-- The operator. handle_new_user() gives them a profile and a 'trainee' role;
-- the migration is what adds super_admin on top.
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-0000000000aa', 'mabdelaziz@outlook.com')
on conflict do nothing;

-- Somebody else, to prove the seed grants nothing to anyone but the operator.
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-0000000000bb', 'someone.else@example.com')
on conflict do nothing;
