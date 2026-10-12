-- Assertions for 20261012090000_register_owner_admission.sql.
--
-- The point: only a register's owners decide who may read it — by direct
-- insert and by approving a request alike. Editors keep their editing.

\set ON_ERROR_STOP on

-- Fixture: a register with an owner O and an editor E; an outsider X; and R,
-- who has asked to join.
insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000b7', 'Admit Deanery', 'AD', 'admit-deanery');
insert into public.specialties (id, deanery_id, name, short_name, slug)
values ('5b700000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b7', 'ENT', 'ENT', 'ent');
insert into public.registers (id, deanery_id, specialty_id, name, slug)
values ('9b700000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b7',
        '5b700000-0000-4000-8000-000000000001', 'AD · ENT', 'admit-ent');
insert into public.register_stores (register_id) values ('9b700000-0000-4000-8000-000000000001');

insert into auth.users (id, email) values
  ('b7000000-0000-4000-8000-00000000000a', 'owner@example.invalid'),
  ('b7000000-0000-4000-8000-00000000000e', 'editor@example.invalid'),
  ('b7000000-0000-4000-8000-000000000009', 'outsider@example.invalid'),
  ('b7000000-0000-4000-8000-00000000000b', 'requester@example.invalid');

insert into public.register_members (register_id, user_id, role) values
  ('9b700000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-00000000000a', 'owner'),
  ('9b700000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-00000000000e', 'editor');

insert into public.register_access_requests (id, register_id, user_id)
values ('a7000000-0000-4000-8000-000000000001', '9b700000-0000-4000-8000-000000000001',
        'b7000000-0000-4000-8000-00000000000b');

-- ----------------------------------------------------------------------------
-- 1. An editor can neither admit somebody nor approve a request
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'b7000000-0000-4000-8000-00000000000e';
do $$
begin
  begin
    insert into public.register_members (register_id, user_id, role)
    values ('9b700000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000009', 'editor');
    raise exception 'FAIL 1: an editor admitted somebody directly';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.decide_register_access('a7000000-0000-4000-8000-000000000001', true, null);
    raise exception 'FAIL 1: an editor approved a join request';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  raise notice 'ok  1  an editor cannot admit anybody';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 2. An owner can do both
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'b7000000-0000-4000-8000-00000000000a';
do $$
begin
  insert into public.register_members (register_id, user_id, role)
  values ('9b700000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000009', 'editor');

  perform public.decide_register_access('a7000000-0000-4000-8000-000000000001', true, null);
  perform 1 from public.register_members
   where register_id = '9b700000-0000-4000-8000-000000000001'
     and user_id = 'b7000000-0000-4000-8000-00000000000b';
  if not found then raise exception 'FAIL 2: an owner''s approval did not admit the requester'; end if;

  raise notice 'ok  2  an owner admits directly and by approving a request';
end $$;
rollback;
