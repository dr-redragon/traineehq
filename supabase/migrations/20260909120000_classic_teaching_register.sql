-- ============================================================================
-- A SECOND teaching register, standing beside the first
--
-- This is a deliberate duplicate. TraineeHQ already carries a teaching register
-- (public.registers and friends, reached at /registers). This migration builds a
-- second, wholly independent one under a `classic_` prefix, reached at
-- /classic-registers, whose front end reproduces the standalone ENT register at
-- register.traineehq.com screen for screen.
--
-- WHY A DUPLICATE. The two are meant to be run side by side and compared, and
-- then one of them is meant to be deleted. That only works if neither can break
-- the other, so nothing is shared: separate tables, separate enum, separate
-- RPCs, separate storage bucket, separate audit trigger. Dropping either system
-- is `drop` on its own objects and touches nothing belonging to the other.
--
-- HOW IT WAS BUILT. The body below is a mechanical mirror of the migrations that
-- built the first register, in their original order, with every schema-global
-- identifier renamed. Column names (register_id), RPC parameter names
-- (_register_id) and policy names are scoped to their own table and were
-- deliberately left alone, so the two schemas diff cleanly line for line and it
-- stays obvious that they are the same design. Each section says which migration
-- it mirrors.
--
-- RE-RUNNABILITY. The replay defines classic_register_directory() three times,
-- the last of which returns two more columns than the first. `create or replace`
-- cannot widen a return type, so the first definition is preceded by a drop and
-- this file can be applied twice. The grants following each definition restore
-- what the drop removes. Verified by scripts/verify-classic-register-schema.sh,
-- which applies the file, applies it again, and then runs the first register's
-- own assertion suite against the copy.
--
-- WHAT IS PRESERVED, because these are the point of the exercise:
--   * access is a TraineeHQ sign-in — there is no separate account system;
--   * one register per (deanery, specialty), same as the first;
--   * the same invite and access-request flow, with owner and editor roles;
--   * a per-register certificate logo, uploaded by owners, optional by design.
--
-- WHAT IS NOT MIRRORED. The seed migration (20260907100000) is omitted: it
-- imports the legacy ENT blob and promotes one named account. This register
-- starts empty, and can_create_classic_register() lets any TraineeHQ admin
-- create the first one from the UI.
-- ============================================================================

