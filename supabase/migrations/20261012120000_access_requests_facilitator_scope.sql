-- A facilitator reviews access requests for their own specialties only.
--
-- The reviewer policies on access_requests let anybody holding the
-- facilitator role read and update every request on the platform — every
-- applicant's name, email, grade and stated reason, from every deanery — and
-- change any of them. 20261011150000 scoped the admin half to the admin's
-- deanery; this scopes the facilitator half to the requests a facilitator can
-- actually decide: those for a specialty they facilitate, or its child.
-- can_review_specialty() (20261011090000) already says exactly that.
--
-- A request with no specialty is for the admins of its deanery.
--
-- ALTER, not DROP/CREATE: see 20261011130000.

begin;

alter policy "reviewers read access requests" on public.access_requests
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (specialty_id is not null and public.can_review_specialty(auth.uid(), specialty_id))
  );

alter policy "reviewers update access requests" on public.access_requests
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (specialty_id is not null and public.can_review_specialty(auth.uid(), specialty_id))
  )
  with check (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (specialty_id is not null and public.can_review_specialty(auth.uid(), specialty_id))
  );

commit;
