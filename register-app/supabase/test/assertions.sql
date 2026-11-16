-- Assertions for supabase/migrations/20261116000000_register_schema.sql.
-- Run by scripts/verify-schema.sh against a throwaway database. Each block
-- becomes a user the way PostgREST does: the `authenticated` role plus a uid.
\set ON_ERROR_STOP 1

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Example.org', '{"full_name":"Alice Mary Owner"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.org',   '{"given_name":"Bob","family_name":"Editor"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.org', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.org',  '{"name":"Dave"}');

create or replace function pg_temp.fails(_sql text, _like text) returns void language plpgsql as $$
begin
  begin
    execute _sql;
  exception when others then
    if sqlerrm not ilike '%' || _like || '%' then
      raise exception 'expected an error like "%", got "%"', _like, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected "%" to fail', _sql;
end $$;

-- profiles are filled from whatever the provider sent
do $$ begin
  assert (select first_name || '|' || last_name from public.profiles
           where user_id = '00000000-0000-0000-0000-00000000000a') = 'Alice|Mary Owner';
  assert (select email from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 'alice@example.org';
  assert (select last_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b') = 'Editor';
  assert (select first_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c') is null;
end $$;

-- ------------------------------------------------------------- the plan --
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000a';
do $$
declare _r jsonb; _id uuid; _v bigint;
begin
  -- free: a regular register is refused, an event register is not
  perform pg_temp.fails($q$select public.create_register('ENT teaching', 'regular')$q$, 'needs a subscription');
  assert (public.my_plan()->>'subscribed')::boolean = false;

  _r := public.create_register('  Spring Conference 2027 ', 'event', 'Northern Society');
  _id := (_r->>'id')::uuid;
  assert _r->>'slug' ~ '^spring-conference-2027-[0-9a-f]{6}$', _r->>'slug';
  assert (select count(*) from public.register_directory()) = 1;
  assert (select entitled and i_am_owner and kind = 'event' from public.register_directory());

  -- three days: fine
  _v := public.save_register(_id, '{"trainees":[],"sessions":[
      {"id":"s1","month":"2027-03","date":"2027-03-10","title":"Day 1"},
      {"id":"s2","month":"2027-03","date":"2027-03-12","title":"Day 3"}]}'::jsonb, 1);
  assert _v = 2;

  -- a second month: not one event
  perform pg_temp.fails(format($q$select public.save_register(%L, '{"sessions":[
      {"id":"s1","month":"2027-03","date":"2027-03-10","title":"a"},
      {"id":"s2","month":"2027-04","date":"2027-04-10","title":"b"}]}'::jsonb, 2)$q$, _id),
    'one event of up to 7 days');

  -- a stale version is a conflict, not an overwrite
  perform pg_temp.fails(format($q$select public.save_register(%L, '{}'::jsonb, 1)$q$, _id), 'saved by somebody else');

  -- service-role-only functions are not callable from the browser
  perform pg_temp.fails($q$select public.register_record_checkin(gen_random_uuid(), 'x', '')$q$, 'permission denied');
  perform pg_temp.fails($q$select public.claim_register_invites(); insert into public.subscriptions (user_id, status)
      values ('00000000-0000-0000-0000-00000000000a', 'comp')$q$, 'permission denied');
end $$;
commit;

-- the webhook's write: Alice subscribes
insert into public.subscriptions (user_id, status, stripe_subscription_id)
values ('00000000-0000-0000-0000-00000000000a', 'active', 'sub_test');

begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000a';
do $$
declare _r jsonb; _id uuid; _inv jsonb; _inv2 jsonb;
begin
  assert (public.my_plan()->>'subscribed')::boolean;
  _r := public.create_register('ENT regional teaching', 'regular');
  _id := (_r->>'id')::uuid;

  -- a regular register runs all year
  perform public.save_register(_id, '{"trainees":[{"id":"t1","name":"T One"}],"sessions":[
      {"id":"s1","month":"2026-09","date":"2026-09-10","title":"a"},
      {"id":"s2","month":"2027-04","date":"2027-04-10","title":"b"}],"attendance":{}}'::jsonb, 1);

  -- invitations
  perform pg_temp.fails(format($q$select public.invite_to_register(%L, 'not-an-address')$q$, _id), 'email address');
  perform pg_temp.fails(format($q$select public.invite_to_register(%L, 'alice@example.org')$q$, _id), 'already has access');
  _inv  := public.invite_to_register(_id, ' Bob@Example.org ');
  _inv2 := public.invite_to_register(_id, 'bob@example.org');
  assert _inv->>'token' <> _inv2->>'token';
  assert (select count(*) from public.register_invites where register_id = _id) = 1;
  perform public.invite_to_register(_id, 'someone-else@example.org');
  perform set_config('test.reg', _id::text, false);
  perform set_config('test.tok', (select token from public.register_invites
                                   where email = 'someone-else@example.org'), false);
end $$;
commit;

-- Bob signs in with the invited address and finds the register waiting
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000b';
do $$
declare _id uuid := current_setting('test.reg')::uuid;
begin
  assert (select count(*) from public.register_directory()) = 0;
  assert (select count(*) from public.register_stores) = 0, 'RLS hides a register from a non-member';
  assert public.claim_register_invites() = 1;
  assert public.claim_register_invites() = 0;
  assert (select count(*) from public.register_directory()) = 1;
  assert (select not i_am_owner and entitled from public.register_directory());
  -- an editor without a subscription writes to a subscribed owner's register
  perform public.save_register(_id, '{"trainees":[],"sessions":[]}'::jsonb, 2);
  -- but cannot invite, see invitations, or make a regular register of their own
  perform pg_temp.fails(format($q$select public.invite_to_register(%L, 'x@example.org')$q$, _id), 'Only an owner');
  assert (select count(*) from public.register_invites) = 0;
  perform pg_temp.fails($q$select public.create_register('Mine', 'regular')$q$, 'needs a subscription');
  assert (select count(*) from public.register_people(_id)) = 2;
end $$;
commit;

-- Dave was not invited by address, but holds the link (Apple relay address)
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000d';
do $$
declare _r jsonb;
begin
  assert (public.register_invite_preview(current_setting('test.tok'))->>'usable')::boolean;
  perform pg_temp.fails($q$select public.accept_register_invite('nonsense')$q$, 'withdrawn or replaced');
  _r := public.accept_register_invite(current_setting('test.tok'));
  assert _r->>'slug' is not null;
  assert (select count(*) from public.register_directory()) = 1;
end $$;
commit;

-- Roles. Alice makes Dave a viewer and sends Carol an owner invitation.
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000a';
do $$
declare _id uuid := current_setting('test.reg')::uuid; _inv jsonb;
begin
  perform public.set_register_member_role(_id, '00000000-0000-0000-0000-00000000000d', 'viewer');
  _inv := public.invite_to_register(_id, 'carol@example.org', 'owner');
  perform set_config('test.ownertok', _inv->>'token', false);
  -- the certificate design is the owners' to set, and is capped
  update public.registers set certificate_design = '{"template":"modern","accent":"#005eb8"}' where id = _id;
  perform pg_temp.fails(format($q$update public.registers set certificate_design = jsonb_build_object('x', repeat('y', 9000)) where id = %L$q$, _id), 'check constraint');
  perform pg_temp.fails(format($q$update public.registers set kind = 'event' where id = %L$q$, _id), 'permission denied');
end $$;
commit;

-- Dave, now a viewer: reads everything, changes nothing
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000d';
do $$
declare _id uuid := current_setting('test.reg')::uuid;
begin
  assert (select my_role = 'viewer' and not i_am_owner from public.register_directory());
  assert (select data is not null from public.register_stores where register_id = _id);
  assert not public.can_edit_register(auth.uid(), _id);
  perform pg_temp.fails(format($q$select public.save_register(%L, '{"trainees":[]}'::jsonb, 3)$q$, _id), 'view-only');
  -- row-level security makes a non-owner's update match no rows
  update public.registers set name = 'Mine now' where id = _id;
  assert (select name <> 'Mine now' from public.registers where id = _id);
  perform pg_temp.fails(format($q$select public.set_register_member_role(%L, '00000000-0000-0000-0000-00000000000d', 'owner')$q$, _id), 'Only an owner');
  -- an owner invitation cannot be taken by whoever holds the link
  assert (public.register_invite_preview(current_setting('test.ownertok'))->>'wrong_account')::boolean;
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000b';
do $$
declare _id uuid := current_setting('test.reg')::uuid;
begin
  -- Bob (an editor) cannot use Carol's owner link to promote himself: he is
  -- already a member, so it is neither consumed nor applied.
  perform public.accept_register_invite(current_setting('test.ownertok'));
  assert (select my_role = 'editor' from public.register_directory());
  -- a document that is not a register, or is enormous, is refused
  perform pg_temp.fails(format($q$select public.save_register(%L, '[]'::jsonb, 3)$q$, _id), 'not a register');
  perform pg_temp.fails(format($q$select public.save_register(%L, jsonb_build_object('junk',
      (select jsonb_agg(md5(g::text)) from generate_series(1, 200000) g)), 3)$q$, _id), 'too large');
end $$;
commit;

-- A stranger holding the forwarded owner link gets nowhere
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'eve@example.org');
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000e';
select pg_temp.fails(format('select public.accept_register_invite(%L)', current_setting('test.ownertok')), 'different account');
commit;

-- Carol tries the same link afterwards
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000c';
select pg_temp.fails(format('select public.accept_register_invite(%L)', current_setting('test.tok')), 'already been used');
select pg_temp.fails(format($q$select public.save_register(%L, '{}'::jsonb, 3)$q$, current_setting('test.reg')), 'do not have access');
commit;

-- the subscription lapses: the regular register goes read-only, for everybody
update public.subscriptions set status = 'canceled' where user_id = '00000000-0000-0000-0000-00000000000a';

begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000b';
do $$
declare _id uuid := current_setting('test.reg')::uuid;
begin
  assert (select not entitled from public.register_directory());
  assert (select data is not null from public.register_stores where register_id = _id), 'still readable';
  perform pg_temp.fails(format($q$select public.save_register(%L, '{}'::jsonb, 3)$q$, _id), 'read-only');
end $$;
commit;

-- and Alice's free event register is untouched by that
begin;
set local role authenticated;
set local test.uid = '00000000-0000-0000-0000-00000000000a';
do $$
declare _event uuid; _regular uuid := current_setting('test.reg')::uuid;
begin
  select id into _event from public.register_directory() where kind = 'event';
  perform public.save_register(_event, '{"trainees":[],"sessions":[]}'::jsonb, 2);
  -- history is the owner's, and restoring is a write
  assert (select count(*) from public.register_history(_regular)) = 2;
  perform pg_temp.fails(format('select public.restore_register_version(%L, 1)', _regular), 'read-only');
  -- deleting still works on a lapsed plan: archive, then destroy
  perform public.archive_register(_regular);
  assert (select count(*) from public.register_archive()) = 1;
  delete from public.registers where id = _regular;
  assert (select count(*) from public.register_archive()) = 0;
end $$;
commit;

-- anon holds nothing but the two public reads
begin;
set local role anon;
select pg_temp.fails('select * from public.registers', 'permission denied');
select pg_temp.fails('select public.register_directory()', 'permission denied');
select public.register_public_session(gen_random_uuid());
commit;

do $$ begin
  assert (select array_agg(x) from public.registers_solely_owned_by('00000000-0000-0000-0000-00000000000a') x) is not null;
  assert (select count(*) from public.audit_log where action = 'register.member_added') >= 4;
  raise notice 'all schema assertions passed';
end $$;
