
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
