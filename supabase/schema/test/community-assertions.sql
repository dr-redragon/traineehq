-- Assertions for 20261012140000_community_and_profile_hardening.sql.

\set ON_ERROR_STOP on

-- Fixture: ENT (T is enrolled) and Urology (T is not). A writes in ENT, U in Urology.
insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000e4', 'Community Deanery', 'CD', 'community-deanery');
insert into public.specialties (id, deanery_id, name, short_name, slug) values
  ('5e400000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e4', 'ENT', 'ENT', 'ent'),
  ('5e400000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000e4', 'Urology', 'Uro', 'uro');

insert into auth.users (id, email, raw_user_meta_data) values
  ('e4000000-0000-4000-8000-00000000000e', 't@example.invalid', '{"first_name":"Tee"}'),
  ('e4000000-0000-4000-8000-00000000000a', 'a@example.invalid', '{"first_name":"Ay"}'),
  ('e4000000-0000-4000-8000-00000000000b', 'u@example.invalid', '{"first_name":"Uu"}');

insert into public.trainee_specialties (user_id, specialty_id) values
  ('e4000000-0000-4000-8000-00000000000e', '5e400000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-00000000000a', '5e400000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-00000000000b', '5e400000-0000-4000-8000-000000000002');

insert into public.discussions (id, specialty_id, author_id, title, content) values
  ('d1000000-0000-4000-8000-000000000001', '5e400000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-00000000000a', 'ENT thread', 'x'),
  ('d1000000-0000-4000-8000-000000000002', '5e400000-0000-4000-8000-000000000002',
   'e4000000-0000-4000-8000-00000000000b', 'Uro thread', 'x'),
  ('d1000000-0000-4000-8000-000000000003', '5e400000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-00000000000e', 'My thread', 'x');
insert into public.discussion_votes (user_id, discussion_id, vote_type)
values ('e4000000-0000-4000-8000-00000000000b', 'd1000000-0000-4000-8000-000000000002', 1);

-- ----------------------------------------------------------------------------
-- 1. Names: the authors T can see, not the whole platform
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'e4000000-0000-4000-8000-00000000000e';
do $$
declare _ids uuid[];
begin
  select array_agg(user_id order by user_id) into _ids from public.get_profile_display_names();
  if _ids is distinct from array['e4000000-0000-4000-8000-00000000000a'::uuid,
                                 'e4000000-0000-4000-8000-00000000000e'::uuid] then
    raise exception 'FAIL 1: names returned for %', _ids;
  end if;
  raise notice 'ok  1  names are limited to the authors a user can see';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 2. Writes stay within specialties T can see; pinning is for managers
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'e4000000-0000-4000-8000-00000000000e';
do $$
declare _n int;
begin
  begin
    update public.discussions set specialty_id = '5e400000-0000-4000-8000-000000000002'
     where id = 'd1000000-0000-4000-8000-000000000003';
    raise exception 'FAIL 2: an author moved a thread into a specialty they cannot see';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.discussion_comments (discussion_id, author_id, content)
    values ('d1000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-00000000000e', 'x');
    raise exception 'FAIL 2: commented on a thread in a specialty they cannot see';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.discussion_votes (user_id, discussion_id, vote_type)
    values ('e4000000-0000-4000-8000-00000000000e', 'd1000000-0000-4000-8000-000000000002', 1);
    raise exception 'FAIL 2: voted on a thread in a specialty they cannot see';
  exception when insufficient_privilege then null;
  end;

  select count(*) into _n from public.discussion_votes;
  if _n <> 0 then raise exception 'FAIL 2: read % vote(s) from a specialty they cannot see', _n; end if;

  begin
    update public.discussions set is_pinned = true where id = 'd1000000-0000-4000-8000-000000000003';
    raise exception 'FAIL 2: a trainee pinned their own thread';
  exception when insufficient_privilege then null;
  end;

  -- Ordinary editing of their own thread still works.
  update public.discussions set title = 'Edited' where id = 'd1000000-0000-4000-8000-000000000003';
  get diagnostics _n = row_count;
  if _n <> 1 then raise exception 'FAIL 2: an author can no longer edit their own thread'; end if;

  raise notice 'ok  2  posts, comments and votes stay in visible specialties; only managers pin';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. The profile's email follows the account's
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = 'e4000000-0000-4000-8000-00000000000e';
update public.profiles set email = 'someone-else@example.invalid', first_name = 'T2'
 where user_id = 'e4000000-0000-4000-8000-00000000000e';
reset role;
do $$
begin
  perform 1 from public.profiles
   where user_id = 'e4000000-0000-4000-8000-00000000000e'
     and email = 't@example.invalid' and first_name = 'T2';
  if not found then raise exception 'FAIL 3: a browser set the profile email to another address'; end if;

  update auth.users set email = 't-new@example.invalid' where id = 'e4000000-0000-4000-8000-00000000000e';
  perform 1 from public.profiles
   where user_id = 'e4000000-0000-4000-8000-00000000000e' and email = 't-new@example.invalid';
  if not found then raise exception 'FAIL 3: a confirmed account email change did not reach the profile'; end if;
  raise notice 'ok  3  the profile email mirrors the sign-in email';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. Enrolments are audited
-- ----------------------------------------------------------------------------
do $$
begin
  perform 1 from public.audit_log
   where action = 'enrolment.added'
     and details ->> 'subject_user_id' = 'e4000000-0000-4000-8000-00000000000e'
     and details ->> 'as' = 'trainee';
  if not found then raise exception 'FAIL 4: enrolling a trainee was not audited'; end if;
  raise notice 'ok  4  enrolments are audited';
end $$;
