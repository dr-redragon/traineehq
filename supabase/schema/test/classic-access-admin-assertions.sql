-- Assertions for 20260907110000_register_access_admin.sql.
--
-- Runs at the end of scenario A in scripts/verify-register-schema.sh, against the
-- state the tenancy assertions leave behind: the 'mersey-ent' register owned by
-- the Mersey admin (…002), with the ENT trainee (…003) approved as an editor.

\set ON_ERROR_STOP on

\set OWNER   '11111111-0000-4000-8000-000000000002'
\set EDITOR  '11111111-0000-4000-8000-000000000003'
\set OUTSIDER '11111111-0000-4000-8000-000000000004'

-- ----------------------------------------------------------------------------
-- 1. The invites table is gone, and nothing still refers to it
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.classic_register_invites') is not null then
    raise exception 'FAIL 1: classic_register_invites still exists';
  end if;
  raise notice 'ok  1  classic_register_invites dropped';
end $$;

-- ----------------------------------------------------------------------------
-- 2. The starting state is what the tenancy assertions left
-- ----------------------------------------------------------------------------
do $$
begin
  if not public.is_classic_register_owner('11111111-0000-4000-8000-000000000002',
                                  (select id from public.classic_registers where slug = 'mersey-ent')) then
    raise exception 'FAIL 2: expected …002 to own mersey-ent';
  end if;
  if not public.is_classic_register_member('11111111-0000-4000-8000-000000000003',
                                   (select id from public.classic_registers where slug = 'mersey-ent')) then
    raise exception 'FAIL 2: expected …003 to be an editor of mersey-ent';
  end if;
  raise notice 'ok  2  starting state as expected';
end $$;

-- ----------------------------------------------------------------------------
-- 3. Roles can no longer be changed by writing the table directly
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  update public.classic_register_members set role = 'owner'
   where user_id = '11111111-0000-4000-8000-000000000003';
  raise exception 'FAIL 3: an owner changed a role by direct update';
exception when insufficient_privilege then
  raise notice 'ok  3  direct role updates are denied';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. An editor cannot change roles
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
begin
  perform public.set_classic_register_member_role(
    (select id from public.classic_registers where slug = 'mersey-ent'),
    '11111111-0000-4000-8000-000000000003', 'owner');
  raise exception 'FAIL 4: an editor promoted themselves';
exception when others then
  if sqlerrm not like 'Only an owner can change%' then raise; end if;
  raise notice 'ok  4  an editor cannot change roles';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 5. The only owner cannot demote themselves out of the job
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.set_classic_register_member_role(
    (select id from public.classic_registers where slug = 'mersey-ent'),
    '11111111-0000-4000-8000-000000000002', 'editor');
  raise exception 'FAIL 5: the only owner demoted themselves';
exception when others then
  if sqlerrm not like 'This is the register''s only owner%' then raise; end if;
  raise notice 'ok  5  the last owner cannot be demoted';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 6. Promote a second owner, and the first may then step down
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
declare _rid uuid := (select id from public.classic_registers where slug = 'mersey-ent');
begin
  perform public.set_classic_register_member_role(_rid, '11111111-0000-4000-8000-000000000003', 'owner');

  if not public.is_classic_register_owner('11111111-0000-4000-8000-000000000003', _rid) then
    raise exception 'FAIL 6: the editor was not promoted';
  end if;

  perform public.set_classic_register_member_role(_rid, '11111111-0000-4000-8000-000000000002', 'editor');

  if public.is_classic_register_owner('11111111-0000-4000-8000-000000000002', _rid) then
    raise exception 'FAIL 6: the outgoing owner was not demoted';
  end if;

  raise notice 'ok  6  ownership can be handed over';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 7. Setting a role that is already set is a no-op, not an error
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.set_classic_register_member_role(
    (select id from public.classic_registers where slug = 'mersey-ent'),
    '11111111-0000-4000-8000-000000000002', 'owner');
  raise notice 'ok  7  re-setting the same role is a no-op';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 8. A member cannot be given a role in a register they do not belong to
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  perform public.set_classic_register_member_role(
    (select id from public.classic_registers where slug = 'mersey-ent'),
    '11111111-0000-4000-8000-000000000004', 'editor');
  raise exception 'FAIL 8: a non-member was given a role';
exception when others then
  if sqlerrm not like 'That person is not a member%' then raise; end if;
  raise notice 'ok  8  a non-member cannot be given a role';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 8b. Any member may admit an editor; only an owner may admit an owner
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';   -- an editor

do $$
declare _rid uuid := (select id from public.classic_registers where slug = 'mersey-ent');
begin
  insert into public.classic_register_members (register_id, user_id, role, granted_by)
  values (_rid, '11111111-0000-4000-8000-000000000004', 'editor',
          '11111111-0000-4000-8000-000000000003');

  if not public.is_classic_register_member('11111111-0000-4000-8000-000000000004', _rid) then
    raise exception 'FAIL 8b: an editor could not admit somebody';
  end if;
  raise notice 'ok  8b an editor can admit an editor';
end $$;

do $$
declare _rid uuid := (select id from public.classic_registers where slug = 'mersey-ent');
begin
  insert into public.classic_register_members (register_id, user_id, role, granted_by)
  values (_rid, '11111111-0000-4000-8000-000000000001', 'owner',
          '11111111-0000-4000-8000-000000000003');
  raise exception 'FAIL 8c: an editor admitted somebody straight to owner';
exception when insufficient_privilege then
  raise notice 'ok  8c an editor cannot admit an owner';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 9. classic_register_people answers a member, with names and addresses
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000003';

do $$
declare _n integer;
begin
  select count(*) into _n
    from public.classic_register_people((select id from public.classic_registers where slug = 'mersey-ent'));

  -- The two members. …003 also has a decided request, which must not double them.
  if _n <> 2 then
    raise exception 'FAIL 9: expected 2 people, got %', _n;
  end if;

  if not exists (
    select 1 from public.classic_register_people((select id from public.classic_registers where slug = 'mersey-ent'))
     where email = 'trainee.ent@example.com'
  ) then
    raise exception 'FAIL 9: addresses are not being returned';
  end if;

  raise notice 'ok  9  classic_register_people answers a member';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 10. ...and tells a non-member nothing, including a super_admin
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000001';

do $$
begin
  if (select count(*) from public.classic_register_people(
        (select id from public.classic_registers where slug = 'mersey-ent'))) <> 0 then
    raise exception 'FAIL 10: a non-member read a register''s people';
  end if;
  raise notice 'ok 10  classic_register_people is silent for a non-member';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 11. anon reaches neither function
-- ----------------------------------------------------------------------------
begin;
set local role anon;
do $$
begin
  begin
    perform public.classic_register_people('00000000-0000-4000-8000-000000000000');
    raise exception 'FAIL 11: anon called classic_register_people';
  exception when insufficient_privilege then
    raise notice 'ok 11  anon cannot call classic_register_people';
  end;
end $$;
rollback;

begin;
set local role anon;
do $$
begin
  begin
    perform public.set_classic_register_member_role(
      '00000000-0000-4000-8000-000000000000',
      '00000000-0000-4000-8000-000000000000', 'owner');
    raise exception 'FAIL 11b: anon called set_classic_register_member_role';
  exception when insufficient_privilege then
    raise notice 'ok 11b anon cannot call set_classic_register_member_role';
  end;
end $$;
rollback;

\echo ''
\echo 'All access-administration assertions passed.'
