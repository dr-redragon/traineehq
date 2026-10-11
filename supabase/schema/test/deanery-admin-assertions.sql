-- Assertions for 20261011150000_deanery_scoped_admins.sql.
--
-- The point: an admin of one deanery manages that deanery and nothing beyond
-- it, cannot make themselves more than that, and cannot touch the people
-- above them. Super and global admins keep their reach.
--
-- Runs on a fresh baseline with its own fixture (see verify-security-fixes.sh).

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- Fixture
--   deaneries A and B, one specialty in each
--   S   super_admin                 G   global admin (admin, no deanery)
--   AA  admin of A                  AB  admin of B
--   TA  trainee on A's specialty    TB  trainee on B's specialty
--   U   signed up, placed nowhere
-- ----------------------------------------------------------------------------
insert into public.deaneries (id, name, short_name, slug) values
  ('d0000000-0000-4000-8000-0000000000aa', 'Deanery A', 'A', 'deanery-a'),
  ('d0000000-0000-4000-8000-0000000000bb', 'Deanery B', 'B', 'deanery-b');

insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5d000000-0000-4000-8000-0000000000aa', 'd0000000-0000-4000-8000-0000000000aa', 'ENT A', 'ENT', 'ent'),
  ('5d000000-0000-4000-8000-0000000000bb', 'd0000000-0000-4000-8000-0000000000bb', 'ENT B', 'ENT', 'ent');

insert into auth.users (id, email) values
  ('ad000000-0000-4000-8000-000000000005', 's@example.invalid'),
  ('ad000000-0000-4000-8000-000000000006', 'g@example.invalid'),
  ('ad000000-0000-4000-8000-0000000000aa', 'aa@example.invalid'),
  ('ad000000-0000-4000-8000-0000000000bb', 'ab@example.invalid'),
  ('ad000000-0000-4000-8000-0000000001aa', 'ta@example.invalid'),
  ('ad000000-0000-4000-8000-0000000001bb', 'tb@example.invalid'),
  ('ad000000-0000-4000-8000-000000000009', 'u@example.invalid');

insert into public.user_roles (user_id, role, deanery_id) values
  ('ad000000-0000-4000-8000-000000000005', 'super_admin', null),
  ('ad000000-0000-4000-8000-000000000006', 'admin', null),
  ('ad000000-0000-4000-8000-0000000000aa', 'admin', 'd0000000-0000-4000-8000-0000000000aa'),
  ('ad000000-0000-4000-8000-0000000000bb', 'admin', 'd0000000-0000-4000-8000-0000000000bb');

update public.profiles set deanery_id = 'd0000000-0000-4000-8000-0000000000aa'
 where user_id = 'ad000000-0000-4000-8000-0000000001aa';
update public.profiles set deanery_id = 'd0000000-0000-4000-8000-0000000000bb'
 where user_id = 'ad000000-0000-4000-8000-0000000001bb';

insert into public.trainee_specialties (user_id, specialty_id) values
  ('ad000000-0000-4000-8000-0000000001aa', '5d000000-0000-4000-8000-0000000000aa'),
  ('ad000000-0000-4000-8000-0000000001bb', '5d000000-0000-4000-8000-0000000000bb');

insert into public.audit_log (user_id, action) values
  ('ad000000-0000-4000-8000-0000000000bb', 'fixture.other-admins-entry');

-- ----------------------------------------------------------------------------
-- 1. A's admin sees A's people and unplaced sign-ups — not B's, not their superiors
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-0000000000aa';

