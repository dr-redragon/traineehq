-- Hold a deanery's admin to that deanery.
--
-- `admin` was always meant to be deanery-scoped — user_roles carries a
-- deanery_id for it, and can_access_specialty() honours it — but almost every
-- policy asked only is_admin(uid), which is true for an admin of ANY deanery.
-- So an admin of one deanery could, through the API:
--
--   * read and edit every user's profile on the platform, addresses included;
--   * grant themselves a deanery-less admin row, which can_access_specialty()
--     reads as "every deanery" — a one-statement escalation to global admin;
--   * delete a super_admin's role row, demoting the people above them;
--   * enrol anybody on any specialty, and manage every deanery's specialties,
--     content, files, contacts, announcements and notices;
--   * read the whole audit log.
--
-- THE MODEL THIS ENFORCES
--
--   super_admin            everything, as before
--   global admin           an admin row with no deanery: every deanery, but may
--                          not mint or remove super admins or other global admins
--   admin of deanery D     D's specialties and everything in them, D's
--                          contacts and announcements, D's access requests, and
--                          the users affiliated with D
--
-- "Affiliated with D" means: profile in D, a role scoped to D, or enrolled on or
-- facilitating a specialty in D. Users affiliated with no deanery at all — just
-- signed up, not yet placed — are visible to every admin so they can be
-- onboarded, EXCEPT super and global admins, who only their peers may touch.
--
-- Only a super admin may create a deanery-less admin row. Before this a
-- deanery admin could create one; nobody holds one on the live project today.
--
-- Unchanged: facilitator rights, the register (which never consulted user
-- roles), and is_admin() itself, which other functions still use to mean "holds
-- an admin role somewhere" where that is the right question.

begin;

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function public.is_global_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = _user_id
       and (role = 'super_admin' or (role = 'admin' and deanery_id is null))
  );
$$;

