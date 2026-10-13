-- Let people clear an answered specialty request from their profile.
--
-- An approved or declined request, with the reviewer's note, otherwise stays on
-- the profile page for good. Deleting the row is not the way to clear it: it is
-- also the reviewers' record of the decision. So the person hides it from
-- themselves instead, and only that: the row, the decision and the note are
-- untouched for everybody who reviews requests.
--
-- authenticated has no UPDATE on this table (decisions go through
-- decide_specialty_access_request), so clearing goes through a function that
-- can set this one column and nothing else.

begin;

alter table public.specialty_access_requests
  add column if not exists cleared_by_user_at timestamptz;

create or replace function public.clear_specialty_access_request(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.specialty_access_requests
     set cleared_by_user_at = now()
   where id = _request_id
     and user_id = auth.uid()
     and status <> 'pending'
     and cleared_by_user_at is null;
end;
$$;

revoke execute on function public.clear_specialty_access_request(uuid) from public, anon;
grant execute on function public.clear_specialty_access_request(uuid) to authenticated;

commit;
