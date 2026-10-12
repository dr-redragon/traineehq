-- Assertions for 20261011090000_access_request_improvements.sql.
--
-- Runs on a fresh baseline with its own fixture (see
-- verify-access-requests-schema.sh).

\set ON_ERROR_STOP on

insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000a1', 'Request Deanery', 'RD', 'request-deanery');

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a1', 'Otolaryngology', 'ENT', 'ent'),
  ('5a000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000a1', 'Urology', 'Uro', 'uro');

insert into auth.users (id, email) values
  ('aa000000-0000-4000-8000-00000000000a', 'admin@example.invalid'),
  ('aa000000-0000-4000-8000-00000000000f', 'facilitator@example.invalid'),
  ('aa000000-0000-4000-8000-00000000000e', 'Trainee@Example.invalid'),
  ('aa000000-0000-4000-8000-00000000000b', 'other@example.invalid');

insert into public.user_roles (user_id, role, deanery_id) values
  ('aa000000-0000-4000-8000-00000000000a', 'admin', 'd0000000-0000-4000-8000-0000000000a1'),
  ('aa000000-0000-4000-8000-00000000000f', 'facilitator', null);

insert into public.facilitator_specialties (user_id, specialty_id)
values ('aa000000-0000-4000-8000-00000000000f', '5a000000-0000-4000-8000-000000000001');

insert into public.trainee_specialties (user_id, specialty_id)
values ('aa000000-0000-4000-8000-00000000000e', '5a000000-0000-4000-8000-000000000001');

-- ----------------------------------------------------------------------------
-- 1. A registered email is recognised, case-insensitively — but only by the
--    service role. Since 20261012110000 a browser cannot ask, and a request
--    from a registered address (or a second pending one) is silently dropped
--    rather than refused, so the insert reveals nothing either.
-- ----------------------------------------------------------------------------
begin;
set local role service_role;
do $$
begin
  if not public.email_has_account('  trainee@example.INVALID ') then
    raise exception 'FAIL 1: registered email not recognised';
  end if;
  if public.email_has_account('nobody@example.invalid') then
    raise exception 'FAIL 1: unregistered email reported as registered';
  end if;
end $$;
rollback;

begin;
set local role anon;
do $$
begin
  begin
    perform public.email_has_account('trainee@example.invalid');
    raise exception 'FAIL 1: anon can ask whether an address is registered';
  exception when insufficient_privilege then null;
  end;

  -- No error for a registered address: the row is simply not stored.
  insert into public.access_requests (first_name, last_name, email)
  values ('T', 'R', 'trainee@example.invalid');

  insert into public.access_requests (first_name, last_name, email)
  values ('New', 'Person', 'new@example.invalid');
  -- A second pending request from the same address is dropped the same way.
  insert into public.access_requests (first_name, last_name, email)
  values ('New', 'Again', 'NEW@example.invalid');
end $$;
commit;

do $$
declare _n int;
begin
  select count(*) into _n from public.access_requests where lower(email) = 'trainee@example.invalid';
  if _n <> 0 then raise exception 'FAIL 1: a request for an existing account was stored'; end if;
  select count(*) into _n from public.access_requests where lower(email) = 'new@example.invalid';
  if _n <> 1 then raise exception 'FAIL 1: expected one pending request for a new address, found %', _n; end if;
  raise notice 'ok  1  existing accounts and duplicate requests are dropped silently; new emails are kept';
end $$;

-- ----------------------------------------------------------------------------
-- 2. A trainee lists and requests a specialty they cannot see, and only that
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'aa000000-0000-4000-8000-00000000000e';
do $$
declare _ids uuid[];
begin
  select array_agg(id) into _ids from public.requestable_specialties();
  if _ids is distinct from array['5a000000-0000-4000-8000-000000000002'::uuid] then
    raise exception 'FAIL 2: requestable_specialties returned %', _ids;
  end if;

  insert into public.specialty_access_requests (user_id, specialty_id, reason)
  values ('aa000000-0000-4000-8000-00000000000e', '5a000000-0000-4000-8000-000000000002', 'Rotation');

  begin
    insert into public.specialty_access_requests (user_id, specialty_id)
    values ('aa000000-0000-4000-8000-00000000000e', '5a000000-0000-4000-8000-000000000001');
    raise exception 'FAIL 2: requested a specialty already held';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.specialty_access_requests (user_id, specialty_id)
    values ('aa000000-0000-4000-8000-00000000000b', '5a000000-0000-4000-8000-000000000002');
    raise exception 'FAIL 2: requested on somebody else''s behalf';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.specialty_access_requests (user_id, specialty_id)
    values ('aa000000-0000-4000-8000-00000000000e', '5a000000-0000-4000-8000-000000000002');
    raise exception 'FAIL 2: a second open request was accepted';
  exception when unique_violation then null;
  end;

  begin
    perform public.decide_specialty_access_request(
      (select id from public.specialty_access_requests limit 1), true, null);
    raise exception 'FAIL 2: trainee approved their own request';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok  2  trainee requests a specialty they lack, and nothing else';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 3. The ENT facilitator cannot see or decide a Uro request
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'aa000000-0000-4000-8000-00000000000f';
do $$
declare _n int;
begin
  select count(*) into _n from public.specialty_access_requests;
  if _n <> 0 then raise exception 'FAIL 3: facilitator sees another specialty''s requests'; end if;
  raise notice 'ok  3  facilitator does not see other specialties'' requests';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 4. The deanery admin approves, and the trainee is enrolled
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'aa000000-0000-4000-8000-00000000000a';
do $$
declare _id uuid;
begin
  select id into _id from public.specialty_access_requests where status = 'pending';
  if _id is null then raise exception 'FAIL 4: admin cannot see the pending request'; end if;

  begin
    perform public.decide_specialty_access_request(_id, false, '  ');
    raise exception 'FAIL 4: declined without a reason';
  exception when raise_exception then null;
  end;

  perform public.decide_specialty_access_request(_id, true, null);

  if not exists (
    select 1 from public.trainee_specialties
    where user_id = 'aa000000-0000-4000-8000-00000000000e'
      and specialty_id = '5a000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'FAIL 4: approval did not enrol the trainee';
  end if;

  begin
    perform public.decide_specialty_access_request(_id, false, 'late');
    raise exception 'FAIL 4: a decided request was decided again';
  exception when raise_exception then null;
  end;

  raise notice 'ok  4  admin approval enrols the trainee, once';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 5. Requests cannot be edited directly
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'aa000000-0000-4000-8000-00000000000e';
do $$
begin
  begin
    update public.specialty_access_requests set status = 'approved';
    raise exception 'FAIL 5: request updated directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  5  no direct updates';
end $$;
commit;
