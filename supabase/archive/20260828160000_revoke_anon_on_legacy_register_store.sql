-- Close public access to the legacy register_store table.
--
-- register_store was created for the old public/teaching-register.html, with
-- policies that granted the anon role select/insert/update using (true). Because
-- the publishable key ships in every client bundle, that made the whole teaching
-- register — named trainees, attendance, excuses, maternity/OOP/CCT status —
-- readable and overwritable by anyone on the internet.
--
-- That page has been replaced by the rebuilt register (public/teaching-register/),
-- which runs against its own Supabase project and its own locked-down schema.
-- Nothing in this project reads or writes register_store any more, so revoking
-- anonymous access here has no effect on the running application.
--
-- The row is left in place: it still holds the historical attendance data. Drop
-- the table only once that history has been confirmed as migrated or no longer
-- needed.

drop policy if exists "Anyone can read the teaching register" on public.register_store;
drop policy if exists "Anyone can create the teaching register" on public.register_store;
drop policy if exists "Anyone can update the teaching register" on public.register_store;

-- Read stays available to signed-in users so the history can still be exported
-- from the dashboard or a support session; nothing may write to it.
create policy "Authenticated users can read the legacy register"
  on public.register_store for select
  to authenticated
  using (true);

revoke all on public.register_store from anon;
revoke insert, update, delete on public.register_store from authenticated;
grant select on public.register_store to authenticated;
