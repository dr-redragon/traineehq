-- Access requests: turn away people who already have an account, and let
-- people who do have one ask for another specialty.
--
-- 1. AN EMAIL THAT ALREADY HAS AN ACCOUNT CANNOT ASK FOR ONE.
--
--    The Request Access form took anyone, so somebody who had forgotten they
--    were registered — or forgotten their password — filled it in, an admin
--    approved it, and approving an existing address quietly did nothing but
--    send a reset link. The form now asks email_has_account() first and sends
--    them to "forgot password" instead. The trigger is the backstop for a
--    client that skips the question: the row is refused either way.
--
--    This does let an anonymous caller learn whether an address is registered.
--    That is the behaviour that was asked for, and it is the same thing the
--    form's answer tells them; it is a yes/no on one address at a time, never
--    a list.
--
-- 2. SPECIALTY ACCESS REQUESTS.
--
--    A signed-in user — trainee or facilitator — could see only the specialties
--    they were put on, and the only way onto another was to ask an admin
--    outside the app. specialty_access_requests is that ask, made from the
--    profile page. Reviewers are the admins who can see the specialty (an
--    admin's deanery scope still applies) and the specialty's own facilitators.
--    A decision goes through decide_specialty_access_request(), which enrols
--    the user on approval in the same transaction, so an approved request can
--    never leave someone without the access it promised.

-- ----------------------------------------------------------------------------
-- 1. Existing accounts
-- ----------------------------------------------------------------------------
create or replace function public.email_has_account(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(coalesce(_email, '')))
  );
$$;

revoke execute on function public.email_has_account(text) from public;
grant execute on function public.email_has_account(text) to anon, authenticated;

create or replace function public.access_requests_reject_existing_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.email_has_account(NEW.email) then
    raise exception 'An account is already registered with this email address'
      using errcode = 'unique_violation';
  end if;
  return NEW;
end;
$$;

-- A trigger function, not an API: nobody should call it over /rpc.
revoke execute on function public.access_requests_reject_existing_account() from public, anon, authenticated;

drop trigger if exists reject_existing_account on public.access_requests;
create trigger reject_existing_account
  before insert on public.access_requests
  for each row execute function public.access_requests_reject_existing_account();

-- ----------------------------------------------------------------------------
-- 2. Specialty access requests
-- ----------------------------------------------------------------------------
create table if not exists public.specialty_access_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  reason        text check (reason is null or char_length(reason) <= 2000),
  status        public.request_status not null default 'pending',
  review_note   text check (review_note is null or char_length(review_note) <= 2000),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One open request per person per specialty; a decided one can be asked again.
create unique index if not exists specialty_access_requests_one_open
  on public.specialty_access_requests (user_id, specialty_id)
  where status = 'pending';
create index if not exists specialty_access_requests_status_idx
  on public.specialty_access_requests (status, created_at desc);
create index if not exists specialty_access_requests_specialty_idx
  on public.specialty_access_requests (specialty_id);
create index if not exists specialty_access_requests_reviewed_by_idx
  on public.specialty_access_requests (reviewed_by);

drop trigger if exists set_updated_at on public.specialty_access_requests;
create trigger set_updated_at before update on public.specialty_access_requests
  for each row execute function public.update_updated_at_column();

alter table public.specialty_access_requests enable row level security;
alter table public.specialty_access_requests force row level security;

-- Who may decide a request for this specialty: a super admin, an admin whose
-- deanery holds it, or a facilitator of it (or of its parent).
create or replace function public.can_review_specialty(_user_id uuid, _specialty_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select id, deanery_id, parent_specialty_id
    from public.specialties
    where id = _specialty_id
  )
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1 from public.user_roles ur, target t
      where ur.user_id = _user_id
        and ur.role = 'admin'
        and (ur.deanery_id is null or ur.deanery_id = t.deanery_id)
    )
    or exists (
      select 1 from public.facilitator_specialties fs, target t
      where fs.user_id = _user_id
        and fs.specialty_id in (t.id, t.parent_specialty_id)
    );
$$;