-- A null deanery is answered by global admins only: a row that belongs to no
-- deanery belongs to everybody, and only those with every deanery may manage it.
create or replace function public.is_admin_of_deanery(_user_id uuid, _deanery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin(_user_id)
      or (_deanery_id is not null and exists (
            select 1 from public.user_roles
             where user_id = _user_id and role = 'admin' and deanery_id = _deanery_id));
$$;

create or replace function public.specialty_deanery(_specialty_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select deanery_id from public.specialties where id = _specialty_id;
$$;

create or replace function public.is_admin_of_specialty(_user_id uuid, _specialty_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_of_deanery(_user_id, public.specialty_deanery(_specialty_id));
$$;

-- Every deanery a user is attached to, by any of the four routes.
create or replace function public.user_deaneries(_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select deanery_id from public.profiles
   where user_id = _user_id and deanery_id is not null
  union
  select deanery_id from public.user_roles
   where user_id = _user_id and deanery_id is not null
  union
  select sp.deanery_id from public.trainee_specialties ts
    join public.specialties sp on sp.id = ts.specialty_id
   where ts.user_id = _user_id
  union
  select sp.deanery_id from public.facilitator_specialties fs
    join public.specialties sp on sp.id = fs.specialty_id
   where fs.user_id = _user_id;
$$;

-- May _admin see and manage _target's profile and roles at all?
create or replace function public.can_admin_user(_admin uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_admin, 'super_admin')
    or (public.is_global_admin(_admin) and not public.is_global_admin(_target))
    or (
      public.is_admin(_admin)
      and not public.is_global_admin(_target)
      and (
        not exists (select 1 from public.user_deaneries(_target))
        or exists (
          select 1 from public.user_deaneries(_target) d
           where public.is_admin_of_deanery(_admin, d)
        )
      )
    );
$$;

-- May _admin create, change or remove a user_roles row with this role and
-- deanery? (Whose row it is, is can_admin_user's question.)
create or replace function public.can_manage_role_row(
  _admin uuid, _role public.app_role, _deanery_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_admin, 'super_admin')
    or case _role
         when 'super_admin' then false
         -- A deanery-less admin is a global admin; only a super admin mints one.
         when 'admin'       then _deanery_id is not null
                                 and public.is_admin_of_deanery(_admin, _deanery_id)
         else                    public.is_admin(_admin)
                                 and (_deanery_id is null
                                      or public.is_admin_of_deanery(_admin, _deanery_id))
       end;
$$;

-- Content management: a deanery's admins, and the specialty's facilitators.
create or replace function public.can_manage_resource(_user_id uuid, _subsection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.subsections s
      join public.specialties sp on sp.id = s.specialty_id
     where s.id = _subsection_id
       and (
         public.is_admin_of_deanery(_user_id, sp.deanery_id)
         or exists (
           select 1 from public.facilitator_specialties fs
            where fs.user_id = _user_id
              and fs.specialty_id in (sp.id, sp.parent_specialty_id)
         )
       )
  );
$$;

revoke execute on function public.is_global_admin(uuid)                          from public, anon;
revoke execute on function public.is_admin_of_deanery(uuid, uuid)                from public, anon;
revoke execute on function public.specialty_deanery(uuid)                        from public, anon;
revoke execute on function public.is_admin_of_specialty(uuid, uuid)              from public, anon;
revoke execute on function public.user_deaneries(uuid)                           from public, anon;
revoke execute on function public.can_admin_user(uuid, uuid)                     from public, anon;
revoke execute on function public.can_manage_role_row(uuid, public.app_role, uuid) from public, anon;

-- Policy expressions run as the querying role, so signed-in users need these.
grant execute on function public.is_global_admin(uuid)                           to authenticated, service_role;
grant execute on function public.is_admin_of_deanery(uuid, uuid)                 to authenticated, service_role;
grant execute on function public.specialty_deanery(uuid)                         to authenticated, service_role;
grant execute on function public.is_admin_of_specialty(uuid, uuid)               to authenticated, service_role;
grant execute on function public.user_deaneries(uuid)                            to authenticated, service_role;
grant execute on function public.can_admin_user(uuid, uuid)                      to authenticated, service_role;
grant execute on function public.can_manage_role_row(uuid, public.app_role, uuid) to authenticated, service_role;

-- ============================================================================
-- People: profiles, roles, enrolments
-- ============================================================================

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.can_admin_user(auth.uid(), user_id));

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid() or public.can_admin_user(auth.uid(), user_id))
  with check (user_id = auth.uid() or public.can_admin_user(auth.uid(), user_id));

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
  on public.profiles for delete to authenticated
  using (user_id <> auth.uid() and public.can_admin_user(auth.uid(), user_id));

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.can_admin_user(auth.uid(), user_id));

-- USING guards the row as it is (what may be changed or removed); WITH CHECK
-- guards the row as it will be (what may be created or changed into).
drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles"
  on public.user_roles for all to authenticated
  using (
    public.can_admin_user(auth.uid(), user_id)
    and public.can_manage_role_row(auth.uid(), role, deanery_id)
  )
  with check (
    public.can_admin_user(auth.uid(), user_id)
    and public.can_manage_role_row(auth.uid(), role, deanery_id)
  );

drop policy if exists "read own trainee specialties" on public.trainee_specialties;
create policy "read own trainee specialties"
  on public.trainee_specialties for select to authenticated
  using (user_id = auth.uid() or public.is_admin_of_specialty(auth.uid(), specialty_id));

drop policy if exists "admins manage trainee specialties" on public.trainee_specialties;
create policy "admins manage trainee specialties"
  on public.trainee_specialties for all to authenticated
  using (public.is_admin_of_specialty(auth.uid(), specialty_id))
  with check (public.is_admin_of_specialty(auth.uid(), specialty_id));

drop policy if exists "read facilitator specialties" on public.facilitator_specialties;
create policy "read facilitator specialties"
  on public.facilitator_specialties for select to authenticated
  using (user_id = auth.uid() or public.is_admin_of_specialty(auth.uid(), specialty_id));

drop policy if exists "admins manage facilitator specialties" on public.facilitator_specialties;
create policy "admins manage facilitator specialties"
  on public.facilitator_specialties for all to authenticated
  using (public.is_admin_of_specialty(auth.uid(), specialty_id))
  with check (public.is_admin_of_specialty(auth.uid(), specialty_id));

-- ============================================================================
-- The catalogue and its content
-- ============================================================================

drop policy if exists "admins read deleted specialties" on public.specialties;
create policy "admins read deleted specialties"
  on public.specialties for select to authenticated
  using (public.is_admin_of_deanery(auth.uid(), deanery_id));

drop policy if exists "admins manage specialties" on public.specialties;
create policy "admins manage specialties"
  on public.specialties for all to authenticated
  using (public.is_admin_of_deanery(auth.uid(), deanery_id))
  with check (public.is_admin_of_deanery(auth.uid(), deanery_id));

drop policy if exists "managers write subsections" on public.subsections;
create policy "managers write subsections"
  on public.subsections for all to authenticated
  using (
    public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

-- resources, resource_folders and resource_subheadings already write through
-- can_manage_resource(), redefined above.

-- The files themselves. Admin reach now goes through the subsection named in
-- the object's path, like everybody else's (see 20261011130000).
drop policy if exists "resources readable by permitted users" on storage.objects;
create policy "resources readable by permitted users"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.subsections s
      where s.id::text = (storage.foldername(objects.name))[2]
        and (
          public.specialty_is_available(auth.uid(), s.specialty_id)
          or public.is_admin_of_specialty(auth.uid(), s.specialty_id)
        )
    )
  );

drop policy if exists "resources writable by managers" on storage.objects;
create policy "resources writable by managers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resources'
    and exists (
      select 1 from public.subsections s
      where s.id::text = (storage.foldername(objects.name))[2]
        and public.can_manage_resource(auth.uid(), s.id)
    )
  );

