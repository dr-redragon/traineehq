-- Make a register's records survivable.
--
-- A register's whole dataset — trainees, teaching days, attendance, excusals,
-- long-term statuses — is one JSONB blob, written whole by save_register().
-- Nothing kept the previous version, so any member could replace years of
-- training records with an empty blob in one call, by mistake or otherwise,
-- and there was no way back. Separately, owners could UPDATE registers
-- directly and set archived_at to any date, skipping the fifteen-day window
-- the archive exists to provide, then delete the register outright. None of
-- it was audited.
--
-- 1. HISTORY. Every organiser save (a version bump) first copies the version
--    it replaces into register_store_history. Every version is kept: a blob is
--    tens of kilobytes, so years of saves stay small. (Pruning was left out
--    deliberately — see the note at the foot of this file.) Trainee check-ins
--    do not bump the version and are not copied.
--    Owners list versions with register_history() and roll back with
--    restore_register_version(), which is itself a save, so it can be undone.
--    The table has no client grants or policies: it is reached only through
--    those two functions.
--
-- 2. AUDIT. A save that removes trainees, teaching days or attendance marks is
--    logged with the before and after counts, as are archiving, restoring and
--    deleting a register. Ordinary edits are not logged — the history has them.
--
-- 3. COLUMNS. Browsers may update a register's name and certificate badge and
--    nothing else. Archiving and restoring go through archive_register() and
--    restore_register(), which already enforce the window.

begin;

-- ---------------------------------------------------------------- history --
create table if not exists public.register_store_history (
  id           bigserial primary key,
  register_id  uuid   not null references public.registers(id) on delete cascade,
  version      bigint not null,
  data         jsonb  not null,
  saved_by     uuid   references auth.users(id) on delete set null,
  saved_at     timestamptz,
  replaced_by  uuid   references auth.users(id) on delete set null,
  replaced_at  timestamptz not null default now(),
  unique (register_id, version)
);

create index if not exists register_store_history_register_idx
  on public.register_store_history (register_id, version desc);

alter table public.register_store_history enable row level security;
alter table public.register_store_history force row level security;
revoke all on public.register_store_history from anon, authenticated;
revoke all on sequence public.register_store_history_id_seq from anon, authenticated;

-- Counts that say whether a save removed anything worth noticing.
create or replace function public.register_blob_counts(_data jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'trainees',   case when jsonb_typeof(_data -> 'trainees') = 'array'
                       then jsonb_array_length(_data -> 'trainees') else 0 end,
    'sessions',   case when jsonb_typeof(_data -> 'sessions') = 'array'
                       then jsonb_array_length(_data -> 'sessions') else 0 end,
    'attendance', case when jsonb_typeof(_data -> 'attendance') = 'object'
                       then (select count(*) from jsonb_object_keys(_data -> 'attendance')) else 0 end
  );
$$;

create or replace function public.register_store_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _before jsonb;
  _after  jsonb;
begin
  -- A check-in rewrites the blob without bumping the version; only organiser
  -- saves are versions worth keeping.
  if NEW.version is not distinct from OLD.version then
    return NEW;
  end if;

  insert into public.register_store_history
    (register_id, version, data, saved_by, saved_at, replaced_by)
  values
    (OLD.register_id, OLD.version, coalesce(OLD.data, '{}'::jsonb),
     OLD.updated_by, OLD.updated_at, auth.uid())
  on conflict (register_id, version) do nothing;

  _before := public.register_blob_counts(OLD.data);
  _after  := public.register_blob_counts(NEW.data);
  if (_after->>'trainees')::int   < (_before->>'trainees')::int
     or (_after->>'sessions')::int   < (_before->>'sessions')::int
     or (_after->>'attendance')::int < (_before->>'attendance')::int then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.records_removed', jsonb_build_object(
      'register_id', NEW.register_id, 'from_version', OLD.version,
      'to_version', NEW.version, 'before', _before, 'after', _after));
  end if;

  return NEW;
end;
$$;

revoke all on function public.register_store_snapshot() from public, anon, authenticated;

create or replace trigger register_store_snapshot
  before update on public.register_stores
  for each row execute function public.register_store_snapshot();

-- Owners' view of the history: when, by whom, and how big — not the data.
create or replace function public.register_history(_register_id uuid)
returns table (
  version     bigint,
  saved_at    timestamptz,
  saved_by    uuid,
  replaced_at timestamptz,
  replaced_by uuid,
  counts      jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_register_owner(auth.uid(), _register_id) then
    raise exception 'Only an owner of this register can see its history';
  end if;
  return query
    select h.version, h.saved_at, h.saved_by, h.replaced_at, h.replaced_by,
           public.register_blob_counts(h.data)
      from public.register_store_history h
     where h.register_id = _register_id
     order by h.version desc;
end;
$$;

-- Put an earlier version back. A save like any other: it bumps the version,
-- so what it replaces goes into the history and the restore can be undone.
create or replace function public.restore_register_version(_register_id uuid, _version bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _data   jsonb;
  _new    bigint;
begin
  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner of this register can restore an earlier version';
  end if;

  select data into _data from public.register_store_history
   where register_id = _register_id and version = _version;
  if _data is null then
    raise exception 'That version is not in the history';
  end if;

  update public.register_stores
     set data = _data, version = version + 1, updated_at = now(), updated_by = _caller
   where register_id = _register_id
  returning version into _new;

  insert into public.audit_log (user_id, action, details)
  values (_caller, 'register.version_restored', jsonb_build_object(
    'register_id', _register_id, 'restored_version', _version, 'new_version', _new));

  return _new;
end;
$$;

revoke all on function public.register_blob_counts(jsonb)               from public, anon;
revoke all on function public.register_history(uuid)                    from public, anon;
revoke all on function public.restore_register_version(uuid, bigint)    from public, anon;
grant execute on function public.register_blob_counts(jsonb)            to authenticated;
grant execute on function public.register_history(uuid)                 to authenticated;
grant execute on function public.restore_register_version(uuid, bigint) to authenticated;

-- ------------------------------------------------------------- lifecycle --
create or replace function public.audit_register_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP <> 'UPDATE' then   -- the row is being removed
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.deleted', jsonb_build_object(
      'register_id', OLD.id, 'name', OLD.name, 'archived_at', OLD.archived_at));
    return OLD;
  end if;

  if OLD.archived_at is null and NEW.archived_at is not null then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.archived', jsonb_build_object('register_id', NEW.id));
  elsif OLD.archived_at is not null and NEW.archived_at is null then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.restored', jsonb_build_object('register_id', NEW.id));
  end if;
  return NEW;
end;
$$;

revoke all on function public.audit_register_lifecycle() from public, anon, authenticated;

create or replace trigger audit_register_lifecycle
  after update of archived_at or delete on public.registers
  for each row execute function public.audit_register_lifecycle();

-- ---------------------------------------------------------------- columns --
-- Whole-table UPDATE let an owner set archived_at to a date fifteen days ago
-- and delete at once. A browser may now change only these two.
revoke update on public.registers from authenticated;
grant update (name, certificate_logo_path) on public.registers to authenticated;

commit;

-- PRUNING. Not done here. Versions accumulate; if they ever need trimming, do
-- it from a scheduled job under the service role (keep, say, the latest 100
-- per register), not from this trigger.
