-- ============================================================================
-- Multi-register tenancy: many teaching registers, one per specialty per deanery
--
-- Stage 1 of docs/REGISTER-INTEGRATION-PLAN.md.
--
-- The teaching register at register.traineehq.com is a single-tenant app: its
-- entire dataset is one JSONB blob in one row keyed 'default'. This migration
-- brings that model into TraineeHQ as many registers, each with its own blob and
-- its own membership list.
--
-- The organising idea is that `specialties` is ALREADY deanery-scoped
-- (unique (deanery_id, slug)), so "a register per specialty per deanery" needs no
-- new tenancy dimension — it is one register per `specialties` row, enforced by
-- unique (specialty_id) on `registers`.
--
-- ACCESS CONTROL, stated plainly because it is the point of this migration:
--
--   Register membership is an EXPLICIT PER-USER GRANT and is never derived from
--   public.user_roles. A TraineeHQ trainee may be a register editor. A TraineeHQ
--   admin has no register access at all until someone grants it. The two
--   permission systems are orthogonal and neither consults the other.
--
--   There is deliberately no god-mode read. A super_admin can manage membership
--   but cannot silently read a register's data — they must first grant
--   themselves, which is recorded in register_members.granted_by.
--
--   Roles are 'owner' and 'editor' only. Trainees never hold a membership row:
--   they reach check-in and feedback anonymously through a session link, exactly
--   as they do today.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.register_role as enum ('owner', 'editor');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- One register per specialty. `specialties.deanery_id` supplies the deanery, so
-- the unique constraint below IS "one register per specialty per deanery"; there
-- is no second copy of deanery_id here to drift out of step.
--
-- on delete restrict, not cascade: deleting a specialty must not silently take a
-- register's attendance history with it.
create table if not exists public.registers (
  id           uuid primary key default gen_random_uuid(),
  specialty_id uuid not null unique references public.specialties(id) on delete restrict,
  name         text not null,
  slug         text not null unique,
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The membership grant. This table alone decides who may open a register.
create table if not exists public.register_members (
  register_id uuid not null references public.registers(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.register_role not null default 'editor',
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (register_id, user_id)
);

create table if not exists public.register_access_requests (
  id            uuid primary key default gen_random_uuid(),
  register_id   uuid not null references public.registers(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  reason        text,
  status        public.request_status not null default 'pending',
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One OPEN request per person per register. Decided requests accumulate as
-- history, so this is a partial index rather than a plain unique constraint.
create unique index if not exists register_access_requests_one_open
  on public.register_access_requests (register_id, user_id)
  where status = 'pending';

-- Invites are separate from requests because the invitee may have no account
-- yet. Only the hash of the token is stored; the raw token exists solely in the
-- email. The RPCs that create and accept invites arrive in Stage 5, alongside
-- the edge function that sends them — the table is defined here so the tenancy
-- schema is complete in one migration.
create table if not exists public.register_invites (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers(id) on delete cascade,
  email       text not null,
  role        public.register_role not null default 'editor',
  invited_by  uuid references auth.users(id) on delete set null,
  token_hash  text not null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists register_invites_one_open
  on public.register_invites (register_id, lower(email))
  where accepted_at is null;

-- The register itself: the same JSONB blob the standalone app already uses
-- (trainees, sessions, attendance, excused, status), now one row per register.
--
-- `version` exists because the blob is written whole. The standalone register is
-- run by one person, so last-write-wins was harmless; with a team of editors per
-- register, two people saving in the same minute would silently discard one set
-- of edits. save_register() below refuses a write whose expected version has
-- moved on, and the client re-reads and retries.
create table if not exists public.register_stores (
  register_id uuid primary key references public.registers(id) on delete cascade,
  data        jsonb  not null default '{}'::jsonb,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- Indexes on the columns these tables are actually filtered by
-- ----------------------------------------------------------------------------
-- "which registers am I in?" — the query behind every page load of /registers.
create index if not exists register_members_user_idx
  on public.register_members (user_id);

create index if not exists register_access_requests_register_status_idx
  on public.register_access_requests (register_id, status);

create index if not exists register_access_requests_user_idx
  on public.register_access_requests (user_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers, using the baseline's shared trigger function
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.registers;
create trigger set_updated_at before update on public.registers
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_updated_at on public.register_access_requests;
create trigger set_updated_at before update on public.register_access_requests
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- ACCESS HELPERS
--
-- security definer so RLS policies can call them without the caller needing to
-- read register_members directly (which would recurse through that table's own
-- policy).
-- ============================================================================

-- Deliberately does NOT consult public.user_roles. Membership is an explicit
-- grant: that is what lets a trainee be an editor and a TraineeHQ admin be a
-- stranger to every register.
create or replace function public.is_register_member(_user_id uuid, _register_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.register_members
    where user_id = _user_id and register_id = _register_id
  );
$$;

create or replace function public.is_register_owner(_user_id uuid, _register_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.register_members
    where user_id = _user_id and register_id = _register_id and role = 'owner'
  );
$$;

-- The capability to create a NEW register. Note what this is not: it grants no
-- access to any register that already exists. Held by TraineeHQ admins and by
-- anyone who already holds a register, so an established organiser can start a
-- second one without going to an admin.
create or replace function public.can_create_register(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin(_user_id)
    or exists (select 1 from public.register_members where user_id = _user_id);
$$;

-- ============================================================================
-- THE DIRECTORY
--
-- A security-definer function rather than a view, following the pattern of
-- get_profile_display_names() in the baseline.
--
-- It cannot be a view: the join to `specialties` would be filtered by that
-- table's own RLS (can_access_specialty), which for a trainee is "specialties I
-- am enrolled on" — hiding exactly the registers they need to see in order to
-- request access to them. The columns returned are names and counts only; the
-- register's data is in register_stores and stays behind is_register_member.
-- ============================================================================
create or replace function public.register_directory()
returns table (
  id             uuid,
  name           text,
  slug           text,
  deanery_name   text,
  specialty_name text,
  member_count   bigint,
  i_am_member    boolean,
  my_request     public.request_status
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.name,
    r.slug,
    d.name as deanery_name,
    s.name as specialty_name,
    (select count(*) from public.register_members m where m.register_id = r.id),
    public.is_register_member(auth.uid(), r.id),
    (select ar.status
       from public.register_access_requests ar
      where ar.register_id = r.id
        and ar.user_id = auth.uid()
      order by ar.created_at desc
      limit 1)
  from public.registers r
  join public.specialties s on s.id = r.specialty_id
  join public.deaneries   d on d.id = s.deanery_id
  where r.is_active
  order by d.name, s.name;
$$;

-- ============================================================================
-- WORKFLOW RPCs
--
-- Membership changes and blob writes go through these rather than through
-- direct table writes, so the rules (no self-approval, never remove the last
-- owner, version guard) live in one place and cannot be bypassed by a client
-- holding a valid session.
-- ============================================================================

-- Create a register and become its owner, atomically.
--
-- Requires both the capability (can_create_register) and visibility of the
-- target specialty (can_access_specialty) — the latter is what stops an admin of
-- one deanery opening a register in another, and confines a trainee-editor to
-- the specialties they are enrolled on.
create or replace function public.create_register(_specialty_id uuid, _name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _id     uuid;
  _slug   text;
  _label  text;
begin
  if _caller is null then
    raise exception 'You must be signed in to create a register';
  end if;

  if not public.can_create_register(_caller) then
    raise exception 'You do not have permission to create a register'
      using hint = 'Registers can be created by administrators, or by anyone who already belongs to one.';
  end if;

  if not public.can_access_specialty(_caller, _specialty_id) then
    raise exception 'That specialty is not one you can create a register for';
  end if;

  -- Slug is deanery + specialty, both of which are already unique in
  -- combination, so this needs no disambiguating suffix.
  select d.slug || '-' || s.slug, d.short_name || ' · ' || s.name
    into _slug, _label
    from public.specialties s
    join public.deaneries   d on d.id = s.deanery_id
   where s.id = _specialty_id
     and s.deleted_at is null;

  if _slug is null then
    raise exception 'That specialty does not exist';
  end if;

  begin
    insert into public.registers (specialty_id, name, slug, created_by)
    values (_specialty_id, coalesce(nullif(btrim(_name), ''), _label), _slug, _caller)
    returning id into _id;
  exception when unique_violation then
    -- The one-per-specialty rule surfacing as guidance rather than an error
    -- code: this is the "it already exists, ask to join it" path.
    raise exception 'A register already exists for that specialty'
      using hint = 'Find it in the register directory and request access instead.';
  end;

  insert into public.register_stores (register_id, updated_by) values (_id, _caller);

  insert into public.register_members (register_id, user_id, role, granted_by)
  values (_id, _caller, 'owner', _caller);

  return _id;
end;
$$;

-- Ask to join an existing register.
create or replace function public.request_register_access(_register_id uuid, _reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _id     uuid;
begin
  if _caller is null then
    raise exception 'You must be signed in to request access';
  end if;

  if not exists (select 1 from public.registers where id = _register_id and is_active) then
    raise exception 'That register does not exist';
  end if;

  if public.is_register_member(_caller, _register_id) then
    raise exception 'You already have access to that register';
  end if;

  begin
    insert into public.register_access_requests (register_id, user_id, reason)
    values (_register_id, _caller, nullif(btrim(_reason), ''))
    returning id into _id;
  exception when unique_violation then
    raise exception 'You already have a request waiting on that register';
  end;

  return _id;
end;
$$;

-- Approve or refuse a request.
--
-- Any member of the register may decide, which makes approval transitive: an
-- approved editor can immediately admit others. That is the intended behaviour;
-- restricting it is a one-line change to is_register_member below.
create or replace function public.decide_register_access(
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
  _caller uuid := auth.uid();
  _req    public.register_access_requests;
begin
  if _caller is null then
    raise exception 'You must be signed in to decide a request';
  end if;

  select * into _req from public.register_access_requests where id = _request_id;

  if _req.id is null then
    raise exception 'That request no longer exists';
  end if;

  if _req.status <> 'pending' then
    raise exception 'That request has already been decided';
  end if;

  if not public.is_register_member(_caller, _req.register_id) then
    raise exception 'Only members of that register can decide who joins it';
  end if;

  -- Without this, anyone who could see their own pending row could approve it.
  if _req.user_id = _caller then
    raise exception 'You cannot approve your own request for access';
  end if;

  if _approve then
    insert into public.register_members (register_id, user_id, role, granted_by)
    values (_req.register_id, _req.user_id, 'editor', _caller)
    on conflict (register_id, user_id) do nothing;
  end if;

  update public.register_access_requests
     set status        = case when _approve then 'approved' else 'rejected' end::public.request_status,
         decided_by    = _caller,
         decided_at    = now(),
         decision_note = nullif(btrim(_note), '')
   where id = _request_id;
end;
$$;

-- Remove a member, or leave a register yourself.
--
-- The last owner cannot be removed: a register with no owner can never have its
-- membership managed again, and (decision 4) no super_admin can quietly step in
-- to fix it.
create or replace function public.remove_register_member(_register_id uuid, _user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller       uuid := auth.uid();
  _target_role  public.register_role;
  _owner_count  integer;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  select role into _target_role
    from public.register_members
   where register_id = _register_id and user_id = _user_id;

  if _target_role is null then
    raise exception 'That person is not a member of this register';
  end if;

  -- An owner may remove anyone; anyone may remove themselves.
  if not (public.is_register_owner(_caller, _register_id) or _caller = _user_id) then
    raise exception 'Only an owner can remove another member';
  end if;

  if _target_role = 'owner' then
    select count(*) into _owner_count
      from public.register_members
     where register_id = _register_id and role = 'owner';

    if _owner_count <= 1 then
      raise exception 'This is the register''s only owner'
        using hint = 'Make somebody else an owner first, then remove this one.';
    end if;
  end if;

  delete from public.register_members
   where register_id = _register_id and user_id = _user_id;
end;
$$;

-- Write the register blob, refusing a write built on a stale read.
--
-- Returns the new version. A caller that gets the conflict error should re-read
-- register_stores, replay its edit onto the newer blob and call again.
create or replace function public.save_register(
  _register_id      uuid,
  _data             jsonb,
  _expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller  uuid := auth.uid();
  _version bigint;
begin
  if _caller is null or not public.is_register_member(_caller, _register_id) then
    raise exception 'You do not have access to that register';
  end if;

  update public.register_stores
     set data       = _data,
         version    = version + 1,
         updated_at = now(),
         updated_by = _caller
   where register_id = _register_id
     and version     = _expected_version
  returning version into _version;

  if _version is null then
    -- Either the register is gone, or somebody else saved first. Distinguish
    -- them, because the second is recoverable by re-reading and the first is not.
    if not exists (select 1 from public.register_stores where register_id = _register_id) then
      raise exception 'That register does not exist';
    end if;

    raise exception 'This register was saved by somebody else while you were editing'
      using errcode = '40001',
            hint    = 'Reload to pick up their changes, then make your edit again.';
  end if;

  return _version;
end;
$$;

-- ============================================================================
-- FUNCTION GRANTS
--
-- Supabase's default privileges grant EXECUTE on every new function to anon,
-- authenticated and service_role at creation time, so anon must be revoked BY
-- NAME. Left in place, register_directory() would hand the full list of
-- registers to any anonymous caller of /rest/v1/rpc, and the predicates would
-- let one probe who belongs to what.
-- ============================================================================
revoke execute on function public.is_register_member(uuid, uuid)          from public, anon;
revoke execute on function public.is_register_owner(uuid, uuid)           from public, anon;
revoke execute on function public.can_create_register(uuid)               from public, anon;
revoke execute on function public.register_directory()                    from public, anon;
revoke execute on function public.create_register(uuid, text)             from public, anon;
revoke execute on function public.request_register_access(uuid, text)     from public, anon;
revoke execute on function public.decide_register_access(uuid, boolean, text) from public, anon;
revoke execute on function public.remove_register_member(uuid, uuid)      from public, anon;
revoke execute on function public.save_register(uuid, jsonb, bigint)      from public, anon;

-- RLS predicates are evaluated as the querying role, so signed-in users must
-- keep EXECUTE on the helpers their policies reference.
grant execute on function public.is_register_member(uuid, uuid)           to authenticated;
grant execute on function public.is_register_owner(uuid, uuid)            to authenticated;
grant execute on function public.can_create_register(uuid)                to authenticated;
grant execute on function public.register_directory()                     to authenticated;
grant execute on function public.create_register(uuid, text)              to authenticated;
grant execute on function public.request_register_access(uuid, text)      to authenticated;
grant execute on function public.decide_register_access(uuid, boolean, text) to authenticated;
grant execute on function public.remove_register_member(uuid, uuid)       to authenticated;
grant execute on function public.save_register(uuid, jsonb, bigint)       to authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- As everywhere else in this schema, RLS is the only authorisation boundary:
-- the browser talks to PostgREST with the user's own JWT and the React route
-- guards are convenience only.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'registers','register_members','register_access_requests',
    'register_invites','register_stores'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- registers --
-- The directory is meant to be browsable: you cannot request access to a
-- register you cannot see exists. Name, slug and active flag only — the data is
-- in register_stores, behind membership.
drop policy if exists "registers readable by signed-in users" on public.registers;
create policy "registers readable by signed-in users"
  on public.registers for select to authenticated using (true);

-- Creation goes through create_register(), which also makes the creator an
-- owner; a bare insert would produce an ownerless register nobody can manage.
drop policy if exists "owners update their register" on public.registers;
create policy "owners update their register"
  on public.registers for update to authenticated
  using (public.is_register_owner(auth.uid(), id))
  with check (public.is_register_owner(auth.uid(), id));

drop policy if exists "owners delete their register" on public.registers;
create policy "owners delete their register"
  on public.registers for delete to authenticated
  using (public.is_register_owner(auth.uid(), id));

-- --------------------------------------------------------- register_members --
-- You can see the membership of registers you belong to, and your own rows
-- everywhere else (so the app can tell you which registers you are in without
-- reading anyone else's grants).
drop policy if exists "members read membership of their registers" on public.register_members;
create policy "members read membership of their registers"
  on public.register_members for select to authenticated
  using (user_id = auth.uid() or public.is_register_member(auth.uid(), register_id));

-- Owners may add members directly (an admin adding a colleague without waiting
-- for a request). Everyone else arrives through decide_register_access().
drop policy if exists "owners add members" on public.register_members;
create policy "owners add members"
  on public.register_members for insert to authenticated
  with check (public.is_register_owner(auth.uid(), register_id));

-- Promoting and demoting owners. Removal is deliberately absent: it goes
-- through remove_register_member(), which refuses to strip the last owner.
drop policy if exists "owners change member roles" on public.register_members;
create policy "owners change member roles"
  on public.register_members for update to authenticated
  using (public.is_register_owner(auth.uid(), register_id))
  with check (public.is_register_owner(auth.uid(), register_id));

-- ------------------------------------------------- register_access_requests --
-- A member sees the queue for their register; everyone sees their own requests.
drop policy if exists "read own and reviewable requests" on public.register_access_requests;
create policy "read own and reviewable requests"
  on public.register_access_requests for select to authenticated
  using (user_id = auth.uid() or public.is_register_member(auth.uid(), register_id));

-- Requests are raised through request_register_access() and decided through
-- decide_register_access(); no direct insert or update policy exists, so a
-- client cannot write itself an approved row or approve its own request.

-- Withdrawing a request you have not had answered yet.
drop policy if exists "withdraw own pending request" on public.register_access_requests;
create policy "withdraw own pending request"
  on public.register_access_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- --------------------------------------------------------- register_invites --
-- Members see the invites outstanding on their own register. Creating and
-- accepting invites happens in the edge function under the service role
-- (Stage 5), so there is no client-facing write policy: token_hash must never be
-- selectable or forgeable from a browser.
drop policy if exists "members read invites for their registers" on public.register_invites;
create policy "members read invites for their registers"
  on public.register_invites for select to authenticated
  using (public.is_register_member(auth.uid(), register_id));

-- ---------------------------------------------------------- register_stores --
-- The actual register data. This one policy is the whole tenancy boundary.
drop policy if exists "members read their register data" on public.register_stores;
create policy "members read their register data"
  on public.register_stores for select to authenticated
  using (public.is_register_member(auth.uid(), register_id));

-- No insert or update policy: writes go through save_register(), so every write
-- passes the version guard. A client cannot bypass it by upserting the row
-- directly, which is what the standalone register does today.

-- ============================================================================
-- TABLE GRANTS
--
-- PostgREST checks table grants before RLS. The baseline's blanket
-- "grant ... on all tables in schema public" ran before these tables existed, so
-- it does not reach them and they need granting by name.
--
-- anon gets nothing at all here: every anonymous path into a register (check-in,
-- feedback) goes through a session link and its own narrow RPC, never through
-- these tables.
-- ============================================================================
grant select                 on public.registers                to authenticated;
grant update, delete         on public.registers                to authenticated;
grant select, insert, update on public.register_members         to authenticated;
grant select, delete         on public.register_access_requests to authenticated;
grant select                 on public.register_invites         to authenticated;
grant select                 on public.register_stores          to authenticated;

commit;

-- ============================================================================
-- AFTER RUNNING THIS
--
-- Nothing is reachable yet, by design: no register exists, and no account holds
-- a membership. Stage 2 of docs/REGISTER-INTEGRATION-PLAN.md creates the first
-- register from the legacy public.register_store blob and names its owner.
-- ============================================================================
