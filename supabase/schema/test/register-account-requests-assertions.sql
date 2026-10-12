-- Assertions for 20261012150000_register_account_requests.sql.
--
-- The point: an account request that names a register — whose approval makes
-- somebody a facilitator — is seen and decided by the deanery's admins only,
-- and nobody can attach a register to a request, or detach one, from a browser.

\set ON_ERROR_STOP on

insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000e5', 'Account Deanery', 'AC', 'account-deanery');
insert into public.specialties (id, deanery_id, name, short_name, slug)
values ('5e500000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e5', 'ENT', 'ENT', 'ent');
insert into public.registers (id, deanery_id, specialty_id, name, slug)
values ('9e500000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e5',
        '5e500000-0000-4000-8000-000000000001', 'AC · ENT', 'account-ent');

insert into auth.users (id, email) values
  ('e5000000-0000-4000-8000-00000000000a', 'admin@example.invalid'),
  ('e5000000-0000-4000-8000-00000000000f', 'fac@example.invalid'),
  ('e5000000-0000-4000-8000-00000000000b', 'owner@example.invalid');
insert into public.user_roles (user_id, role, deanery_id) values
  ('e5000000-0000-4000-8000-00000000000a', 'admin', 'd0000000-0000-4000-8000-0000000000e5'),
  ('e5000000-0000-4000-8000-00000000000f', 'facilitator', 'd0000000-0000-4000-8000-0000000000e5');
insert into public.facilitator_specialties (user_id, specialty_id)
values ('e5000000-0000-4000-8000-00000000000f', '5e500000-0000-4000-8000-000000000001');

-- As register-invite files them, under the service role.
insert into public.access_requests
  (id, first_name, last_name, email, specialty_id, deanery_id, register_id, register_role, requested_by)
values
  ('ae500000-0000-4000-8000-000000000001', 'R', 'Q', 'colleague@example.invalid',
   '5e500000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e5',
   '9e500000-0000-4000-8000-000000000001', 'editor', 'e5000000-0000-4000-8000-00000000000b');
insert into public.access_requests (id, first_name, last_name, email, specialty_id, deanery_id)
values ('ae500000-0000-4000-8000-000000000002', 'O', 'R', 'ordinary@example.invalid',
        '5e500000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e5');

-- ----------------------------------------------------------------------------
-- 1. The public form cannot name a register or a requester
-- ----------------------------------------------------------------------------
begin;
set local role anon;
do $$
begin
  begin
    insert into public.access_requests (first_name, last_name, email, register_id)
    values ('A', 'B', 'sneaky@example.invalid', '9e500000-0000-4000-8000-000000000001');
    raise exception 'FAIL 1: anon attached a register to an access request';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.access_requests (first_name, last_name, email, requested_by)
    values ('A', 'B', 'sneaky@example.invalid', 'e5000000-0000-4000-8000-00000000000b');
    raise exception 'FAIL 1: anon set requested_by';
  exception when insufficient_privilege then null;
  end;
  insert into public.access_requests (first_name, last_name, email, reason)
  values ('A', 'B', 'plain@example.invalid', 'please');
  raise notice 'ok  1  the public form can file only the applicant''s own details';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 2. A facilitator does not see or decide a register request; still sees others
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'e5000000-0000-4000-8000-00000000000f';
do $$
declare _ids uuid[]; _n int;
begin
  select array_agg(id order by id) into _ids from public.access_requests;
  if _ids is distinct from array['ae500000-0000-4000-8000-000000000002'::uuid] then
    raise exception 'FAIL 2: facilitator sees requests %', _ids;
  end if;
  update public.access_requests set status = 'approved'
   where id = 'ae500000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 2: facilitator approved a request that grants a facilitator role'; end if;
  raise notice 'ok  2  facilitators cannot see or approve register account requests';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. The deanery's admin decides it, and cannot rewrite what it is for
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'e5000000-0000-4000-8000-00000000000a';
do $$
declare _n int;
begin
  update public.access_requests set status = 'approved', review_note = 'fine'
   where id = 'ae500000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 3: the deanery admin cannot approve it'; end if;
  begin
    update public.access_requests set register_id = null
     where id = 'ae500000-0000-4000-8000-000000000001';
    raise exception 'FAIL 3: a reviewer detached the register from a request';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  3  the deanery admin decides it and cannot change what it grants';
end $$;
rollback;
