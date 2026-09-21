-- Let a manager edit and remove a notice somebody else wrote.
--
-- One policy covered every write on `specialty_notices`:
--
--   for all
--   using       (is_admin(uid) or is_facilitator_for(uid, specialty_id))
--   with check  (author_id = uid and (is_admin(uid) or is_facilitator_for(...)))
--
-- `with check` is right for an insert — you post under your own name, not
-- somebody else's. On an update it is applied to the row as it will be, and
-- the row keeps the author it already had, so `author_id = uid` is asking
-- "did you write this?" rather than "may you change it?". A TPD correcting a
-- colleague's notice was refused, and refused as a policy violation, which
-- reads as the feature being broken rather than as a permission.
--
-- Splitting the policy by command says the intended thing in each case:
-- posting is yours, editing and removing are the specialty's.

drop policy if exists "managers write notices" on public.specialty_notices;

-- Posting: under your own name, and only where you manage.
create policy "managers post notices"
  on public.specialty_notices for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin(auth.uid()) or public.is_facilitator_for(auth.uid(), specialty_id))
  );

-- Editing: anyone who manages the specialty, whoever wrote it. The check
-- repeats the condition so an update cannot move a notice into a specialty
-- the editor does not manage.
create policy "managers edit notices"
  on public.specialty_notices for update to authenticated
  using (public.is_admin(auth.uid()) or public.is_facilitator_for(auth.uid(), specialty_id))
  with check (public.is_admin(auth.uid()) or public.is_facilitator_for(auth.uid(), specialty_id));

-- Removing: same audience. No `with check` — there is no resulting row.
create policy "managers remove notices"
  on public.specialty_notices for delete to authenticated
  using (public.is_admin(auth.uid()) or public.is_facilitator_for(auth.uid(), specialty_id));