do $$
begin
  perform 1 from public.profiles where user_id = 'ad000000-0000-4000-8000-0000000001aa';
  if not found then raise exception 'FAIL 1: admin of A cannot see a trainee in A'; end if;

  perform 1 from public.profiles where user_id = 'ad000000-0000-4000-8000-000000000009';
  if not found then raise exception 'FAIL 1: admin of A cannot see an unplaced sign-up'; end if;

  perform 1 from public.profiles where user_id = 'ad000000-0000-4000-8000-0000000001bb';
  if found then raise exception 'FAIL 1: admin of A read a trainee in B'; end if;

  perform 1 from public.profiles where user_id in (
    'ad000000-0000-4000-8000-000000000005', 'ad000000-0000-4000-8000-000000000006');
  if found then raise exception 'FAIL 1: admin of A read a super or global admin''s profile'; end if;

  perform 1 from public.trainee_specialties where user_id = 'ad000000-0000-4000-8000-0000000001bb';
  if found then raise exception 'FAIL 1: admin of A read B''s enrolments'; end if;

  raise notice 'ok  1  admin of A sees A''s people and unplaced sign-ups only';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 2. A's admin cannot make anybody — least of all themselves — more than A's admin
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-0000000000aa';

do $$
begin
  begin
    -- The old one-statement escalation: a deanery-less admin row is global.
    update public.user_roles set deanery_id = null
     where user_id = 'ad000000-0000-4000-8000-0000000000aa' and role = 'admin';
    if found then raise exception 'FAIL 2: admin of A made themselves a global admin'; end if;
  exception when insufficient_privilege then null;
  end;

  -- Their own row has to be a fresh insert of (admin, null): role 'admin' is
  -- already taken by unique(user_id, role), so test the shape on a peer.
  begin
    insert into public.user_roles (user_id, role, deanery_id)
    values ('ad000000-0000-4000-8000-0000000001aa', 'admin', null);
    raise exception 'FAIL 2: admin of A minted a global admin';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.user_roles (user_id, role, deanery_id)
    values ('ad000000-0000-4000-8000-0000000001aa', 'admin', 'd0000000-0000-4000-8000-0000000000bb');
    raise exception 'FAIL 2: admin of A minted an admin of B';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.user_roles (user_id, role)
    values ('ad000000-0000-4000-8000-0000000001aa', 'super_admin');
    raise exception 'FAIL 2: admin of A minted a super admin';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok  2  admin of A cannot escalate anybody beyond A';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. ...nor demote the people above them, nor reach B's people
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-0000000000aa';

do $$
declare _n int;
begin
  delete from public.user_roles where user_id in (
    'ad000000-0000-4000-8000-000000000005', 'ad000000-0000-4000-8000-000000000006');
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 3: admin of A removed % role(s) from super/global admins', _n; end if;

  delete from public.user_roles where user_id = 'ad000000-0000-4000-8000-0000000000bb';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 3: admin of A removed the admin of B'; end if;

  update public.profiles set first_name = 'x' where user_id = 'ad000000-0000-4000-8000-0000000001bb';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 3: admin of A edited a profile in B'; end if;

  raise notice 'ok  3  admin of A cannot demote superiors or touch B''s people';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. ...but runs A as before
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-0000000000aa';

do $$
declare _n int;
begin
  insert into public.user_roles (user_id, role, deanery_id)
  values ('ad000000-0000-4000-8000-0000000001aa', 'facilitator', 'd0000000-0000-4000-8000-0000000000aa');

  insert into public.trainee_specialties (user_id, specialty_id)
  values ('ad000000-0000-4000-8000-000000000009', '5d000000-0000-4000-8000-0000000000aa');

  begin
    insert into public.trainee_specialties (user_id, specialty_id)
    values ('ad000000-0000-4000-8000-0000000001aa', '5d000000-0000-4000-8000-0000000000bb');
    raise exception 'FAIL 4: admin of A enrolled somebody on B''s specialty';
  exception when insufficient_privilege then null;
  end;

  update public.specialties set color = 'red' where id = '5d000000-0000-4000-8000-0000000000aa';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 4: admin of A cannot edit A''s specialty'; end if;

  update public.specialties set color = 'red' where id = '5d000000-0000-4000-8000-0000000000bb';
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 4: admin of A edited B''s specialty'; end if;

  insert into public.subsections (specialty_id, name)
  values ('5d000000-0000-4000-8000-0000000000aa', 'New section');

  begin
    insert into public.subsections (specialty_id, name)
    values ('5d000000-0000-4000-8000-0000000000bb', 'Intruding section');
    raise exception 'FAIL 4: admin of A added a section to B''s specialty';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok  4  admin of A manages A''s roles, enrolments, specialties and content';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 5. The audit log beyond your own entries is for global admins
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-0000000000aa';
do $$
begin
  perform 1 from public.audit_log where action = 'fixture.other-admins-entry';
  if found then raise exception 'FAIL 5: admin of A read another admin''s audit entries'; end if;
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-000000000006';
do $$
begin
  perform 1 from public.audit_log where action = 'fixture.other-admins-entry';
  if not found then raise exception 'FAIL 5: a global admin cannot read the audit log'; end if;
  raise notice 'ok  5  only global admins read the whole audit log';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 6. A global admin reaches every deanery, but cannot mint global or super admins
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-000000000006';

