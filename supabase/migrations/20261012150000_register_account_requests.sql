-- Let a register owner ask for an account for a colleague who has none.
--
-- Until now, adding somebody to a register by email failed for anyone without
-- a TraineeHQ account unless the owner was a TraineeHQ admin: the owner had to
-- tell the colleague to fill in the public Request Access form themselves.
-- register-invite now files that request on the colleague's behalf, naming the
-- register, and approving it does three things at once: creates the account,
-- adds them to the register, and makes them a facilitator of the register's
-- specialty.
--
-- Because approval grants a facilitator role, only an ADMIN of the deanery may
-- see or decide one of these. A facilitator reviews ordinary requests for their
-- specialty (20261012120000), but must not be able to mint other facilitators.
--
-- The new columns are written only by the service role (register-invite). The
-- public form and reviewers keep exactly the columns they already used:
-- insert and update privileges are narrowed to named columns, so nobody can
-- attach a register to a request from the browser, or detach one to get it
-- past the admin-only rule.

begin;

alter table public.access_requests
  add column if not exists register_id   uuid references public.registers(id) on delete set null,
  add column if not exists register_role public.register_role,
  add column if not exists requested_by  uuid references auth.users(id) on delete set null;

comment on column public.access_requests.register_id is
  'Set when a register owner asked for this account. Approval adds the person to the register and makes them a facilitator of its specialty.';
comment on column public.access_requests.requested_by is
  'The register owner who asked for this account, when it was not the applicant.';

-- The public form: the applicant's own details, nothing else.
revoke insert on public.access_requests from anon, authenticated;
grant insert (first_name, last_name, email, training_grade, reason, deanery_id, specialty_id)
  on public.access_requests to anon, authenticated;

-- Reviewers: the decision, nothing else.
revoke update on public.access_requests from authenticated;
grant update (status, review_note, reviewed_by, reviewed_at)
  on public.access_requests to authenticated;

alter policy "reviewers read access requests" on public.access_requests
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (register_id is null and specialty_id is not null
        and public.can_review_specialty(auth.uid(), specialty_id))
  );

alter policy "reviewers update access requests" on public.access_requests
  using (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (register_id is null and specialty_id is not null
        and public.can_review_specialty(auth.uid(), specialty_id))
  )
  with check (
    public.is_admin_of_deanery(auth.uid(), coalesce(deanery_id, public.specialty_deanery(specialty_id)))
    or (register_id is null and specialty_id is not null
        and public.can_review_specialty(auth.uid(), specialty_id))
  );

commit;
