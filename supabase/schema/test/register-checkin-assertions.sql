-- Assertions for 20261011140000_register_checkin_hardening.sql.
--
-- The point: holding a sign-in link lets somebody sign THEMSELVES in. It must
-- not let them repoint another trainee's address, and it must not reach the
-- attendance map except through register-api, which is where the sign-in
-- window and every other check live.
--
-- Runs on a fresh baseline with its own fixture (see verify-security-fixes.sh).

\set ON_ERROR_STOP on

insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000a2', 'Checkin Deanery', 'CK', 'checkin-deanery');

insert into public.specialties (id, deanery_id, name, short_name, slug)
values ('5a000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000a2',
        'Otolaryngology', 'ENT', 'ent');

insert into public.registers (id, deanery_id, specialty_id, name, slug)
values ('9a000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000a2',
        '5a000000-0000-4000-8000-000000000002', 'CK · ENT', 'checkin-ent');

insert into public.register_stores (register_id, data) values
  ('9a000000-0000-4000-8000-000000000002', jsonb_build_object(
     'trainees', jsonb_build_array(
       jsonb_build_object('id','has','name','Has Address','email','real@example.invalid'),
       jsonb_build_object('id','none','name','No Address','email','')),
     'sessions', jsonb_build_array(jsonb_build_object('id','s1','month','2026-10','title','Day')),
     'attendance', '{}'::jsonb, 'excused', '[]'::jsonb, 'status', '[]'::jsonb));

insert into public.register_sessions (id, register_id, title, session_date, local_id)
values ('a6000000-0000-4000-8000-000000000002', '9a000000-0000-4000-8000-000000000002',
        'Teaching day', '2026-10-11', 's1');

-- ----------------------------------------------------------------------------
-- 1. A typed address never replaces the one on file
-- ----------------------------------------------------------------------------
begin;
set local role service_role;

do $$
declare _got text; _stored text;
begin
  _got := public.register_resolve_trainee_email(
    'a6000000-0000-4000-8000-000000000002', 'has', 'attacker@example.invalid');

  select t->>'email' into _stored
    from public.register_stores st, jsonb_array_elements(st.data->'trainees') t
   where st.register_id = '9a000000-0000-4000-8000-000000000002' and t->>'id' = 'has';

  if _stored is distinct from 'real@example.invalid' then
    raise exception 'FAIL 1: a typed address overwrote the stored one (now %)', _stored;
  end if;
  if _got is distinct from 'real@example.invalid' then
    raise exception 'FAIL 1: the resolver returned the typed address % over the stored one', _got;
  end if;
  raise notice 'ok  1  a typed address cannot replace the one on file';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 2. ...but still fills an empty one, so first-time sign-in keeps working
-- ----------------------------------------------------------------------------
begin;
set local role service_role;

do $$
declare _stored text;
begin
  perform public.register_resolve_trainee_email(
    'a6000000-0000-4000-8000-000000000002', 'none', 'First@Example.invalid');

  select t->>'email' into _stored
    from public.register_stores st, jsonb_array_elements(st.data->'trainees') t
   where st.register_id = '9a000000-0000-4000-8000-000000000002' and t->>'id' = 'none';

  if _stored is distinct from 'first@example.invalid' then
    raise exception 'FAIL 2: an empty address was not filled (got %)', _stored;
  end if;
  raise notice 'ok  2  an empty address is still filled at first sign-in';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. Neither browser role can call the check-in writer directly
-- ----------------------------------------------------------------------------
do $$
declare _r text;
begin
  foreach _r in array array['anon', 'authenticated'] loop
    if has_function_privilege(_r, 'public.register_record_checkin(uuid, text, text)', 'execute') then
      raise exception 'FAIL 3: % can call register_record_checkin directly', _r;
    end if;
    if has_function_privilege(_r, 'public.register_resolve_trainee_email(uuid, text, text)', 'execute') then
      raise exception 'FAIL 3: % can call register_resolve_trainee_email', _r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.register_record_checkin(uuid, text, text)', 'execute') then
    raise exception 'FAIL 3: register-api (service_role) lost register_record_checkin';
  end if;
  raise notice 'ok  3  check-in is written only through register-api';
end $$;

-- ----------------------------------------------------------------------------
-- 4. The definer path that register_enrol_trainee() takes still marks present
-- ----------------------------------------------------------------------------
begin;
set local role service_role;

do $$
declare _att jsonb;
begin
  perform public.register_enrol_trainee(
    'a6000000-0000-4000-8000-000000000002', 'Has Address', '', 'ST5');

  select data->'attendance' into _att from public.register_stores
   where register_id = '9a000000-0000-4000-8000-000000000002';
  if _att->'has|s1' is null then
    raise exception 'FAIL 4: enrolling an existing name no longer marks them present';
  end if;
  raise notice 'ok  4  sign-in by name still records attendance';
end $$;
rollback;