drop policy if exists "resources updatable by managers" on storage.objects;
create policy "resources updatable by managers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.subsections s
      where s.id::text = (storage.foldername(objects.name))[2]
        and public.can_manage_resource(auth.uid(), s.id)
    )
  )
  with check (
    bucket_id = 'resources'
    and exists (
      select 1 from public.subsections s
      where s.id::text = (storage.foldername(objects.name))[2]
        and public.can_manage_resource(auth.uid(), s.id)
    )
  );

drop policy if exists "resources deletable by managers" on storage.objects;
create policy "resources deletable by managers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.subsections s
      where s.id::text = (storage.foldername(objects.name))[2]
        and public.can_manage_resource(auth.uid(), s.id)
    )
  );

-- ============================================================================
-- Contacts, announcements, notices, discussions
-- ============================================================================

-- A contact belongs to its own deanery, else its specialty's; one with neither
-- is the general directory, which only global admins manage.
drop policy if exists "admins manage contacts" on public.contacts;
create policy "admins manage contacts"
  on public.contacts for all to authenticated
  using (public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id))))
  with check (public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id))));

drop policy if exists "contacts readable by signed-in users" on public.contacts;
create policy "contacts readable by signed-in users"
  on public.contacts for select to authenticated
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (
      archived is not true
      and (specialty_id is null or public.specialty_is_available(auth.uid(), specialty_id))
    )
  );

drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements"
  on public.announcements for all to authenticated
  using (public.is_admin_of_deanery(auth.uid(), deanery_id))
  with check (public.is_admin_of_deanery(auth.uid(), deanery_id));

drop policy if exists "announcements readable by signed-in users" on public.announcements;
create policy "announcements readable by signed-in users"
  on public.announcements for select to authenticated
  using (is_active or public.is_admin_of_deanery(auth.uid(), deanery_id));

drop policy if exists "managers post notices" on public.specialty_notices;
create policy "managers post notices"
  on public.specialty_notices for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin_of_specialty(auth.uid(), specialty_id)
         or public.is_facilitator_for(auth.uid(), specialty_id))
  );

drop policy if exists "managers edit notices" on public.specialty_notices;
create policy "managers edit notices"
  on public.specialty_notices for update to authenticated
  using (public.is_admin_of_specialty(auth.uid(), specialty_id)
         or public.is_facilitator_for(auth.uid(), specialty_id))
  with check (public.is_admin_of_specialty(auth.uid(), specialty_id)
              or public.is_facilitator_for(auth.uid(), specialty_id));

drop policy if exists "managers remove notices" on public.specialty_notices;
create policy "managers remove notices"
  on public.specialty_notices for delete to authenticated
  using (public.is_admin_of_specialty(auth.uid(), specialty_id)
         or public.is_facilitator_for(auth.uid(), specialty_id));

drop policy if exists "authors and managers edit discussions" on public.discussions;
create policy "authors and managers edit discussions"
  on public.discussions for update to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    author_id = auth.uid()
    or public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

drop policy if exists "authors and managers delete discussions" on public.discussions;
create policy "authors and managers delete discussions"
  on public.discussions for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin_of_specialty(auth.uid(), specialty_id)
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

drop policy if exists "authors and admins delete comments" on public.discussion_comments;
create policy "authors and admins delete comments"
  on public.discussion_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.discussions d
       where d.id = discussion_id
         and public.is_admin_of_specialty(auth.uid(), d.specialty_id)
    )
  );

-- ============================================================================
-- Access requests and the audit log
-- ============================================================================

-- The admin half is scoped here. The facilitator half is unchanged by this
-- migration (any facilitator still sees every request) and is a separate fix.
drop policy if exists "reviewers read access requests" on public.access_requests;
create policy "reviewers read access requests"
  on public.access_requests for select to authenticated
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or public.has_role(auth.uid(), 'facilitator')
  );

drop policy if exists "reviewers update access requests" on public.access_requests;
create policy "reviewers update access requests"
  on public.access_requests for update to authenticated
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or public.has_role(auth.uid(), 'facilitator')
  )
  with check (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or public.has_role(auth.uid(), 'facilitator')
  );

-- The log spans every deanery, so reading all of it is for those with every
-- deanery. Everybody still reads what they did themselves.
drop policy if exists "users read own audit entries" on public.audit_log;
create policy "users read own audit entries"
  on public.audit_log for select to authenticated
  using (user_id = auth.uid() or public.is_global_admin(auth.uid()));

commit;
