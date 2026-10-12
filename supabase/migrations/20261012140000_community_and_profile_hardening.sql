-- Smaller access gaps around discussions, names, profiles and the audit log.
--
-- 1. NAMES. get_profile_display_names() returned every user's id and name to
--    anybody signed in: a roster of the whole platform, and the ids that the
--    register's people-lookup could be pointed at. It now returns the caller,
--    the authors of discussions, comments and notices the caller can see, and
--    — for admins — the people they administer. That is every name the app
--    actually puts on screen.
--
-- 2. DISCUSSIONS. Writes checked authorship but not where the row ended up:
--    an author could move their thread into a specialty they cannot see, a
--    comment into any thread, and a vote onto anything; any author could pin
--    their own thread. Votes were readable platform-wide, showing who voted in
--    specialties the reader cannot see. Each now requires the target to be in
--    a specialty the user can see, and pinning is for the specialty's managers.
--
-- 3. WITHDRAWN SPECIALTIES. 20260920120000 moved most reads to
--    specialty_is_available(); comments, notices and the posting checks still
--    used can_access_specialty(), so a withdrawn specialty's threads stayed
--    readable and writable. They now follow the rest.
--
-- 4. PROFILE EMAIL. profiles.email was freely editable and drifted from the
--    address the person signs in with — and it is the address other people
--    are shown (register_people) and the one reviewer alerts go to. It now
--    mirrors auth.users.email: changing it is a confirmed Supabase Auth email
--    change, which updates the profile when it completes.
--
-- 5. AUDIT. Enrolling somebody on a specialty, or making them its facilitator,
--    decides what they can read; both were unaudited. They are now logged
--    alongside role grants.
--
-- ALTER POLICY throughout: see 20261011130000.

begin;

-- ------------------------------------------------------------------ names --
create or replace function public.get_profile_display_names()
returns table (user_id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.first_name, p.last_name
    from public.profiles p
   where p.user_id = auth.uid()
      or public.is_global_admin(auth.uid())
      or (public.is_admin(auth.uid()) and public.can_admin_user(auth.uid(), p.user_id))
      or exists (select 1 from public.discussions d
                  where d.author_id = p.user_id
                    and public.specialty_is_available(auth.uid(), d.specialty_id))
      or exists (select 1 from public.discussion_comments c
                   join public.discussions d on d.id = c.discussion_id
                  where c.author_id = p.user_id
                    and public.specialty_is_available(auth.uid(), d.specialty_id))
      or exists (select 1 from public.specialty_notices n
                  where n.author_id = p.user_id
                    and public.specialty_is_available(auth.uid(), n.specialty_id));
$$;

-- ------------------------------------------------------------ discussions --
alter policy "discussions follow specialty access" on public.discussions
  using (public.specialty_is_available(auth.uid(), specialty_id));

alter policy "members post discussions" on public.discussions
  with check (author_id = auth.uid()
              and public.specialty_is_available(auth.uid(), specialty_id));

alter policy "authors and managers edit discussions" on public.discussions
  using (
    author_id = auth.uid()
    or public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    (author_id = auth.uid() and public.specialty_is_available(auth.uid(), specialty_id))
    or public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

-- A policy sees only the new row, so "who may change is_pinned" needs the old
-- one: a trigger.
create or replace function public.discussions_guard_pin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.is_pinned is distinct from OLD.is_pinned
     and auth.uid() is not null
     and not (public.is_admin_of_specialty(auth.uid(), NEW.specialty_id)
              or public.is_facilitator_for(auth.uid(), NEW.specialty_id)) then
    raise exception 'Only the specialty''s admins and facilitators can pin a discussion'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;
revoke all on function public.discussions_guard_pin() from public, anon, authenticated;

create or replace trigger discussions_guard_pin
  before update of is_pinned on public.discussions
  for each row execute function public.discussions_guard_pin();

alter policy "comments follow discussion access" on public.discussion_comments
  using (exists (
    select 1 from public.discussions d
     where d.id = discussion_id
       and public.specialty_is_available(auth.uid(), d.specialty_id)));

alter policy "members post comments" on public.discussion_comments
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.discussions d
                 where d.id = discussion_id
                   and public.specialty_is_available(auth.uid(), d.specialty_id)));

alter policy "authors edit comments" on public.discussion_comments
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.discussions d
                 where d.id = discussion_id
                   and public.specialty_is_available(auth.uid(), d.specialty_id)));

-- A vote's target is a discussion or a comment; either way it lives in a thread.
create or replace function public.vote_target_available(_discussion_id uuid, _comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.discussions d
     where d.id = coalesce(_discussion_id,
                           (select c.discussion_id from public.discussion_comments c where c.id = _comment_id))
       and public.specialty_is_available(auth.uid(), d.specialty_id));
$$;
revoke all on function public.vote_target_available(uuid, uuid) from public, anon;
grant execute on function public.vote_target_available(uuid, uuid) to authenticated;

alter policy "votes readable by signed-in users" on public.discussion_votes
  using (public.vote_target_available(discussion_id, comment_id));

alter policy "users cast own votes" on public.discussion_votes
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.vote_target_available(discussion_id, comment_id));

alter policy "notices follow specialty access" on public.specialty_notices
  using (is_active and public.specialty_is_available(auth.uid(), specialty_id));

-- -------------------------------------------------------------- profiles --
-- The profile copy of the address follows the account's: a browser cannot set
-- it to anything else, and a confirmed auth email change carries over.
create or replace function public.profiles_email_follows_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- current_user is this function's owner (security definer); the role the
  -- request runs as is in the `role` setting PostgREST sets per request.
  if current_setting('role', true) in ('authenticated', 'anon') then
    NEW.email := (select u.email from auth.users u where u.id = NEW.user_id);
  end if;
  return NEW;
end;
$$;
revoke all on function public.profiles_email_follows_account() from public, anon, authenticated;

create or replace trigger profiles_email_follows_account
  before insert or update of email on public.profiles
  for each row execute function public.profiles_email_follows_account();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.email is distinct from OLD.email then
    update public.profiles set email = NEW.email where user_id = NEW.id;
  end if;
  return NEW;
end;
$$;
revoke all on function public.sync_profile_email() from public, anon, authenticated;

create or replace trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ------------------------------------------------------------------ audit --
create or replace function public.audit_enrolment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row  record := coalesce(NEW, OLD);
  _kind text := case TG_TABLE_NAME when 'trainee_specialties' then 'trainee' else 'facilitator' end;
begin
  insert into public.audit_log (user_id, action, details)
  values (auth.uid(),
          case TG_OP when 'INSERT' then 'enrolment.added' else 'enrolment.removed' end,
          jsonb_build_object('subject_user_id', _row.user_id, 'specialty_id', _row.specialty_id,
                             'as', _kind));
  return _row;
end;
$$;
revoke all on function public.audit_enrolment_change() from public, anon, authenticated;

create or replace trigger audit_trainee_specialties
  after insert or delete on public.trainee_specialties
  for each row execute function public.audit_enrolment_change();

create or replace trigger audit_facilitator_specialties
  after insert or delete on public.facilitator_specialties
  for each row execute function public.audit_enrolment_change();

commit;
