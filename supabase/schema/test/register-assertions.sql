-- Assertions for 20260907090000_register_multi_tenancy.sql.
--
-- Run by scripts/verify-register-schema.sh against a throwaway database that has
-- had stubs.sql, the baseline and the migration applied. Every check raises on
-- failure, so with ON_ERROR_STOP=1 the first broken rule stops the run.
--
-- The rules being proved are the ones the design turns on: membership is an
-- explicit grant that no TraineeHQ role confers, there is no god-mode read, the
-- directory is browsable by people with no access, and concurrent saves cannot
-- silently overwrite each other.

\set ON_ERROR_STOP on
\timing off

-- ----------------------------------------------------------------------------
-- Fixture
-- ----------------------------------------------------------------------------
begin;

insert into public.deaneries (id, name, short_name, slug) values
  ('d0000000-0000-4000-8000-000000000001', 'Mersey Deanery', 'Mersey', 'mersey'),
  ('d0000000-0000-4000-8000-000000000002', 'Wessex Deanery', 'Wessex', 'wessex');

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('50000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Otolaryngology', 'ENT', 'ent'),
  ('50000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Urology', 'Urol', 'urology'),
  ('50000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'Otolaryngology', 'ENT', 'ent');

-- handle_new_user() gives every one of these a profile and a 'trainee' role.
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000001', 'super@example.com'),
  ('11111111-0000-4000-8000-000000000002', 'admin.mersey@example.com'),
  ('11111111-0000-4000-8000-000000000003', 'trainee.ent@example.com'),
  ('11111111-0000-4000-8000-000000000004', 'outsider@example.com');

insert into public.user_roles (user_id, role, deanery_id) values
  ('11111111-0000-4000-8000-000000000001', 'super_admin', null),
  ('11111111-0000-4000-8000-000000000002', 'admin', 'd0000000-0000-4000-8000-000000000001');

-- The trainee is enrolled on Mersey ENT; the outsider is enrolled on nothing.
insert into public.trainee_specialties (user_id, specialty_id) values
  ('11111111-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001');

commit;

-- ----------------------------------------------------------------------------
-- 1. A deanery admin can create a register, and becomes its owner
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
declare _id uuid;
begin
  _id := public.create_register('d0000000-0000-4000-8000-000000000001',
                                '50000000-0000-4000-8000-000000000001', null);

  if _id is null then
    raise exception 'FAIL 1: create_register returned null';
  end if;

  if not public.is_register_owner('11111111-0000-4000-8000-000000000002', _id) then
    raise exception 'FAIL 1: creator is not the owner';
  end if;

  if not exists (select 1 from public.register_stores where register_id = _id) then
    raise exception 'FAIL 1: no register_stores row was created';
  end if;

  if (select name from public.registers where id = _id) <> 'Mersey · Otolaryngology' then
    raise exception 'FAIL 1: unexpected default name %',
      (select name from public.registers where id = _id);
  end if;

  if (select slug from public.registers where id = _id) <> 'mersey-ent' then
    raise exception 'FAIL 1: unexpected slug %',
      (select slug from public.registers where id = _id);
  end if;

  raise notice 'ok  1  admin creates a register and owns it';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 2. One register per specialty; the duplicate becomes "request access instead"
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.create_register('d0000000-0000-4000-8000-000000000001',
                                 '50000000-0000-4000-8000-000000000001', null);
  raise exception 'FAIL 2: a second register was allowed for the same specialty in the same deanery';
exception when others then
  if sqlerrm not like 'A register already exists%' then raise; end if;
  raise notice 'ok  2  a duplicate in the same deanery is refused';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. An admin cannot create a register outside their own deanery
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.create_register('d0000000-0000-4000-8000-000000000002',
                                 '50000000-0000-4000-8000-000000000003', null);
  raise exception 'FAIL 3: Mersey admin created a register in Wessex';
exception when others then
  if sqlerrm not like 'That is not a deanery%' then raise; end if;
  raise notice 'ok  3  admin confined to their own deanery';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. A trainee enrolled on the specialty still has NO access to its register.
--    Enrolment is not membership; membership is an explicit grant.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  if (select count(*) from public.register_stores) <> 0 then
    raise exception 'FAIL 4: an enrolled trainee can read register data';
  end if;
  raise notice 'ok  4  enrolment does not confer register access';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 5. No god-mode read: a super_admin sees no register data either.
--    This is the assertion that decision 4 lives or dies on.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';

do $$
begin
  if (select count(*) from public.register_stores) <> 0 then
    raise exception 'FAIL 5: a super_admin can read register data without a grant';
  end if;
  raise notice 'ok  5  super_admin has no implicit read';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 6. The directory is visible to someone with no access and no enrolment.
--    A view joining `specialties` would have filtered this to nothing.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000004';

do $$
declare _row record;
begin
  select * into _row from public.register_directory() limit 1;

  if _row.id is null then
    raise exception 'FAIL 6: the directory is empty for a non-member';
  end if;

  if _row.deanery_name <> 'Mersey Deanery' or _row.specialty_name <> 'Otolaryngology' then
    raise exception 'FAIL 6: directory did not resolve deanery/specialty names';
  end if;

  if _row.i_am_member then
    raise exception 'FAIL 6: a non-member is reported as a member';
  end if;

  if _row.member_count <> 1 then
    raise exception 'FAIL 6: expected 1 member, got %', _row.member_count;
  end if;

  raise notice 'ok  6  directory browsable without access';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 7. Request access
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
declare _req uuid;
begin
  _req := public.request_register_access(
    (select id from public.registers where slug = 'mersey-ent'), 'I organise the ENT teaching day');

  if _req is null then
    raise exception 'FAIL 7: request_register_access returned null';
  end if;
  raise notice 'ok  7  trainee can request access';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 8. A requester who is not a member is stopped by the membership gate.
--    request_register_access() refuses anyone who is already a member, so this
--    is the path an ordinary self-approval attempt actually takes.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  perform public.decide_register_access(
    (select id from public.register_access_requests where status = 'pending' limit 1), true, null);
  raise exception 'FAIL 8: a non-member requester decided their own request';
exception when others then
  if sqlerrm not like 'Only members of that register%' then raise; end if;
  raise notice 'ok  8  non-member requester cannot self-approve';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 8b. The narrow case the self-approval guard actually exists for: an owner adds
--     someone directly while they still have a request outstanding, so they are
--     a member AND the subject of a pending request. The membership gate lets
--     them through; the self-approval guard must not.
--
--     Doubles as the test of the "owners add members" insert policy.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

insert into public.register_members (register_id, user_id, role, granted_by)
values (
  (select id from public.registers where slug = 'mersey-ent'),
  '11111111-0000-4000-8000-000000000003',
  'editor',
  '11111111-0000-4000-8000-000000000002'
);

set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  if not public.is_register_member(
       '11111111-0000-4000-8000-000000000003',
       (select id from public.registers where slug = 'mersey-ent')) then
    raise exception 'FAIL 8b: the owner could not add a member directly';
  end if;

  perform public.decide_register_access(
    (select id from public.register_access_requests where status = 'pending' limit 1), true, null);
  raise exception 'FAIL 8b: a member approved their own outstanding request';
exception when others then
  if sqlerrm not like 'You cannot approve your own%' then raise; end if;
  raise notice 'ok  8b member cannot approve their own request';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 9. A second open request is refused
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  perform public.request_register_access(
    (select id from public.registers where slug = 'mersey-ent'), null);
  raise exception 'FAIL 9: a duplicate pending request was allowed';
exception when others then
  if sqlerrm not like 'You already have a request waiting%' then raise; end if;
  raise notice 'ok  9  duplicate pending request refused';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 10. A non-member cannot decide a request — proved at both layers.
--
--     (a) RLS does not even show them the pending row, so a client cannot list
--         the queue of a register it does not belong to.
--     (b) And knowing the id anyway does not help: the function refuses it.
--
--     The id is stashed in a transaction-local setting while still superuser,
--     because step (a) is precisely the reason the role being tested cannot
--     look it up for itself.
-- ----------------------------------------------------------------------------
begin;
do $$
begin
  perform set_config(
    'test.req_id',
    (select id::text from public.register_access_requests where status = 'pending' limit 1),
    true);
end $$;

set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';   -- super_admin

do $$
begin
  if (select count(*) from public.register_access_requests) <> 0 then
    raise exception 'FAIL 10a: a non-member can see another register''s request queue';
  end if;
  raise notice 'ok 10a non-member cannot see the request queue';

  perform public.decide_register_access(current_setting('test.req_id')::uuid, true, null);
  raise exception 'FAIL 10b: a non-member (super_admin) decided a request';
exception when others then
  if sqlerrm like 'FAIL 10%' then raise; end if;
  if sqlerrm not like 'Only members of that register%' then raise; end if;
  raise notice 'ok 10b non-member cannot decide requests';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 11. The owner approves, and the trainee becomes an editor with read access
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.decide_register_access(
    (select id from public.register_access_requests where status = 'pending' limit 1),
    true, 'Confirmed with the TPD');
  raise notice 'ok 11  owner approved the request';
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  if (select count(*) from public.register_stores) <> 1 then
    raise exception 'FAIL 11: approved editor still cannot read the register';
  end if;

  if (select role from public.register_members
       where user_id = '11111111-0000-4000-8000-000000000003') <> 'editor' then
    raise exception 'FAIL 11: approved member did not land as editor';
  end if;

  raise notice 'ok 11b approved editor can read the register';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 12. save_register honours the version guard
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
declare
  _rid uuid := (select id from public.registers where slug = 'mersey-ent');
  _v   bigint;
begin
  _v := public.save_register(_rid, '{"trainees":[{"id":"a1","name":"A Trainee"}]}'::jsonb, 1);

  if _v <> 2 then
    raise exception 'FAIL 12: expected version 2, got %', _v;
  end if;

  if (select data -> 'trainees' -> 0 ->> 'name' from public.register_stores where register_id = _rid)
     <> 'A Trainee' then
    raise exception 'FAIL 12: the blob did not persist';
  end if;
  raise notice 'ok 12  save advances the version';

  -- A second writer still holding version 1 must be refused, not silently win.
  begin
    perform public.save_register(_rid, '{"trainees":[]}'::jsonb, 1);
    raise exception 'FAIL 12: a stale write was accepted';
  exception when others then
    if sqlerrm not like 'This register was saved by somebody else%' then raise; end if;
    raise notice 'ok 12b stale write refused';
  end;
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 13. A non-member cannot write, even with the right version
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000004';

do $$
begin
  perform public.save_register(
    (select id from public.registers where slug = 'mersey-ent'), '{}'::jsonb, 2);
  raise exception 'FAIL 13: a non-member wrote to a register';
exception when others then
  if sqlerrm not like 'You do not have access%' then raise; end if;
  raise notice 'ok 13  non-member cannot write';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 14. register_stores cannot be written directly, bypassing the version guard
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  -- Asserted as an outcome, not a mechanism. Before 20260907130000 the grant is
  -- present and row-level security refuses the row; after it, the grant is gone
  -- and the statement is rejected outright. Either way the blob is unchanged,
  -- and either way save_register()'s version guard cannot be sidestepped.
  begin
    update public.register_stores set data = '{"hacked":true}'::jsonb
     where register_id = (select id from public.registers where slug = 'mersey-ent');
  exception when insufficient_privilege then
    null;
  end;

  if (select data ? 'hacked' from public.register_stores
       where register_id = (select id from public.registers where slug = 'mersey-ent')) then
    raise exception 'FAIL 14: a direct update bypassed save_register';
  end if;
  raise notice 'ok 14  direct writes to register_stores change nothing';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 15. An editor cannot remove the owner; the owner is not left removable
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
declare _rid uuid := (select id from public.registers where slug = 'mersey-ent');
begin
  begin
    perform public.remove_register_member(_rid, '11111111-0000-4000-8000-000000000002');
    raise exception 'FAIL 15: an editor removed the owner';
  exception when others then
    if sqlerrm not like 'Only an owner can remove%' then raise; end if;
    raise notice 'ok 15  editor cannot remove the owner';
  end;

  -- ...but may remove themselves.
  perform public.remove_register_member(_rid, '11111111-0000-4000-8000-000000000003');
  if public.is_register_member('11111111-0000-4000-8000-000000000003', _rid) then
    raise exception 'FAIL 15: leaving the register did not take effect';
  end if;
  raise notice 'ok 15b a member can leave';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 16. The last owner cannot be removed
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.remove_register_member(
    (select id from public.registers where slug = 'mersey-ent'),
    '11111111-0000-4000-8000-000000000002');
  raise exception 'FAIL 16: the only owner was removed';
exception when others then
  if sqlerrm not like 'This is the register''s only owner%' then raise; end if;
  raise notice 'ok 16  last owner protected';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 17. can_create_register: an editor may start their own register
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  if not public.can_create_register('11111111-0000-4000-8000-000000000003') then
    raise exception 'FAIL 17: an existing member cannot create a register';
  end if;

  if public.can_create_register('11111111-0000-4000-8000-000000000004') then
    raise exception 'FAIL 17: someone with no admin role and no membership can create one';
  end if;

  raise notice 'ok 17  creation capability is membership-or-admin';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 18. anon reaches none of it
-- ----------------------------------------------------------------------------
begin;
set local role anon;

do $$
begin
  begin
    perform public.register_directory();
    raise exception 'FAIL 18: anon can call register_directory()';
  exception when insufficient_privilege then
    raise notice 'ok 18  anon cannot call register_directory()';
  end;
end $$;
rollback;

-- Asserted as an outcome. Until 20260907130000 strips the grants Supabase hands
-- out by default, anon may issue the statement and row-level security returns
-- nothing; afterwards the statement itself is refused. Reaching no data is the
-- property; grants-assertions.sql checks the grant layer separately.
begin;
set local role anon;
do $$
declare _n bigint;
begin
  begin
    select count(*) into _n from public.registers;
  exception when insufficient_privilege then
    _n := 0;
  end;
  if _n <> 0 then raise exception 'FAIL 18b: anon read % registers', _n; end if;
  raise notice 'ok 18b anon reads no registers';
end $$;
rollback;

begin;
set local role anon;
do $$
declare _n bigint;
begin
  begin
    select count(*) into _n from public.register_stores;
  exception when insufficient_privilege then
    _n := 0;
  end;
  if _n <> 0 then raise exception 'FAIL 18c: anon read % register rows', _n; end if;
  raise notice 'ok 18c anon reads no register data';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 19. Every new table has RLS enabled and forced
-- ----------------------------------------------------------------------------
do $$
declare _t text;
begin
  foreach _t in array array[
    'registers','register_members','register_access_requests',
    'register_invites','register_stores'
  ]
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = _t
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'FAIL 19: RLS not enabled and forced on %', _t;
    end if;
  end loop;
  raise notice 'ok 19  RLS enabled and forced on all five tables';
end $$;

\echo ''
\echo 'All register schema assertions passed.'
