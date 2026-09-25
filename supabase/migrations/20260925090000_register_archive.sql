-- ============================================================================
-- The teaching register archive: fifteen days between "delete" and gone
--
-- The same archive the classic register gained in 20260921120000, brought to
-- the teaching register (`registers` and friends) so the two behave alike.
-- Everything below mirrors that migration table for table; the reasoning is
-- repeated here so this file stands on its own.
--
-- Deleting a register used to be one click away from destroying every trainee,
-- teaching day, attendance mark, feedback response and certificate record it
-- held, with the cascade doing its work before anyone could reconsider. The
-- data is a training record — the kind of thing somebody needs six months later
-- to prove a trainee attended — so a mistaken press should be survivable.
--
-- Deleting now ARCHIVES: the register keeps all its rows, drops out of the
-- directory, and can be restored whole for fifteen days. After that it is
-- destroyed for real, and it can be destroyed on purpose at any point before
-- that from the archive itself.
--
-- WHY `is_active` IS NOT ENOUGH. The column already existed and the directory
-- already filtered on it, but it says only "hidden" — it carries no date, so
-- nothing can say how long is left or sweep up what has expired. `archived_at`
-- is the fact; `is_active` is kept in step with it so every existing filter
-- goes on working untouched.
--
-- HOW EXPIRY IS ENFORCED WITHOUT A SCHEDULER. pg_cron is not installed on this
-- project, so there is no timer to fire at day fifteen. Instead the sweep runs
-- at the two moments the difference can be observed: reading the archive (so
-- nothing past its window is ever offered back), and creating a register (so an
-- expired one stops holding its specialty hostage). Between those moments an
-- expired row may sit in the table unseen — invisible to every read path, and
-- unrecoverable, because `restore` checks the window itself rather than
-- trusting that the sweep has run. Enabling pg_cron and scheduling
-- `purge_expired_registers()` would make the wall clock exact; the
-- function is written to be called either way.
--
-- RE-RUNNABILITY: additive columns are `if not exists`, every function is
-- `create or replace` with an unchanged signature, and the policy is dropped
-- before it is created. This file can be applied twice.
-- ============================================================================

begin;

-- ----------------------------------------------------------------- the fact --
alter table public.registers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.registers.archived_at is
  'When this register was archived. Null means live. Fifteen days after this it is destroyed.';

-- Partial: archived registers are the rare case, and every query that reads
-- this column is only ever interested in the rows where it is set.
create index if not exists registers_archived_idx
  on public.registers (archived_at)
  where archived_at is not null;

-- ------------------------------------------------------------ the window --
-- One definition of "fifteen days", so the sweep, the restore guard, the
-- creatable-specialty filter and the countdown shown to the organiser cannot
-- drift apart. The client never hardcodes it either: `purge_at` is returned
-- with each archived register and the countdown is drawn from that.
create or replace function public.register_archive_days()
returns integer
language sql
immutable
as $$ select 15 $$;

-- ------------------------------------------------------------- the sweep --
-- Destroy every archived register whose window has closed. Takes no argument
-- and cannot be pointed at a particular register: the only rows it can reach
-- are ones already past the point of recovery.
create or replace function public.purge_expired_registers()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _gone integer;
begin
  delete from public.registers
   where archived_at is not null
     and archived_at < now() - make_interval(days => public.register_archive_days());
  get diagnostics _gone = row_count;
  return _gone;
end;
$$;