revoke execute on function public.can_review_specialty(uuid, uuid) from public, anon;
grant execute on function public.can_review_specialty(uuid, uuid) to authenticated, service_role;
-- service_role: the access-request-email function asks it before emailing
-- the outcome of a decision.

-- Is this a specialty that can be asked for? Security definer because the
-- person asking cannot read it yet: a subquery on specialties inside the
-- insert policy would run under their own RLS and never find the row.
create or replace function public.specialty_is_live(_specialty_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.specialties s
    join public.deaneries d on d.id = s.deanery_id
    where s.id = _specialty_id
      and s.is_active
      and s.deleted_at is null
      and d.is_active
  );
$$;

revoke execute on function public.specialty_is_live(uuid) from public, anon;
grant execute on function public.specialty_is_live(uuid) to authenticated;

-- Asking: only for yourself, only pending, and only for a live specialty you
-- cannot already see.
drop policy if exists "users request specialty access" on public.specialty_access_requests;
create policy "users request specialty access"
  on public.specialty_access_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
    and not public.can_access_specialty(auth.uid(), specialty_id)
    and public.specialty_is_live(specialty_id)
  );

drop policy if exists "users read own specialty requests" on public.specialty_access_requests;
create policy "users read own specialty requests"
  on public.specialty_access_requests for select to authenticated
  using (user_id = auth.uid() or public.can_review_specialty(auth.uid(), specialty_id));

-- Withdrawing a request you have not had an answer to yet.
drop policy if exists "users withdraw own pending specialty requests" on public.specialty_access_requests;
create policy "users withdraw own pending specialty requests"
  on public.specialty_access_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- No update policy: decisions go through the function below.
revoke all on public.specialty_access_requests from anon;
revoke update, truncate, references, trigger on public.specialty_access_requests from authenticated;
grant select, insert, delete on public.specialty_access_requests to authenticated;

create or replace function public.decide_specialty_access_request(
  _request_id uuid,
  _approve    boolean,
  _note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _req public.specialty_access_requests%rowtype;
  _note_clean text := nullif(trim(coalesce(_note, '')), '');
begin
  select * into _req
  from public.specialty_access_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;
  if not public.can_review_specialty(auth.uid(), _req.specialty_id) then
    raise exception 'Not authorised to review this request' using errcode = '42501';
  end if;
  if _req.status <> 'pending' then
    raise exception 'This request has already been decided';
  end if;
  if not _approve and _note_clean is null then
    raise exception 'A reason is required when declining a request';
  end if;

  update public.specialty_access_requests
     set status      = case when _approve then 'approved' else 'rejected' end::public.request_status,
         review_note = left(_note_clean, 2000),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = _request_id;

  if _approve then
    insert into public.trainee_specialties (user_id, specialty_id)
    values (_req.user_id, _req.specialty_id)
    on conflict (user_id, specialty_id) do nothing;
  end if;

  insert into public.audit_log (user_id, action, details)
  values (
    auth.uid(),
    'specialty_access_request.decided',
    jsonb_build_object(
      'request_id', _req.id,
      'subject_user_id', _req.user_id,
      'specialty_id', _req.specialty_id,
      'status', case when _approve then 'approved' else 'rejected' end
    )
  );
end;
$$;

revoke execute on function public.decide_specialty_access_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_specialty_access_request(uuid, boolean, text) to authenticated;

-- What the caller could ask for: every live specialty in an active deanery
-- that they cannot already see. Specialties are otherwise unreadable to
-- someone not on them, so the profile page has no other way to list them.
create or replace function public.requestable_specialties()
returns table (
  id                  uuid,
  short_name          text,
  name                text,
  parent_specialty_id uuid,
  deanery_id          uuid,
  deanery_name        text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.short_name, s.name, s.parent_specialty_id, s.deanery_id, d.name
  from public.specialties s
  join public.deaneries d on d.id = s.deanery_id
  where auth.uid() is not null
    and s.is_active
    and s.deleted_at is null
    and d.is_active
    and not public.can_access_specialty(auth.uid(), s.id)
  order by d.name, s.sort_order, s.short_name;
$$;

revoke execute on function public.requestable_specialties() from public, anon;
grant execute on function public.requestable_specialties() to authenticated;
