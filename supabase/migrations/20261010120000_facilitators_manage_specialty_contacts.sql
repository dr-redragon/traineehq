-- Let a specialty's facilitators look after that specialty's key contacts.
--
-- Contacts were admin-only to write:
--
--   "admins manage contacts"  for all  using (is_admin(uid))
--
-- so the people who actually know who the TPD and the trainee rep are this
-- year — the specialty's own facilitators, who can already edit its files and
-- notices — had to ask an admin to change a phone number. The Key Contacts tab
-- on a specialty page now offers adding, editing and removing to whoever can
-- edit that specialty, and these policies are what make that true rather than
-- a button that fails.
--
-- Scope is deliberately narrow. A facilitator may only touch contacts that
-- belong to a specialty they facilitate. A contact with no specialty is the
-- general directory every specialty shows, and stays the admins' alone: a
-- facilitator of one specialty changing it would change it for all of them.
--
-- The admin policy is left exactly as it was; these sit beside it, and
-- policies of the same command are OR-ed together.

-- Adding: only into a specialty you facilitate.
drop policy if exists "facilitators add specialty contacts" on public.contacts;
create policy "facilitators add specialty contacts"
  on public.contacts for insert to authenticated
  with check (
    specialty_id is not null
    and public.is_facilitator_for(auth.uid(), specialty_id)
  );

-- Editing: rows of a specialty you facilitate. The check repeats the
-- condition so an edit cannot move a contact into a specialty the editor does
-- not manage, or out into the general directory.
drop policy if exists "facilitators edit specialty contacts" on public.contacts;
create policy "facilitators edit specialty contacts"
  on public.contacts for update to authenticated
  using (
    specialty_id is not null
    and public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    specialty_id is not null
    and public.is_facilitator_for(auth.uid(), specialty_id)
  );

-- Removing: same rows. No `with check` — there is no resulting row.
drop policy if exists "facilitators remove specialty contacts" on public.contacts;
create policy "facilitators remove specialty contacts"
  on public.contacts for delete to authenticated
  using (
    specialty_id is not null
    and public.is_facilitator_for(auth.uid(), specialty_id)
  );