do $$
begin
  perform 1 from public.profiles where user_id = 'ad000000-0000-4000-8000-0000000001bb';
  if not found then raise exception 'FAIL 6: a global admin cannot see B''s trainee'; end if;

  insert into public.user_roles (user_id, role, deanery_id)
  values ('ad000000-0000-4000-8000-0000000001bb', 'admin', 'd0000000-0000-4000-8000-0000000000bb');

  begin
    insert into public.user_roles (user_id, role, deanery_id)
    values ('ad000000-0000-4000-8000-0000000001aa', 'admin', null);
    raise exception 'FAIL 6: a global admin minted another global admin';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.user_roles where user_id = 'ad000000-0000-4000-8000-000000000005';
    if found then raise exception 'FAIL 6: a global admin removed a super admin''s role'; end if;
  end;

  raise notice 'ok  6  global admin spans deaneries but cannot mint peers or superiors';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 7. A super admin can do all of it
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-000000000005';

do $$
begin
  insert into public.user_roles (user_id, role, deanery_id)
  values ('ad000000-0000-4000-8000-0000000001aa', 'admin', null);
  delete from public.user_roles
   where user_id = 'ad000000-0000-4000-8000-000000000006' and role = 'admin';
  if not found then raise exception 'FAIL 7: a super admin could not remove a global admin'; end if;
  raise notice 'ok  7  super admins keep full control of roles';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 8. Contacts: A's admin manages A's specialty contacts, not B's, and not the
--    general directory (no deanery, no specialty), which is global admins' alone
-- ----------------------------------------------------------------------------
insert into public.contacts (id, name, role, category, organisation, email, specialty_id, deanery_id) values
  ('c1000000-0000-4000-8000-0000000000aa', 'A TPD', 'TPD', 'tpd', 'Trust', 'a@example.invalid', '5d000000-0000-4000-8000-0000000000aa', null),
  ('c1000000-0000-4000-8000-0000000000bb', 'B TPD', 'TPD', 'tpd', 'Trust', 'b@example.invalid', '5d000000-0000-4000-8000-0000000000bb', null),
  ('c1000000-0000-4000-8000-000000000000', 'General', 'Office', 'deanery', 'HEE', 'g@example.invalid', null, null);

begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-0000000000aa';
do $$
declare _n int;
begin
  update public.contacts set phone = '1' where id = 'c1000000-0000-4000-8000-0000000000aa';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 8: admin of A cannot edit A''s contact'; end if;

  update public.contacts set phone = '1' where id in (
    'c1000000-0000-4000-8000-0000000000bb', 'c1000000-0000-4000-8000-000000000000');
  get diagnostics _n = row_count;
  if _n <> 0 then raise exception 'FAIL 8: admin of A edited B''s or the general directory''s contact'; end if;
end $$;
rollback;

begin;
set local role authenticated;
set local test.uid = 'ad000000-0000-4000-8000-000000000006';
do $$
declare _n int;
begin
  update public.contacts set phone = '2' where id = 'c1000000-0000-4000-8000-000000000000';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 8: a global admin cannot edit the general directory'; end if;
  raise notice 'ok  8  contacts follow the deanery; the general directory is global admins'' alone';
end $$;
rollback;
