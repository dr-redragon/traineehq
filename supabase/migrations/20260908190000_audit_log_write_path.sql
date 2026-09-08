-- Make the audit log an audit log.
--
-- The table has existed since the baseline with nothing writing to it. Filling
-- it in from the client would have been the quick way and the wrong one, for
-- two reasons that this migration fixes instead.
--
-- 1. AN AUDIT LOG THE AUDITED PARTY WRITES IS NOT AN AUDIT LOG. The INSERT
--    policy was `with check (user_id = auth.uid())`, so entries would have been
--    written by the very account they describe — free to omit the entry, and
--    free to invent one. Writing now happens in triggers, under SECURITY
--    DEFINER, so the record is made whether or not the client cooperates and
--    regardless of which client it is.
--
-- 2. `anon` AND `authenticated` COULD EMPTY IT. Both held TRUNCATE (and anon
--    also DELETE and UPDATE) on the table. TRUNCATE is **not** filtered by row
--    level security — policies do not apply to it — so the grant alone let any
--    signed-in caller who could reach it discard the entire history. RLS being
--    enabled and forced gave no protection at all against that verb.
--
-- What is recorded: role grants, register membership, and the decisions on
-- access requests. Those are the events where somebody gains or loses sight of
-- other people's data, which is what an NHS tool's log is for.
--
-- `user_id` is the ACTOR, matching the existing read policy ("users read own
-- audit entries" = things I did). The subject is in `details`, by id. Ids
-- rather than names or addresses deliberately: the log is read by admins, and
-- copying personal data into a second place to satisfy data protection would be
-- an odd way to go about it.

-- ---------------------------------------------------------------- privileges --
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;

-- Nothing may write from a client any more, so the write policy has no purpose.
drop policy if exists "users write own audit entries" on public.audit_log;

-- ------------------------------------------------------------------ writing --
create or replace function public.record_audit_event(
  _action  text,
  _details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (user_id, action, details)
  values (auth.uid(), _action, coalesce(_details, '{}'::jsonb));
$$;

-- Callable only by the triggers below, which are themselves SECURITY DEFINER.
-- Exposing it to `authenticated` would hand back the forgery this migration is
-- closing: anyone could then write any action they liked against their own name.
revoke all on function public.record_audit_event(text, jsonb) from public, anon, authenticated;

/**
 * One trigger function for every audited table.
 *
 * Kept in one place so the set of recorded events can be read at a glance,
 * rather than scattered across four near-identical functions that drift.
 */
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _action  text;
  _details jsonb;
begin
  if TG_TABLE_NAME = 'user_roles' then
    if TG_OP = 'INSERT' then
      _action := 'role.granted';
      _details := jsonb_build_object(
        'subject_user_id', NEW.user_id, 'role', NEW.role, 'deanery_id', NEW.deanery_id);
    elsif TG_OP = 'DELETE' then
      _action := 'role.revoked';
      _details := jsonb_build_object(
        'subject_user_id', OLD.user_id, 'role', OLD.role, 'deanery_id', OLD.deanery_id);
    else
      _action := 'role.changed';
      _details := jsonb_build_object(
        'subject_user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role);
    end if;

  elsif TG_TABLE_NAME = 'register_members' then
    if TG_OP = 'INSERT' then
      _action := 'register.member_added';
      _details := jsonb_build_object(
        'register_id', NEW.register_id, 'subject_user_id', NEW.user_id, 'role', NEW.role);
    elsif TG_OP = 'DELETE' then
      _action := 'register.member_removed';
      _details := jsonb_build_object(
        'register_id', OLD.register_id, 'subject_user_id', OLD.user_id, 'role', OLD.role);
    else
      _action := 'register.member_role_changed';
      _details := jsonb_build_object(
        'register_id', NEW.register_id, 'subject_user_id', NEW.user_id,
        'from', OLD.role, 'to', NEW.role);
    end if;

  elsif TG_TABLE_NAME = 'access_requests' then
    -- Only the decision is interesting; an applicant editing their own pending
    -- request is not an access event.
    if OLD.status is not distinct from NEW.status then
      return NEW;
    end if;
    _action := 'access_request.decided';
    _details := jsonb_build_object('request_id', NEW.id, 'status', NEW.status);

  elsif TG_TABLE_NAME = 'register_access_requests' then
    if OLD.status is not distinct from NEW.status then
      return NEW;
    end if;
    _action := 'register.access_decided';
    _details := jsonb_build_object(
      'request_id', NEW.id, 'register_id', NEW.register_id,
      'subject_user_id', NEW.user_id, 'status', NEW.status);

  else
    -- A trigger added to a table nobody taught this function about should be
    -- noticed, not silently ignored.
    raise warning 'audit_row_change: no rule for table %', TG_TABLE_NAME;
    return coalesce(NEW, OLD);
  end if;

  insert into public.audit_log (user_id, action, details)
  values (auth.uid(), _action, _details);

  return coalesce(NEW, OLD);
end;
$$;

-- ----------------------------------------------------------------- triggers --
drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

drop trigger if exists audit_register_members on public.register_members;
create trigger audit_register_members
  after insert or update or delete on public.register_members
  for each row execute function public.audit_row_change();

drop trigger if exists audit_access_requests on public.access_requests;
create trigger audit_access_requests
  after update on public.access_requests
  for each row execute function public.audit_row_change();

drop trigger if exists audit_register_access_requests on public.register_access_requests;
create trigger audit_register_access_requests
  after update on public.register_access_requests
  for each row execute function public.audit_row_change();

-- ------------------------------------------------------------------ reading --
-- The admin view reads newest first; audit_log_user_idx already covers "mine".
create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);
