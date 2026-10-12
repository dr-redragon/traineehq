-- Make the resources bucket's policies read the OBJECT's path.
--
-- All four policies on storage.objects for the `resources` bucket said
--
--   exists (select 1 from public.subsections s
--            where s.id::text = (storage.foldername(name))[2] and ...)
--
-- intending `name` to be the object's path, {specialty}/{subsection}/{file}.
-- Inside that subquery an unqualified `name` resolves to the NEAREST table that
-- has such a column, and `subsections` has one. So the policy compared each
-- subsection's id with the second segment of the subsection's own *title*, and
-- the object being read or written was never consulted at all.
--
-- Two consequences, one visible and one not:
--
--   * For ordinary titles the comparison is never true, so nobody but an admin
--     could read, upload, replace or delete a file — trainees and facilitators
--     were refused by a rule that had nothing to do with them.
--
--   * Anyone who can rename a subsection — a facilitator, for theirs — could
--     title it "x/<its own id>/y". The comparison is then true regardless of the
--     object, and the EXISTS passes for every file in the bucket: every
--     specialty, every deanery. A facilitator could read, overwrite and delete
--     all of it, and every trainee on their specialty could read all of it.
--
-- Qualifying the column as `objects.name` makes the subquery read the object,
-- which is what was always meant. Reads also move from can_access_specialty to
-- specialty_is_available, matching the `resources` rows themselves since
-- 20260920120000: a withdrawn specialty's files go out of circulation with it.

-- ALTER POLICY rather than drop-and-create: storage.objects belongs to
-- supabase_storage_admin, and on the live project dropping and recreating its
-- policies from a migration hung, while altering them in place is immediate.
-- The four policies have existed since the baseline.

begin;

alter policy "resources readable by permitted users" on storage.objects
  using (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(objects.name))[2]
          and public.specialty_is_available(auth.uid(), s.specialty_id)
      )
    )
  );

alter policy "resources writable by managers" on storage.objects
  with check (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(objects.name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  );

-- USING decides which existing objects may be touched; WITH CHECK decides where
-- they may end up, so a move cannot carry a file into a subsection the caller
-- does not manage. Left out, WITH CHECK defaults to USING, but saying it keeps
-- the two halves visible.
alter policy "resources updatable by managers" on storage.objects
  using (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(objects.name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  )
  with check (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(objects.name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  );

alter policy "resources deletable by managers" on storage.objects
  using (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(objects.name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  );

commit;