-- --------------------------------------------------------------- archiving --
-- Returns the moment the register will be destroyed, so the caller can say so
-- without doing the arithmetic itself.
create or replace function public.archive_register(_register_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _when   timestamptz;
begin
  if _caller is null then
    raise exception 'You must be signed in to archive a register';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can archive this register';
  end if;

  -- `is_active` goes with it: every existing read path filters on that column
  -- and none of them has been taught about `archived_at`.
  update public.registers
     set archived_at = now(), archived_by = _caller, is_active = false
   where id = _register_id
     and archived_at is null
  returning archived_at into _when;

  if _when is null then
    raise exception 'That register is already in the archive';
  end if;

  return _when + make_interval(days => public.register_archive_days());
end;
$$;

-- --------------------------------------------------------------- restoring --
-- The window is checked here rather than assumed: the sweep runs opportunis-
-- tically, so an expired register may still be sitting in the table, and it
-- must not come back to life just because nobody has looked at the archive.
create or replace function public.restore_register(_register_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _rows   integer;
begin
  if _caller is null then
    raise exception 'You must be signed in to restore a register';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can restore this register';
  end if;

  update public.registers
     set archived_at = null, archived_by = null, is_active = true
   where id = _register_id
     and archived_at is not null
     and archived_at >= now() - make_interval(days => public.register_archive_days());
  get diagnostics _rows = row_count;

  if _rows = 0 then
    raise exception 'That register is not in the archive, or its % days are already up',
      public.register_archive_days();
  end if;
end;
$$;

-- ----------------------------------------------------------- reading it --
-- An owner's own archive. Sweeps before it answers, so what comes back is
-- exactly what can still be recovered — never a row whose window has closed.
--
-- The trainee and session counts come from the register's own blob and are
-- what makes the row mean anything: "Mersey · ENT — 24 trainees, 11 teaching
-- days" is a decision, "Mersey · ENT" is a filename.
create or replace function public.register_archive()
returns table (
  id             uuid,
  name           text,
  slug           text,
  deanery_name   text,
  specialty_name text,
  archived_at    timestamptz,
  purge_at       timestamptz,
  trainee_count  integer,
  session_count  integer
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.purge_expired_registers();

  return query
    select
      r.id, r.name, r.slug, d.name, s.name,
      r.archived_at,
      r.archived_at + make_interval(days => public.register_archive_days()),
      coalesce(case when jsonb_typeof(st.data -> 'trainees') = 'array'
                    then jsonb_array_length(st.data -> 'trainees') end, 0),
      coalesce(case when jsonb_typeof(st.data -> 'sessions') = 'array'
                    then jsonb_array_length(st.data -> 'sessions') end, 0)
      from public.registers r
      join public.specialties s on s.id = r.specialty_id
      join public.deaneries   d on d.id = r.deanery_id
      left join public.register_stores st on st.register_id = r.id
     where r.archived_at is not null
       and public.is_register_owner(auth.uid(), r.id)
     order by r.archived_at desc;
end;
$$;

-- ------------------------------------------------- destroying on purpose --
-- The delete policy now requires the register to be in the archive first.
-- Permanent deletion stays a direct DELETE rather than an RPC — RLS is the
-- whole rule and the cascade does the rest — but it is no longer reachable in
-- one step from a live register.
drop policy if exists "owners delete their register"          on public.registers;
drop policy if exists "owners delete their archived register" on public.registers;
create policy "owners delete their archived register"
  on public.registers for delete to authenticated
  using (public.is_register_owner(auth.uid(), id) and archived_at is not null);

-- ------------------------------------------------- making room again --
-- A specialty already holding a register cannot take a second one. An archived
-- register still holds its specialty — that is the point of being restorable —
-- but one whose window has closed must not, so it is ignored here and swept
-- away for real by create_register() below.
create or replace function public.register_creatable_specialties(_deanery_id uuid)
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
     and exists (select 1 from public.register_creatable_deaneries() d where d.id = _deanery_id)
     and not exists (
       select 1 from public.registers r
        where r.deanery_id = _deanery_id
          and r.specialty_id = s.id
          and (r.archived_at is null
               or r.archived_at >= now() - make_interval(days => public.register_archive_days()))
     )
   order by s.name;
$$;

-- Unchanged but for two things: it sweeps first, so an expired archive entry
-- releases its specialty, and it tells an organiser who collides with an
-- ARCHIVED register where that register actually is — the old message sent
-- them to the directory to request access to something they cannot see.
create or replace function public.create_register(
  _deanery_id uuid, _specialty_id uuid, _name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller   uuid := auth.uid();
  _id       uuid;
  _slug     text;
  _label    text;
  _archived boolean;
begin
  if _caller is null then
    raise exception 'You must be signed in to create a register';
  end if;

  if not public.can_create_register(_caller) then
    raise exception 'You do not have permission to create a register'
      using hint = 'Registers can be created by administrators, or by anyone who already belongs to one.';
  end if;

  if not exists (select 1 from public.register_creatable_deaneries() d where d.id = _deanery_id) then
    raise exception 'That is not a deanery you can create a register in';
  end if;

  perform public.purge_expired_registers();

  select r.archived_at is not null
    into _archived
    from public.registers r
   where r.deanery_id = _deanery_id
     and r.specialty_id = _specialty_id
   limit 1;

  if _archived then
    raise exception 'That register is in the archive'
      using hint = 'Restore it from the archive on the register directory, or delete it permanently there first.';
  elsif _archived is not null then
    raise exception 'A register already exists for that specialty in that deanery'
      using hint = 'Find it in the register directory and request access instead.';
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
    insert into public.registers (deanery_id, specialty_id, name, slug, created_by)
    values (_deanery_id, _specialty_id,
            coalesce(nullif(btrim(_name), ''), _label), _slug, _caller)
    returning id into _id;
  exception when unique_violation then
    raise exception 'A register already exists for that specialty in that deanery'
      using hint = 'Find it in the register directory and request access instead.';
  end;

  insert into public.register_stores (register_id, updated_by) values (_id, _caller);

  insert into public.register_members (register_id, user_id, role, granted_by)
  values (_id, _caller, 'owner', _caller);

  return _id;
end;
$$;

-- --------------------------------------------------------------- grants --
-- The sweep is deliberately NOT granted to `authenticated`: it is only ever
-- reached from inside the security-definer functions above, which run as their
-- own definer and so need no grant from the caller.
revoke all on function public.purge_expired_registers()        from public, anon, authenticated;
revoke all on function public.register_archive_days()          from public, anon;
revoke all on function public.archive_register(uuid)           from public, anon;
revoke all on function public.restore_register(uuid)           from public, anon;
revoke all on function public.register_archive()               from public, anon;

grant execute on function public.register_archive_days()       to authenticated;
grant execute on function public.archive_register(uuid)        to authenticated;
grant execute on function public.restore_register(uuid)        to authenticated;
grant execute on function public.register_archive()            to authenticated;
grant execute on function public.purge_expired_registers()     to service_role;

commit;