begin;
-- ###########################################################################
-- MIRRORS 20260907090000_register_multi_tenancy.sql
-- Tenancy, membership, blob store
-- ###########################################################################
-- ============================================================================
-- Multi-register tenancy: many teaching classic_registers, one per specialty per deanery
--
-- Stage 1 of docs/REGISTER-INTEGRATION-PLAN.md.
--
-- The teaching register at register.traineehq.com is a single-tenant app: its
-- entire dataset is one JSONB blob in one row keyed 'default'. This migration
-- brings that model into TraineeHQ as many classic_registers, each with its own blob and
-- its own membership list.
--
-- The organising idea is that `specialties` is ALREADY deanery-scoped
-- (unique (deanery_id, slug)), so "a register per specialty per deanery" needs no
-- new tenancy dimension — it is one register per `specialties` row, enforced by
-- unique (specialty_id) on `classic_registers`.
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
--   themselves, which is recorded in classic_register_members.granted_by.
--
--   Roles are 'owner' and 'editor' only. Trainees never hold a membership row:
--   they reach check-in and feedback anonymously through a session link, exactly
--   as they do today.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.classic_register_role as enum ('owner', 'editor');
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
create table if not exists public.classic_registers (
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
create table if not exists public.classic_register_members (
  register_id uuid not null references public.classic_registers(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.classic_register_role not null default 'editor',
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (register_id, user_id)
);

create table if not exists public.classic_register_access_requests (
  id            uuid primary key default gen_random_uuid(),
  register_id   uuid not null references public.classic_registers(id) on delete cascade,
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
create unique index if not exists classic_register_access_requests_one_open
  on public.classic_register_access_requests (register_id, user_id)
  where status = 'pending';

-- Invites are separate from requests because the invitee may have no account
-- yet. Only the hash of the token is stored; the raw token exists solely in the
-- email. The RPCs that create and accept invites arrive in Stage 5, alongside
-- the edge function that sends them — the table is defined here so the tenancy
-- schema is complete in one migration.
create table if not exists public.classic_register_invites (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.classic_registers(id) on delete cascade,
  email       text not null,
  role        public.classic_register_role not null default 'editor',
  invited_by  uuid references auth.users(id) on delete set null,
  token_hash  text not null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists classic_register_invites_one_open
  on public.classic_register_invites (register_id, lower(email))
  where accepted_at is null;

-- The register itself: the same JSONB blob the standalone app already uses
-- (trainees, sessions, attendance, excused, status), now one row per register.
--
-- `version` exists because the blob is written whole. The standalone register is
-- run by one person, so last-write-wins was harmless; with a team of editors per
-- register, two people saving in the same minute would silently discard one set
-- of edits. save_classic_register() below refuses a write whose expected version has
-- moved on, and the client re-reads and retries.
create table if not exists public.classic_register_stores (
  register_id uuid primary key references public.classic_registers(id) on delete cascade,
  data        jsonb  not null default '{}'::jsonb,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- Indexes on the columns these tables are actually filtered by
-- ----------------------------------------------------------------------------
-- "which classic_registers am I in?" — the query behind every page load of /classic_registers.
create index if not exists classic_register_members_user_idx
  on public.classic_register_members (user_id);

create index if not exists classic_register_access_requests_register_status_idx
  on public.classic_register_access_requests (register_id, status);

create index if not exists classic_register_access_requests_user_idx
  on public.classic_register_access_requests (user_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers, using the baseline's shared trigger function
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.classic_registers;
create trigger set_updated_at before update on public.classic_registers
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_updated_at on public.classic_register_access_requests;
create trigger set_updated_at before update on public.classic_register_access_requests
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- ACCESS HELPERS
--
-- security definer so RLS policies can call them without the caller needing to
-- read classic_register_members directly (which would recurse through that table's own
-- policy).
-- ============================================================================

-- Deliberately does NOT consult public.user_roles. Membership is an explicit
-- grant: that is what lets a trainee be an editor and a TraineeHQ admin be a
-- stranger to every register.
create or replace function public.is_classic_register_member(_user_id uuid, _register_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classic_register_members
    where user_id = _user_id and register_id = _register_id
  );
$$;

create or replace function public.is_classic_register_owner(_user_id uuid, _register_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classic_register_members
    where user_id = _user_id and register_id = _register_id and role = 'owner'
  );
$$;

-- The capability to create a NEW register. Note what this is not: it grants no
-- access to any register that already exists. Held by TraineeHQ admins and by
-- anyone who already holds a register, so an established organiser can start a
-- second one without going to an admin.
create or replace function public.can_create_classic_register(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin(_user_id)
    or exists (select 1 from public.classic_register_members where user_id = _user_id);
$$;

-- ============================================================================
-- THE DIRECTORY
--
-- A security-definer function rather than a view, following the pattern of
-- get_profile_display_names() in the baseline.
--
-- It cannot be a view: the join to `specialties` would be filtered by that
-- table's own RLS (can_access_specialty), which for a trainee is "specialties I
-- am enrolled on" — hiding exactly the classic_registers they need to see in order to
-- request access to them. The columns returned are names and counts only; the
-- register's data is in classic_register_stores and stays behind is_classic_register_member.
-- ============================================================================
-- Re-runnability: see the note in the migration header.
drop function if exists public.classic_register_directory();

create or replace function public.classic_register_directory()
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
    (select count(*) from public.classic_register_members m where m.register_id = r.id),
    public.is_classic_register_member(auth.uid(), r.id),
    (select ar.status
       from public.classic_register_access_requests ar
      where ar.register_id = r.id
        and ar.user_id = auth.uid()
      order by ar.created_at desc
      limit 1)
  from public.classic_registers r
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
-- Requires both the capability (can_create_classic_register) and visibility of the
-- target specialty (can_access_specialty) — the latter is what stops an admin of
-- one deanery opening a register in another, and confines a trainee-editor to
-- the specialties they are enrolled on.
create or replace function public.create_classic_register(_specialty_id uuid, _name text default null)
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

  if not public.can_create_classic_register(_caller) then
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
    insert into public.classic_registers (specialty_id, name, slug, created_by)
    values (_specialty_id, coalesce(nullif(btrim(_name), ''), _label), _slug, _caller)
    returning id into _id;
  exception when unique_violation then
    -- The one-per-specialty rule surfacing as guidance rather than an error
    -- code: this is the "it already exists, ask to join it" path.
    raise exception 'A register already exists for that specialty'
      using hint = 'Find it in the register directory and request access instead.';
  end;

  insert into public.classic_register_stores (register_id, updated_by) values (_id, _caller);

  insert into public.classic_register_members (register_id, user_id, role, granted_by)
  values (_id, _caller, 'owner', _caller);

  return _id;
end;
$$;

-- Ask to join an existing register.
create or replace function public.request_classic_register_access(_register_id uuid, _reason text default null)
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

  if not exists (select 1 from public.classic_registers where id = _register_id and is_active) then
    raise exception 'That register does not exist';
  end if;

  if public.is_classic_register_member(_caller, _register_id) then
    raise exception 'You already have access to that register';
  end if;

  begin
    insert into public.classic_register_access_requests (register_id, user_id, reason)
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
-- restricting it is a one-line change to is_classic_register_member below.
create or replace function public.decide_classic_register_access(
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
  _req    public.classic_register_access_requests;
begin
  if _caller is null then
    raise exception 'You must be signed in to decide a request';
  end if;

  select * into _req from public.classic_register_access_requests where id = _request_id;

  if _req.id is null then
    raise exception 'That request no longer exists';
  end if;

  if _req.status <> 'pending' then
    raise exception 'That request has already been decided';
  end if;

  if not public.is_classic_register_member(_caller, _req.register_id) then
    raise exception 'Only members of that register can decide who joins it';
  end if;

  -- Without this, anyone who could see their own pending row could approve it.
  if _req.user_id = _caller then
    raise exception 'You cannot approve your own request for access';
  end if;

  if _approve then
    insert into public.classic_register_members (register_id, user_id, role, granted_by)
    values (_req.register_id, _req.user_id, 'editor', _caller)
    on conflict (register_id, user_id) do nothing;
  end if;

  update public.classic_register_access_requests
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
create or replace function public.remove_classic_register_member(_register_id uuid, _user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller       uuid := auth.uid();
  _target_role  public.classic_register_role;
  _owner_count  integer;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  select role into _target_role
    from public.classic_register_members
   where register_id = _register_id and user_id = _user_id;

  if _target_role is null then
    raise exception 'That person is not a member of this register';
  end if;

  -- An owner may remove anyone; anyone may remove themselves.
  if not (public.is_classic_register_owner(_caller, _register_id) or _caller = _user_id) then
    raise exception 'Only an owner can remove another member';
  end if;

  if _target_role = 'owner' then
    select count(*) into _owner_count
      from public.classic_register_members
     where register_id = _register_id and role = 'owner';

    if _owner_count <= 1 then
      raise exception 'This is the register''s only owner'
        using hint = 'Make somebody else an owner first, then remove this one.';
    end if;
  end if;

  delete from public.classic_register_members
   where register_id = _register_id and user_id = _user_id;
end;
$$;

-- Write the register blob, refusing a write built on a stale read.
--
-- Returns the new version. A caller that gets the conflict error should re-read
-- classic_register_stores, replay its edit onto the newer blob and call again.
create or replace function public.save_classic_register(
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
  if _caller is null or not public.is_classic_register_member(_caller, _register_id) then
    raise exception 'You do not have access to that register';
  end if;

  update public.classic_register_stores
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
    if not exists (select 1 from public.classic_register_stores where register_id = _register_id) then
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
-- NAME. Left in place, classic_register_directory() would hand the full list of
-- classic_registers to any anonymous caller of /rest/v1/rpc, and the predicates would
-- let one probe who belongs to what.
-- ============================================================================
revoke execute on function public.is_classic_register_member(uuid, uuid)          from public, anon;
revoke execute on function public.is_classic_register_owner(uuid, uuid)           from public, anon;
revoke execute on function public.can_create_classic_register(uuid)               from public, anon;
revoke execute on function public.classic_register_directory()                    from public, anon;
revoke execute on function public.create_classic_register(uuid, text)             from public, anon;
revoke execute on function public.request_classic_register_access(uuid, text)     from public, anon;
revoke execute on function public.decide_classic_register_access(uuid, boolean, text) from public, anon;
revoke execute on function public.remove_classic_register_member(uuid, uuid)      from public, anon;
revoke execute on function public.save_classic_register(uuid, jsonb, bigint)      from public, anon;

-- RLS predicates are evaluated as the querying role, so signed-in users must
-- keep EXECUTE on the helpers their policies reference.
grant execute on function public.is_classic_register_member(uuid, uuid)           to authenticated;
grant execute on function public.is_classic_register_owner(uuid, uuid)            to authenticated;
grant execute on function public.can_create_classic_register(uuid)                to authenticated;
grant execute on function public.classic_register_directory()                     to authenticated;
grant execute on function public.create_classic_register(uuid, text)              to authenticated;
grant execute on function public.request_classic_register_access(uuid, text)      to authenticated;
grant execute on function public.decide_classic_register_access(uuid, boolean, text) to authenticated;
grant execute on function public.remove_classic_register_member(uuid, uuid)       to authenticated;
grant execute on function public.save_classic_register(uuid, jsonb, bigint)       to authenticated;

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
    'classic_registers','classic_register_members','classic_register_access_requests',
    'classic_register_invites','classic_register_stores'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- classic_registers --
-- The directory is meant to be browsable: you cannot request access to a
-- register you cannot see exists. Name, slug and active flag only — the data is
-- in classic_register_stores, behind membership.
drop policy if exists "classic_registers readable by signed-in users" on public.classic_registers;
create policy "classic_registers readable by signed-in users"
  on public.classic_registers for select to authenticated using (true);

-- Creation goes through create_classic_register(), which also makes the creator an
-- owner; a bare insert would produce an ownerless register nobody can manage.
drop policy if exists "owners update their register" on public.classic_registers;
create policy "owners update their register"
  on public.classic_registers for update to authenticated
  using (public.is_classic_register_owner(auth.uid(), id))
  with check (public.is_classic_register_owner(auth.uid(), id));

drop policy if exists "owners delete their register" on public.classic_registers;
create policy "owners delete their register"
  on public.classic_registers for delete to authenticated
  using (public.is_classic_register_owner(auth.uid(), id));

-- --------------------------------------------------------- classic_register_members --
-- You can see the membership of classic_registers you belong to, and your own rows
-- everywhere else (so the app can tell you which classic_registers you are in without
-- reading anyone else's grants).
drop policy if exists "members read membership of their classic_registers" on public.classic_register_members;
create policy "members read membership of their classic_registers"
  on public.classic_register_members for select to authenticated
  using (user_id = auth.uid() or public.is_classic_register_member(auth.uid(), register_id));

-- Owners may add members directly (an admin adding a colleague without waiting
-- for a request). Everyone else arrives through decide_classic_register_access().
drop policy if exists "owners add members" on public.classic_register_members;
create policy "owners add members"
  on public.classic_register_members for insert to authenticated
  with check (public.is_classic_register_owner(auth.uid(), register_id));

-- Promoting and demoting owners. Removal is deliberately absent: it goes
-- through remove_classic_register_member(), which refuses to strip the last owner.
drop policy if exists "owners change member roles" on public.classic_register_members;
create policy "owners change member roles"
  on public.classic_register_members for update to authenticated
  using (public.is_classic_register_owner(auth.uid(), register_id))
  with check (public.is_classic_register_owner(auth.uid(), register_id));

-- ------------------------------------------------- classic_register_access_requests --
-- A member sees the queue for their register; everyone sees their own requests.
drop policy if exists "read own and reviewable requests" on public.classic_register_access_requests;
create policy "read own and reviewable requests"
  on public.classic_register_access_requests for select to authenticated
  using (user_id = auth.uid() or public.is_classic_register_member(auth.uid(), register_id));

-- Requests are raised through request_classic_register_access() and decided through
-- decide_classic_register_access(); no direct insert or update policy exists, so a
-- client cannot write itself an approved row or approve its own request.

-- Withdrawing a request you have not had answered yet.
drop policy if exists "withdraw own pending request" on public.classic_register_access_requests;
create policy "withdraw own pending request"
  on public.classic_register_access_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- --------------------------------------------------------- classic_register_invites --
-- Members see the invites outstanding on their own register. Creating and
-- accepting invites happens in the edge function under the service role
-- (Stage 5), so there is no client-facing write policy: token_hash must never be
-- selectable or forgeable from a browser.
drop policy if exists "members read invites for their classic_registers" on public.classic_register_invites;
create policy "members read invites for their classic_registers"
  on public.classic_register_invites for select to authenticated
  using (public.is_classic_register_member(auth.uid(), register_id));

-- ---------------------------------------------------------- classic_register_stores --
-- The actual register data. This one policy is the whole tenancy boundary.
drop policy if exists "members read their register data" on public.classic_register_stores;
create policy "members read their register data"
  on public.classic_register_stores for select to authenticated
  using (public.is_classic_register_member(auth.uid(), register_id));

-- No insert or update policy: writes go through save_classic_register(), so every write
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
grant select                 on public.classic_registers                to authenticated;
grant update, delete         on public.classic_registers                to authenticated;
grant select, insert, update on public.classic_register_members         to authenticated;
grant select, delete         on public.classic_register_access_requests to authenticated;
grant select                 on public.classic_register_invites         to authenticated;
grant select                 on public.classic_register_stores          to authenticated;


-- ============================================================================
-- AFTER RUNNING THIS
--
-- Nothing is reachable yet, by design: no register exists, and no account holds
-- a membership. Stage 2 of docs/REGISTER-INTEGRATION-PLAN.md creates the first
-- register from the legacy public.register_store blob and names its owner.
-- ============================================================================


-- ###########################################################################
-- MIRRORS 20260907110000_register_access_admin.sql
-- Access administration
-- ###########################################################################
-- ============================================================================
-- Stage 5: administering access to a register
--
-- Three changes, one of them a reversal.
--
-- 1. THE INVITES TABLE IS DROPPED. 20260907090000 created classic_register_invites with
--    a hashed token, for a click-to-accept flow. Building the rest of the stage
--    made it clear that was ceremony without a purpose: this project already
--    invites people to TraineeHQ by creating their account and assigning the
--    role outright (supabase/functions/invite-user), and being added to a
--    register you help run is not a thing anyone needs to consent to twice.
--
--    The direct add gives the same audit trail — classic_register_members.granted_by
--    records who added whom — and anyone added can leave on their own, since
--    remove_classic_register_member() lets a member remove themselves. Dropping the
--    table also removes the token_hash surface entirely rather than leaving an
--    unused credential store in the schema. The table has never held a row: it
--    was created in the same unreleased branch.
--
-- 2. Member roles change through an RPC, not a policy. The RLS policy added in
--    20260907090000 would let the only owner demote themselves to editor,
--    leaving a register nobody can administer — the same trap
--    remove_classic_register_member() already refuses, arrived at by a different route.
--
-- 3. Admitting someone becomes one rule. 20260907090000 let any member approve a
--    join request but only an owner add someone directly — two answers to the
--    same question, which is how a codebase ends up with a rule nobody can state.
--    Both are now "any member". Promoting, demoting and removing stay with
--    owners.
--
-- 4. A narrow directory of the people connected to one register, so the access
--    screen can show names and addresses instead of raw user ids.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The invites table
-- ----------------------------------------------------------------------------
drop table if exists public.classic_register_invites;

-- ----------------------------------------------------------------------------
-- 2. Role changes
-- ----------------------------------------------------------------------------

-- Direct updates are withdrawn: the last-owner rule cannot be expressed as a
-- row predicate, because it depends on how many other rows exist.
drop policy if exists "owners change member roles" on public.classic_register_members;
revoke update on public.classic_register_members from authenticated;

create or replace function public.set_classic_register_member_role(
  _register_id uuid,
  _user_id     uuid,
  _role        public.classic_register_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller      uuid := auth.uid();
  _current     public.classic_register_role;
  _owner_count integer;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  if not public.is_classic_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can change what someone can do in this register';
  end if;

  select role into _current
    from public.classic_register_members
   where register_id = _register_id and user_id = _user_id;

  if _current is null then
    raise exception 'That person is not a member of this register';
  end if;

  if _current = _role then
    return;
  end if;

  -- The mirror of the rule in remove_classic_register_member(): a register with no owner
  -- can never have its membership managed again, and no super_admin can quietly
  -- step in to fix it.
  if _current = 'owner' and _role <> 'owner' then
    select count(*) into _owner_count
      from public.classic_register_members
     where register_id = _register_id and role = 'owner';

    if _owner_count <= 1 then
      raise exception 'This is the register''s only owner'
        using hint = 'Make somebody else an owner first.';
    end if;
  end if;

  update public.classic_register_members
     set role = _role
   where register_id = _register_id and user_id = _user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Admitting someone
-- ----------------------------------------------------------------------------

-- Any member may admit another person, matching decide_classic_register_access(), which
-- any member may already call. Inviting somebody and approving their request are
-- the same act arrived at from opposite ends; they should not have had different
-- answers.
--
-- The role is constrained here rather than left open: admitting someone straight
-- to owner would be a way around set_classic_register_member_role()'s owner-only rule.
drop policy if exists "owners add members" on public.classic_register_members;
drop policy if exists "members admit others" on public.classic_register_members;
create policy "members admit others"
  on public.classic_register_members for insert to authenticated
  with check (
    public.is_classic_register_member(auth.uid(), register_id)
    and (role = 'editor' or public.is_classic_register_owner(auth.uid(), register_id))
  );

-- ----------------------------------------------------------------------------
-- 4. Who is connected to this register
-- ----------------------------------------------------------------------------

-- Names and addresses for the people a register's access screen has to show:
-- its members, and anyone who has asked to join it.
--
-- A security-definer function rather than a policy on `profiles`, because the
-- reader may be an owner with no TraineeHQ admin role, and profiles is readable
-- only by its owner and by admins. This widens nothing else: it answers only for
-- one register, only to a member of that register, and only about people already
-- connected to it.
create or replace function public.classic_register_people(_register_id uuid)
returns table (
  user_id    uuid,
  first_name text,
  last_name  text,
  email      text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.first_name, p.last_name, p.email
    from public.profiles p
   where public.is_classic_register_member(auth.uid(), _register_id)
     and (
       exists (
         select 1 from public.classic_register_members m
          where m.register_id = _register_id and m.user_id = p.user_id
       )
       or exists (
         select 1 from public.classic_register_access_requests r
          where r.register_id = _register_id and r.user_id = p.user_id
       )
     );
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.set_classic_register_member_role(uuid, uuid, public.classic_register_role)
  from public, anon;
revoke execute on function public.classic_register_people(uuid) from public, anon;

grant execute on function public.set_classic_register_member_role(uuid, uuid, public.classic_register_role)
  to authenticated;
grant execute on function public.classic_register_people(uuid) to authenticated;


-- ###########################################################################
-- MIRRORS 20260907120000_register_live_sessions.sql
-- Live sessions, check-in, feedback
-- ###########################################################################
-- ============================================================================
-- Stage 7: the live teaching day — check-in, feedback and certificates,
-- register-scoped.
--
-- The standalone register keeps four tables for the day itself: `sessions`,
-- `attendees`, `feedback_responses` and `form_templates`. None of them exist in
-- this project, so rather than adding `register_id` and backfilling, they are
-- created here scoped from the outset — `not null` from the first row.
--
-- THE SECURITY PROBLEM THIS SOLVES
--
-- In the standalone register `public_roster()` takes no arguments: there is one
-- register, so it returns it. Multi-tenant, an unscoped roster hands every
-- deanery's trainee list to anybody who scans any QR code.
--
-- Every anonymous door here is therefore keyed on the SESSION, and the register
-- is derived from it server-side. A visitor holds a session link and nothing
-- else; they cannot name a register, and passing somebody else's session id
-- gets them that session's register, which is exactly what a link is for.
--
-- `record_live_checkin` goes further than the original, which trusted the
-- browser for the blob's session key and so let any caller write attendance
-- against any teaching day. That key is now read from the session row.
--
-- Anonymous callers also lose the ability to LIST sessions. The original grants
-- anon `select` on `sessions` with `using (true)`, which was survivable with one
-- register and is not with many — it would expose every deanery's teaching
-- schedule. There is no anon grant on the table at all; one function returns one
-- session by id, so a link opens a door rather than a filing cabinet.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Superseded tables
--
-- teaching_sessions and attendance_records came from an abandoned sketch of this
-- feature in the baseline schema. Both are empty, nothing reads them, and
-- leaving two tables that look like they do this job is a trap for whoever comes
-- next. Flagged as dead weight in docs/REGISTER-INTEGRATION-PLAN.md; resolved.
-- ----------------------------------------------------------------------------
drop table if exists public.attendance_records;
drop table if exists public.teaching_sessions;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- A teaching day that has been published for check-in. `local_id` is the id of
-- the matching session inside the register blob, which is what ties a QR code
-- back to the attendance grid.
create table if not exists public.classic_register_sessions (
  id           uuid primary key default gen_random_uuid(),
  register_id  uuid not null references public.classic_registers(id) on delete cascade,
  title        text not null,
  session_date date not null,
  location     text,
  local_id     text,
  -- The feedback form for this day. Null falls back to the register's template.
  form         jsonb,
  created_at   timestamptz not null default now(),
  unique (register_id, local_id)
);

create index if not exists classic_register_sessions_register_idx
  on public.classic_register_sessions (register_id, session_date desc);

create table if not exists public.classic_register_attendees (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.classic_register_sessions(id) on delete cascade,
  name                text not null,
  email               text not null,
  grade               text,
  checked_in_at       timestamptz,
  feedback_completed  boolean not null default false,
  certificate_sent_at timestamptz,
  created_at          timestamptz not null default now(),
  unique (session_id, email)
);

create index if not exists classic_register_attendees_session_idx
  on public.classic_register_attendees (session_id);

-- ANONYMITY RULE, carried over unchanged: this table holds no identifier and no
-- foreign key to an attendee beyond the session they both belong to. The only
-- bridge is classic_register_attendees.feedback_completed, a boolean flipped by the same
-- transaction that inserts the response. Do not add a person to this table.
create table if not exists public.classic_register_feedback (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.classic_register_sessions(id) on delete cascade,
  overall_rating integer check (overall_rating between 1 and 5),
  answers        jsonb not null default '{}'::jsonb,
  comments       text,
  submitted_at   timestamptz not null default now()
);

create index if not exists classic_register_feedback_session_idx
  on public.classic_register_feedback (session_id);

-- One shared feedback template per register, inherited by new teaching days.
-- Single-tenant this was `form_templates` keyed on the text 'default'.
create table if not exists public.classic_register_forms (
  register_id uuid primary key references public.classic_registers(id) on delete cascade,
  form        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- THE ANONYMOUS DOORS
--
-- Three functions, each taking a session id and nothing else. A trainee has a
-- link; that link is the whole of their authority, and it reaches exactly one
-- register's teaching day.
-- ============================================================================

-- One session, by id. Replaces the anon `select` grant the original gave on the
-- table: the columns are the same ones checkin/feedback/session pages read, but
-- a caller can no longer list what they were not sent.
create or replace function public.classic_register_public_session(_session_id uuid)
returns table (
  id           uuid,
  title        text,
  session_date date,
  location     text,
  local_id     text,
  form         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.session_date, s.location, s.local_id,
         coalesce(s.form, f.form)
    from public.classic_register_sessions s
    left join public.classic_register_forms f on f.register_id = s.register_id
   where s.id = _session_id;
$$;

-- The name list behind the sign-in dropdown, for the register this session
-- belongs to. Names and a has-email flag only: never an address, and never
-- attendance, excusals or long-term status.
--
-- The register is derived from the session. There is deliberately no variant
-- that takes a register id — that is the whole difference between this and the
-- single-tenant original.
create or replace function public.classic_register_public_roster(_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trainees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        t->>'id',
               'name',      t->>'name',
               'has_email', nullif(btrim(coalesce(t->>'email', '')), '') is not null
             ) order by t->>'name')
        from jsonb_array_elements(st.data->'trainees') t
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sn->>'id', 'month', sn->>'month', 'title', sn->>'title'))
        from jsonb_array_elements(st.data->'sessions') sn
    ), '[]'::jsonb)
  )
  from public.classic_register_sessions s
  join public.classic_register_stores  st on st.register_id = s.register_id
 where s.id = _session_id;
$$;

-- Mirror a check-in into the register's own attendance map.
--
-- Both the register and the blob's session key are read from the session row.
-- The original took that key from the browser, so a caller could write a mark
-- against any teaching day in the register; here they can only write against the
-- one their link names.
create or replace function public.classic_register_record_checkin(
  _session_id uuid,
  _trainee_id text,
  _grade      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _register uuid;
  _local    text;
  _key      text;
begin
  if _trainee_id is null or btrim(_trainee_id) = '' then
    return;
  end if;

  select s.register_id, s.local_id into _register, _local
    from public.classic_register_sessions s
   where s.id = _session_id;

  -- An unpublished teaching day has no blob key to write against.
  if _register is null or _local is null then
    return;
  end if;

  -- Only somebody already on that register's roster. Without this the function
  -- would happily invent an attendance key for any string a caller passed.
  if not exists (
    select 1
      from public.classic_register_stores st,
           lateral jsonb_array_elements(st.data->'trainees') t
     where st.register_id = _register
       and t->>'id' = _trainee_id
  ) then
    return;
  end if;

  _key := _trainee_id || '|' || _local;

  update public.classic_register_stores
     set data = jsonb_set(
                  jsonb_set(coalesce(data, '{}'::jsonb), '{attendance}',
                            coalesce(data->'attendance', '{}'::jsonb)),
                  array['attendance', _key],
                  jsonb_build_object('grade', coalesce(_grade, '')),
                  true),
         -- Not version + 1: this is a trainee signing in, not an organiser's
         -- edit, and bumping the version would make every open organiser tab
         -- think somebody had saved over them.
         updated_at = now()
   where register_id = _register;
end;
$$;

-- Read or store a trainee's contact address, for the certificate.
--
-- Service role only — the Edge Function calls it and puts the address on the
-- attendee row. It is never granted to anon or authenticated, so no browser can
-- read an address through it.
create or replace function public.classic_register_resolve_trainee_email(
  _session_id uuid,
  _trainee_id text,
  _email      text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _register  uuid;
  _existing  text;
  _index     integer;
  _new_email text := nullif(btrim(coalesce(_email, '')), '');
begin
  select s.register_id into _register
    from public.classic_register_sessions s where s.id = _session_id;

  if _register is null or _trainee_id is null then
    return _new_email;
  end if;

  select i, t->>'email' into _index, _existing
    from public.classic_register_stores st,
         lateral jsonb_array_elements(st.data->'trainees') with ordinality as arr(t, i)
   where st.register_id = _register
     and t->>'id' = _trainee_id
   limit 1;

  if _new_email is not null then
    if _index is not null then
      update public.classic_register_stores
         set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                              to_jsonb(_new_email), true),
             updated_at = now()
       where register_id = _register;
    end if;
    return _new_email;
  end if;

  return _existing;
end;
$$;

-- ============================================================================
-- FUNCTION GRANTS
-- ============================================================================
revoke execute on function public.classic_register_public_session(uuid)                  from public, anon;
revoke execute on function public.classic_register_public_roster(uuid)                   from public, anon;
revoke execute on function public.classic_register_record_checkin(uuid, text, text)      from public, anon;
revoke execute on function public.classic_register_resolve_trainee_email(uuid, text, text)
  from public, anon, authenticated;

-- The three doors a trainee with a link needs, and nothing else.
grant execute on function public.classic_register_public_session(uuid)             to anon, authenticated;
grant execute on function public.classic_register_public_roster(uuid)              to anon, authenticated;
grant execute on function public.classic_register_record_checkin(uuid, text, text) to anon, authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'classic_register_sessions','classic_register_attendees','classic_register_feedback','classic_register_forms'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Members see their own register's teaching days, attendees and feedback.
-- Everything anonymous goes through the functions above, so there is no anon
-- policy on any of these tables.
drop policy if exists "members read their sessions" on public.classic_register_sessions;
create policy "members read their sessions"
  on public.classic_register_sessions for select to authenticated
  using (public.is_classic_register_member(auth.uid(), register_id));

drop policy if exists "members read their attendees" on public.classic_register_attendees;
create policy "members read their attendees"
  on public.classic_register_attendees for select to authenticated
  using (exists (
    select 1 from public.classic_register_sessions s
     where s.id = session_id and public.is_classic_register_member(auth.uid(), s.register_id)
  ));

-- Feedback is readable in aggregate by the register's members; it carries no
-- identifier, so a member reading it learns what was said and not by whom.
drop policy if exists "members read their feedback" on public.classic_register_feedback;
create policy "members read their feedback"
  on public.classic_register_feedback for select to authenticated
  using (exists (
    select 1 from public.classic_register_sessions s
     where s.id = session_id and public.is_classic_register_member(auth.uid(), s.register_id)
  ));

drop policy if exists "members read their form template" on public.classic_register_forms;
create policy "members read their form template"
  on public.classic_register_forms for select to authenticated
  using (public.is_classic_register_member(auth.uid(), register_id));

-- No insert, update or delete policy anywhere in this file, for either role.
-- Publishing a day, recording an attendee, submitting feedback and editing a
-- form all run through the Edge Function under the service role, which checks
-- membership itself — the same shape as the standalone register's register-api.

-- ============================================================================
-- TABLE GRANTS
--
-- Read-only for signed-in members; anon gets nothing at all. The baseline's
-- blanket grant ran long before these tables existed.
-- ============================================================================
grant select on public.classic_register_sessions  to authenticated;
grant select on public.classic_register_attendees to authenticated;
grant select on public.classic_register_feedback  to authenticated;
grant select on public.classic_register_forms     to authenticated;


-- ###########################################################################
-- MIRRORS 20260907130000_register_grants_lockdown.sql
-- Grants lockdown
-- ###########################################################################
-- ============================================================================
-- Close the grants Supabase hands out by default
--
-- A Supabase project ships with
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- so every table created afterwards is granted to both browser roles unless a
-- migration says otherwise. The three register migrations each granted the
-- privileges they wanted and said "anon gets nothing at all here" — but granting
-- SELECT to `authenticated` does not take away the ALL that the default already
-- handed to both roles. On the live project anon and authenticated held
-- select/insert/update/delete on all eight register tables.
--
-- NOTHING WAS EXPOSED. Row-level security is enabled and forced on every one of
-- them, and none has a policy for anon or for the write paths, so a browser got
-- zero rows and changed zero rows. But the whole design rests on two layers —
-- PostgREST checks grants before RLS — and only one was doing any work. In
-- particular `save_classic_register()`'s version guard was documented as impossible to
-- sidestep, and it was, only because RLS refused the direct UPDATE rather than
-- because the grant was absent.
--
-- The one privilege that WAS correctly absent is classic_register_members.UPDATE, which
-- 20260907110000 revoked by name. That is the shape of the mistake: only what
-- was explicitly revoked was actually closed.
--
-- This revokes everything from both roles on all eight tables and re-grants
-- exactly what each needs, declaratively, so the grant table can be read as the
-- intent rather than as the residue of a default.
--
-- The test stubs now reproduce Supabase's default privileges too. Without that
-- the assertions passed against a database nothing had granted anything on,
-- proving the fixture rather than the migration.
-- ============================================================================


revoke all on public.classic_registers                from anon, authenticated;
revoke all on public.classic_register_members         from anon, authenticated;
revoke all on public.classic_register_access_requests from anon, authenticated;
revoke all on public.classic_register_stores          from anon, authenticated;
revoke all on public.classic_register_sessions        from anon, authenticated;
revoke all on public.classic_register_attendees       from anon, authenticated;
revoke all on public.classic_register_feedback        from anon, authenticated;
revoke all on public.classic_register_forms           from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Exactly what each role needs, and nothing beyond it.
--
-- anon appears nowhere: every anonymous path into a register goes through a
-- security-definer function keyed on a session id.
-- ----------------------------------------------------------------------------

-- The directory is browsable by anyone signed in — you cannot ask to join a
-- register you cannot see exists. Owners update and delete their own, gated by
-- policy.
grant select, update, delete on public.classic_registers to authenticated;

-- Members read the membership of their classic_registers and admit others; promoting,
-- demoting and removing go through RPCs, so no update or delete.
grant select, insert on public.classic_register_members to authenticated;

-- Requests are raised and decided by RPC; a person may withdraw their own.
grant select, delete on public.classic_register_access_requests to authenticated;

-- The register itself is read directly and written only by save_classic_register(),
-- which is what makes the version guard unavoidable rather than merely
-- unattractive.
grant select on public.classic_register_stores to authenticated;

-- The live teaching day is read by members and written by the edge function
-- under the service role, which checks membership itself.
grant select on public.classic_register_sessions  to authenticated;
grant select on public.classic_register_attendees to authenticated;
grant select on public.classic_register_feedback  to authenticated;
grant select on public.classic_register_forms     to authenticated;

-- ----------------------------------------------------------------------------
-- And stop the default from re-arming for anything added later.
--
-- The baseline already did this for functions. Tables were left out, which is
-- how eight of them arrived pre-granted. A table added after this line starts
-- private, and its migration has to say what it wants.
-- ----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;


-- ###########################################################################
-- MIRRORS 20260907140000_register_api_functions.sql
-- Anonymous API functions
-- ###########################################################################
-- ============================================================================
-- The two database operations the register-api edge function cannot do safely
-- from outside a transaction.
--
-- Both are service-role only. They are the write half of the anonymous
-- teaching-day flow, and the edge function is what decides a caller is entitled
-- to reach them; granting either to a browser would hand it the ability to
-- append to a register's roster, or to record feedback against somebody else.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Joining the roster at sign-in
--
-- Somebody signing in as "my name is not on the list" used to exist only as an
-- attendee row: the register reported them as unmatched and then forgot them, so
-- they were missing from the grid and had to be re-added by hand before the next
-- teaching day. They now join the roster as they sign in.
--
-- The register comes from the session, never from the caller.
-- ----------------------------------------------------------------------------
create or replace function public.classic_register_enrol_trainee(
  _session_id uuid,
  _name       text,
  _email      text,
  _grade      text
)
returns jsonb                -- {"trainee_id": text|null, "created": boolean}
language plpgsql
security definer
set search_path = public
as $$
declare
  _register   uuid;
  _local      text;
  _name_in    text := btrim(coalesce(_name, ''));
  _email_in   text := nullif(btrim(lower(coalesce(_email, ''))), '');
  _grade_in   text := btrim(coalesce(_grade, ''));
  _trainee_id text;
  _index      integer;
  _has_email  boolean;
  _created    boolean := false;
begin
  if _name_in = '' then
    return jsonb_build_object('trainee_id', null, 'created', false);
  end if;

  select s.register_id, s.local_id into _register, _local
    from public.classic_register_sessions s where s.id = _session_id;

  if _register is null then
    return jsonb_build_object('trainee_id', null, 'created', false);
  end if;

  -- Two people signing in at the same moment both read-modify-write this one
  -- row; without the lock the second append silently overwrites the first.
  perform 1 from public.classic_register_stores where register_id = _register for update;
  if not found then
    return jsonb_build_object('trainee_id', null, 'created', false);
  end if;

  -- A name already on the roster — a misread list, a second sign-in from another
  -- device — attaches to that record rather than creating a duplicate.
  select t->>'id', i, nullif(btrim(coalesce(t->>'email', '')), '') is not null
    into _trainee_id, _index, _has_email
    from public.classic_register_stores,
         lateral jsonb_array_elements(data->'trainees') with ordinality as arr(t, i)
   where register_id = _register
     and lower(btrim(t->>'name')) = lower(_name_in)
   limit 1;

  if _trainee_id is null then
    _created := true;
    -- The same shape of id the browser generates (7 base-36 characters), so
    -- nothing downstream can tell a self-registered trainee from a typed one.
    _trainee_id := substr(md5(random()::text || clock_timestamp()::text), 1, 7);

    update public.classic_register_stores
       set data = jsonb_set(
                    coalesce(data, '{}'::jsonb), '{trainees}',
                    coalesce(data->'trainees', '[]'::jsonb) || jsonb_build_array(
                      jsonb_build_object(
                        'id', _trainee_id,
                        'name', _name_in,
                        'email', coalesce(_email_in, ''),
                        'grade', _grade_in,
                        -- Empty, exactly as a trainee added by hand is. The next
                        -- organiser load dates the grade from the attendance
                        -- written below, so a later sign-in supersedes it on the
                        -- same rule as everybody else's.
                        'gradeFrom', ''
                      )),
                    true),
           updated_at = now()
     where register_id = _register;

  elsif _email_in is not null and not _has_email then
    -- Known already, but with no address on file: take the one they typed.
    update public.classic_register_stores
       set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                            to_jsonb(_email_in), true),
           updated_at = now()
     where register_id = _register;
  end if;

  -- Mark them present. An unpublished day has no blob key; the roster entry
  -- still stands, there is simply no cell for it yet.
  if _local is not null then
    perform public.classic_register_record_checkin(_session_id, _trainee_id, _grade_in);
  end if;

  return jsonb_build_object('trainee_id', _trainee_id, 'created', _created);
end;
$$;

-- ----------------------------------------------------------------------------
-- Recording feedback
--
-- ANONYMITY. The identifier is passed in solely to flip the attendee's
-- feedback_completed gate, which is what a certificate is issued against. It is
-- never written to classic_register_feedback, and the insert and the flip happen in one
-- transaction so a response cannot be recorded without closing the gate, nor the
-- gate closed without a response.
-- ----------------------------------------------------------------------------
create or replace function public.classic_register_record_feedback(
  _session_id uuid,
  _identifier text,
  _overall    integer,
  _answers    jsonb,
  _comments   text
)
returns table (
  status              text,
  attendee_id         uuid,
  attendee_name       text,
  attendee_email      text,
  checked_in          boolean,
  certificate_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  a     public.classic_register_attendees%rowtype;
  ident text := nullif(btrim(coalesce(_identifier, '')), '');
begin
  if not exists (select 1 from public.classic_register_sessions s where s.id = _session_id) then
    return query select 'unknown_session'::text, null::uuid, null::text, null::text,
                        false, null::timestamptz;
    return;
  end if;

  if ident is not null then
    select * into a
      from public.classic_register_attendees att
     where att.session_id = _session_id
       and (att.id::text = ident or lower(att.email) = lower(ident))
     limit 1
       for update;
  end if;

  -- Already gave feedback for this day: do not record a second response.
  if a.id is not null and a.feedback_completed then
    return query select 'already_submitted'::text, a.id, a.name, a.email,
                        (a.checked_in_at is not null), a.certificate_sent_at;
    return;
  end if;

  insert into public.classic_register_feedback (session_id, overall_rating, answers, comments)
  values (_session_id, _overall, coalesce(_answers, '{}'::jsonb),
          nullif(btrim(coalesce(_comments, '')), ''));

  if a.id is null then
    -- The feedback still counts; there is simply nobody to gate a certificate for.
    return query select 'recorded_unmatched'::text, null::uuid, null::text, null::text,
                        false, null::timestamptz;
    return;
  end if;

  update public.classic_register_attendees set feedback_completed = true where id = a.id;

  return query select 'recorded'::text, a.id, a.name, a.email,
                      (a.checked_in_at is not null), a.certificate_sent_at;
end;
$$;

revoke all on function public.classic_register_enrol_trainee(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.classic_register_record_feedback(uuid, text, integer, jsonb, text)
  from public, anon, authenticated;


-- ###########################################################################
-- MIRRORS 20260907150000_registers_per_deanery.sql
-- A register belongs to a deanery
-- ###########################################################################
-- ============================================================================
-- A register belongs to a deanery, not only to a specialty
--
-- 20260907090000 keyed classic_registers on `specialty_id` alone, reasoning that
-- `specialties` is already deanery-scoped (unique (deanery_id, slug)) and so one
-- register per specialty row *was* one per specialty per deanery.
--
-- That reasoning does not survive the data. On this project all 26 specialties
-- belong to North West and Northern has none: the specialty table is used as a
-- single catalogue of specialty names, not as a per-deanery list. With
-- unique (specialty_id), ENT could have exactly one register in existence and
-- there was no way to open a Northern one at all.
--
-- Registers now carry their own `deanery_id`, and are unique per
-- (deanery, specialty). The specialty row names the specialty; the register's
-- own deanery_id is what places it. Those two can now disagree — a Northern
-- register may point at the catalogue's North West "ENT" row — and that is
-- deliberate: the alternative is duplicating all 26 specialties into every
-- deanery, which would change TraineeHQ's sidebar, content tree and access rules
-- for every user, to solve a problem in the register.
-- ============================================================================


alter table public.classic_registers
  add column if not exists deanery_id uuid references public.deaneries(id) on delete restrict;

-- Existing classic_registers keep the deanery their specialty already implied.
update public.classic_registers r
   set deanery_id = s.deanery_id
  from public.specialties s
 where s.id = r.specialty_id
   and r.deanery_id is null;

alter table public.classic_registers alter column deanery_id set not null;

alter table public.classic_registers drop constraint if exists classic_registers_specialty_id_key;
create unique index if not exists classic_registers_deanery_specialty_key
  on public.classic_registers (deanery_id, specialty_id);

create index if not exists classic_registers_deanery_idx on public.classic_registers (deanery_id);

-- ----------------------------------------------------------------------------
-- Which deaneries may this person open a register in?
--
-- Answered separately from `can_access_specialty`, which asks about TraineeHQ
-- content and would refuse a Northern admin the North West catalogue row they
-- now legitimately need.
--
--   super_admin              every active deanery
--   admin with no deanery    every active deanery
--   admin scoped to one      that one
--   anyone else              the deaneries of the classic_registers they already hold
-- ----------------------------------------------------------------------------
create or replace function public.classic_register_creatable_deaneries()
returns table (id uuid, name text, short_name text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.short_name
    from public.deaneries d
   where d.is_active
     and (
       public.has_role(auth.uid(), 'super_admin')
       or exists (
         select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('admin', 'super_admin')
            and (ur.deanery_id is null or ur.deanery_id = d.id)
       )
       or exists (
         select 1 from public.classic_register_members m
           join public.classic_registers r on r.id = m.register_id
          where m.user_id = auth.uid() and r.deanery_id = d.id
       )
     )
   order by d.name;
$$;

-- ----------------------------------------------------------------------------
-- The specialties still open in a given deanery
--
-- The whole active catalogue, minus the ones that already have a register in
-- that deanery. Not filtered by `specialties.deanery_id`: on this data that
-- would leave every deanery but North West with nothing to choose.
-- ----------------------------------------------------------------------------
create or replace function public.classic_register_creatable_specialties(_deanery_id uuid)
returns table (id uuid, name text, short_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.short_name
    from public.specialties s
   where s.is_active
     and s.deleted_at is null
     and exists (select 1 from public.classic_register_creatable_deaneries() d where d.id = _deanery_id)
     and not exists (
       select 1 from public.classic_registers r
        where r.deanery_id = _deanery_id and r.specialty_id = s.id
     )
   order by s.name;
$$;

-- ----------------------------------------------------------------------------
-- create_classic_register now takes both
-- ----------------------------------------------------------------------------
drop function if exists public.create_classic_register(uuid, text);

create or replace function public.create_classic_register(
  _deanery_id   uuid,
  _specialty_id uuid,
  _name         text default null
)
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

  if not public.can_create_classic_register(_caller) then
    raise exception 'You do not have permission to create a register'
      using hint = 'Registers can be created by administrators, or by anyone who already belongs to one.';
  end if;

  if not exists (select 1 from public.classic_register_creatable_deaneries() d where d.id = _deanery_id) then
    raise exception 'That is not a deanery you can create a register in';
  end if;

  select d.slug || '-' || s.slug, d.short_name || ' · ' || s.name
    into _slug, _label
    from public.specialties s, public.deaneries d
   where s.id = _specialty_id
     and d.id = _deanery_id
     and s.deleted_at is null
     and s.is_active;

  if _slug is null then
    raise exception 'That specialty does not exist';
  end if;

  begin
    insert into public.classic_registers (deanery_id, specialty_id, name, slug, created_by)
    values (_deanery_id, _specialty_id,
            coalesce(nullif(btrim(_name), ''), _label), _slug, _caller)
    returning id into _id;
  exception when unique_violation then
    raise exception 'A register already exists for that specialty in that deanery'
      using hint = 'Find it in the register directory and request access instead.';
  end;

  insert into public.classic_register_stores (register_id, updated_by) values (_id, _caller);

  insert into public.classic_register_members (register_id, user_id, role, granted_by)
  values (_id, _caller, 'owner', _caller);

  return _id;
end;
$$;

-- ----------------------------------------------------------------------------
-- The directory now reads the deanery off the register itself
-- ----------------------------------------------------------------------------
create or replace function public.classic_register_directory()
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
    r.id, r.name, r.slug,
    d.name as deanery_name,
    s.name as specialty_name,
    (select count(*) from public.classic_register_members m where m.register_id = r.id),
    public.is_classic_register_member(auth.uid(), r.id),
    (select ar.status
       from public.classic_register_access_requests ar
      where ar.register_id = r.id and ar.user_id = auth.uid()
      order by ar.created_at desc
      limit 1)
  from public.classic_registers r
  join public.specialties s on s.id = r.specialty_id
  join public.deaneries   d on d.id = r.deanery_id
  where r.is_active
  order by d.name, s.name;
$$;

revoke execute on function public.create_classic_register(uuid, uuid, text)          from public, anon;
revoke execute on function public.classic_register_creatable_deaneries()             from public, anon;
revoke execute on function public.classic_register_creatable_specialties(uuid)       from public, anon;

grant execute on function public.create_classic_register(uuid, uuid, text)           to authenticated;
grant execute on function public.classic_register_creatable_deaneries()              to authenticated;
grant execute on function public.classic_register_creatable_specialties(uuid)        to authenticated;


-- ###########################################################################
-- MIRRORS 20260909090000_register_certificate_logo.sql
-- Certificate logo
-- ###########################################################################
-- Let each register put its own badge on its certificates.
--
-- The certificate design is ported from the standalone ENT register, which
-- carried one logo for one programme and took it from an environment variable.
-- With many classic_registers that cannot work: the badge belongs to the register, so
-- it is stored against the register and uploaded by the people who run it.
--
-- A logo is organisational branding — a deanery crest, a society badge — not
-- personal data, so the bucket is public-read. Writing is another matter, and
-- is restricted to a register's OWNERS: an editor records attendance, an owner
-- decides what the register puts its name to.

alter table public.classic_registers
  add column if not exists certificate_logo_path text;

comment on column public.classic_registers.certificate_logo_path is
  'Object path in the classic-register-logos bucket, or null for a certificate with no badge.';

-- ------------------------------------------------------------------ bucket --
-- PNG and JPEG only: pdf-lib embeds those two and nothing else, so accepting an
-- SVG here would mean accepting a file that silently fails to appear on the
-- certificate later. 2 MB is generous for a logo and small enough that a
-- mistakenly chosen photograph is refused at the door.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'classic-register-logos', 'classic-register-logos', true, 2097152,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Paths are '<register_id>/<uuid>.<ext>', so the first folder segment is the
-- register whose owners may write there.
drop policy if exists "classic register logos are readable" on storage.objects;
create policy "classic register logos are readable"
  on storage.objects for select
  using (bucket_id = 'classic-register-logos');

drop policy if exists "classic register owners upload logos" on storage.objects;
create policy "classic register owners upload logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'classic-register-logos'
    and public.is_classic_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "classic register owners replace logos" on storage.objects;
create policy "classic register owners replace logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'classic-register-logos'
    and public.is_classic_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "classic register owners remove logos" on storage.objects;
create policy "classic register owners remove logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'classic-register-logos'
    and public.is_classic_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- --------------------------------------------------------------- directory --
-- The directory is where the app learns everything about a register, so the
-- logo and "am I an owner" belong on it rather than in a second round trip.
-- Adding columns to a RETURNS TABLE needs a drop; the grants are restored
-- below to match restrict_security_definer_function_execute.
drop function if exists public.classic_register_directory();

create function public.classic_register_directory()
returns table (
  id uuid,
  name text,
  slug text,
  deanery_name text,
  specialty_name text,
  member_count bigint,
  i_am_member boolean,
  i_am_owner boolean,
  certificate_logo_path text,
  my_request request_status
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.name, r.slug, d.name, s.name,
    (select count(*) from public.classic_register_members m where m.register_id = r.id),
    public.is_classic_register_member(auth.uid(), r.id),
    public.is_classic_register_owner(auth.uid(), r.id),
    r.certificate_logo_path,
    (select ar.status from public.classic_register_access_requests ar
      where ar.register_id = r.id and ar.user_id = auth.uid()
      order by ar.created_at desc limit 1)
  from public.classic_registers r
  join public.specialties s on s.id = r.specialty_id
  join public.deaneries   d on d.id = r.deanery_id
  where r.is_active
  order by d.name, s.name;
$function$;

revoke all on function public.classic_register_directory() from public, anon;
grant execute on function public.classic_register_directory() to authenticated;

-- ###########################################################################
-- MIRRORS the register rows of 20260908162406_index_foreign_keys.sql
-- Indexes on the foreign keys Postgres does not index for you
-- ###########################################################################
create index if not exists classic_register_access_requests_decided_by_idx
  on public.classic_register_access_requests (decided_by);
create index if not exists classic_register_members_granted_by_idx
  on public.classic_register_members (granted_by);
create index if not exists classic_register_stores_updated_by_idx
  on public.classic_register_stores (updated_by);
create index if not exists classic_registers_created_by_idx
  on public.classic_registers (created_by);
create index if not exists classic_registers_specialty_id_idx
  on public.classic_registers (specialty_id);

-- ###########################################################################
-- MIRRORS the register rows of 20260908190000_audit_log_write_path.sql
-- Membership changes are recorded, on this register's own trigger function
-- ###########################################################################
--
-- A separate function rather than two more branches inside audit_row_change().
-- That function is shared with the live register and with TraineeHQ's own role
-- grants; editing it to teach it about the copy would put the first register's
-- audit trail on the same code path as an experiment that is expected to be
-- deleted. This writes to the same public.audit_log, under its own action names,
-- so the two are told apart when read.
create or replace function public.classic_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _action  text;
  _details jsonb;
begin
  if TG_TABLE_NAME = 'classic_register_members' then
    if TG_OP = 'INSERT' then
      _action := 'classic_register.member_added';
      _details := jsonb_build_object(
        'register_id', NEW.register_id, 'subject_user_id', NEW.user_id, 'role', NEW.role);
    elsif TG_OP = 'DELETE' then
      _action := 'classic_register.member_removed';
      _details := jsonb_build_object(
        'register_id', OLD.register_id, 'subject_user_id', OLD.user_id, 'role', OLD.role);
    else
      _action := 'classic_register.member_role_changed';
      _details := jsonb_build_object(
        'register_id', NEW.register_id, 'subject_user_id', NEW.user_id,
        'from', OLD.role, 'to', NEW.role);
    end if;

  elsif TG_TABLE_NAME = 'classic_register_access_requests' then
    -- Only the decision is interesting; an applicant editing their own pending
    -- request is not an access event.
    if OLD.status is not distinct from NEW.status then
      return NEW;
    end if;
    _action := 'classic_register.access_decided';
    _details := jsonb_build_object(
      'request_id', NEW.id, 'register_id', NEW.register_id,
      'subject_user_id', NEW.user_id, 'status', NEW.status);

  else
    raise warning 'classic_audit_row_change: no rule for table %', TG_TABLE_NAME;
    return coalesce(NEW, OLD);
  end if;

  insert into public.audit_log (user_id, action, details)
  values (auth.uid(), _action, _details);

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_classic_register_members on public.classic_register_members;
create trigger audit_classic_register_members
  after insert or update or delete on public.classic_register_members
  for each row execute function public.classic_audit_row_change();

drop trigger if exists audit_classic_register_access_requests on public.classic_register_access_requests;
create trigger audit_classic_register_access_requests
  after update on public.classic_register_access_requests
  for each row execute function public.classic_audit_row_change();

commit;
