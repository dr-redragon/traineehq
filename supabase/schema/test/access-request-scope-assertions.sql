-- Assertions for 20261012120000_access_requests_facilitator_scope.sql.
--
-- The point: a facilitator sees and decides the access requests for their own
-- specialties, and no others — not another specialty's, not general ones.

\set ON_ERROR_STOP on

insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000d9', 'Scope Deanery', 'SD', 'scope-deanery');
insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5d900000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d9', 'ENT', 'ENT', 'ent'),
  ('5d900000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000d9', 'Urology', 'Uro', 'uro');

insert into auth.users (id, email)
values ('d9000000-0000-4000-8000-00000000000f', 'fac@example.invalid');
insert into public.user_roles (user_id, role) values ('d9000000-0000-4000-8000-00000000000f', 'facilitator');
insert into public.facilitator_specialties (user_id, specialty_id)
values ('d9000000-0000-4000-8000-00000000000f', '5d900000-0000-4000-8000-000000000001');

insert into public.access_requests (id, first_name, last_name, email, specialty_id, deanery_id) values
  ('ad900000-0000-4000-8000-000000000001', 'E', 'N', 'ent-applicant@example.invalid',
   '5d900000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d9'),
  ('ad900000-0000-4000-8000-000000000002', 'U', 'R', 'uro-applicant@example.invalid',
   '5d900000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000d9'),
  ('ad900000-0000-4000-8000-000000000003', 'G', 'N', 'general-applicant@example.invalid',
   null, 'd0000000-0000-4000-8000-0000000000d9');

begin;
set local role authenticated;
set local test.uid = 'd9000000-0000-4000-8000-00000000000f';
do $$
declare _ids uuid[]; _n int;
begin
  select array_agg(id order by id) into _ids from public.access_requests;
  if _ids is distinct from array['ad900000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'FAIL 1: facilitator sees requests %', _ids;
  end if;

  update public.access_requests set review_note = 'x'
   where id in ('ad900000-0000-4000-8000-000000000002', 'ad900000-0000-4000-8000-000000000003');
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 1: facilitator changed a request outside their specialty'; end if;

  update public.access_requests set review_note = 'ok' where id = 'ad900000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 1: facilitator cannot work their own specialty''s request'; end if;

  begin
    update public.access_requests set specialty_id = '5d900000-0000-4000-8000-000000000002'
     where id = 'ad900000-0000-4000-8000-000000000001';
    raise exception 'FAIL 1: facilitator moved a request to a specialty they do not facilitate';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok  1  a facilitator sees and decides only their own specialties'' requests';
end $$;
rollback;
