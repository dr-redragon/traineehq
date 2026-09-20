-- Stop a withdrawn specialty's contents being readable through the API.
--
-- Deactivating a specialty is how an admin takes it out of circulation without
-- deleting it. Every read policy gates on `can_access_specialty`, which asks
-- whether a person is assigned to a specialty and nothing about whether it is
-- still switched on.
--
-- Today that gap is mostly cosmetic: the 11 withdrawn specialties in the live
-- deanery have no trainees assigned, no facilitators, no files and no threads,
-- so `can_access_specialty` already turns everyone away except admins — who
-- saw them in the search box while the rail hid them. The gap bites the first
-- time the switch is used for what it is for: withdraw a specialty that people
-- ARE assigned to, and they keep finding it, keep opening it, and keep reading
-- everything filed in it.
--
-- The client filters those out now, but a client filter is a tidiness measure,
-- not a boundary; a direct request to PostgREST with the publishable key does
-- not run it. This is the boundary.
--
-- Scope: read policies only. The write policies still go through
-- `can_access_specialty` and `can_manage_resource`, so a facilitator can keep
-- editing a withdrawn specialty's contents in order to get it ready to switch
-- back on.

-- Available = you may reach it AND it is still in circulation, where the
-- people who can turn it back on are exempt from the second half.
--
-- SECURITY DEFINER and a pinned search_path, matching the helpers it builds
-- on: a policy that called a function resolved through the caller's own
-- search_path could be pointed at a different one.
create or replace function public.specialty_is_available(_user_id uuid, _specialty_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.can_access_specialty(_user_id, _specialty_id)
     and exists (
       select 1
       from public.specialties s
       where s.id = _specialty_id
         and s.deleted_at is null
         and (
           s.is_active
           or public.is_admin(_user_id)
           or public.is_facilitator_for(_user_id, s.id)
         )
     );
$$;

comment on function public.specialty_is_available(uuid, uuid) is
  'Read visibility for a specialty and everything hanging off it: assigned to it, not deleted, and still active unless you are one of the people who can reactivate it.';

-- The specialty itself. The two admin policies are left alone, so an admin
-- keeps full read of inactive and soft-deleted rows for the admin panel, and
-- the `anon` policy already required is_active.
drop policy if exists "specialties readable by permitted users" on public.specialties;
create policy "specialties readable by permitted users"
  on public.specialties for select to authenticated
  using (deleted_at is null and public.specialty_is_available(auth.uid(), id));

-- Sections, and everything filed in them.
drop policy if exists "subsections follow specialty access" on public.subsections;
create policy "subsections follow specialty access"
  on public.subsections for select to authenticated
  using (public.specialty_is_available(auth.uid(), specialty_id));

drop policy if exists "resources follow subsection access" on public.resources;
create policy "resources follow subsection access"
  on public.resources for select to authenticated
  using (exists (
    select 1 from public.subsections s
    where s.id = resources.subsection_id
      and public.specialty_is_available(auth.uid(), s.specialty_id)
  ));

drop policy if exists "folders follow subsection access" on public.resource_folders;
create policy "folders follow subsection access"
  on public.resource_folders for select to authenticated
  using (exists (
    select 1 from public.subsections s
    where s.id = resource_folders.subsection_id
      and public.specialty_is_available(auth.uid(), s.specialty_id)
  ));

drop policy if exists "subheadings follow subsection access" on public.resource_subheadings;
create policy "subheadings follow subsection access"
  on public.resource_subheadings for select to authenticated
  using (exists (
    select 1 from public.subsections s
    where s.id = resource_subheadings.subsection_id
      and public.specialty_is_available(auth.uid(), s.specialty_id)
  ));

-- Threads.
drop policy if exists "discussions follow specialty access" on public.discussions;
create policy "discussions follow specialty access"
  on public.discussions for select to authenticated
  using (public.specialty_is_available(auth.uid(), specialty_id));

-- Contacts. A contact with no specialty is the general directory and stays
-- readable by anyone signed in, which is what the Key contacts page shows.
drop policy if exists "contacts readable by signed-in users" on public.contacts;
create policy "contacts readable by signed-in users"
  on public.contacts for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (
      archived is not true
      and (specialty_id is null or public.specialty_is_available(auth.uid(), specialty_id))
    )
  );
