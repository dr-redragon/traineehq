-- ============================================================================
-- One register database: remove the classic register's own copy
--
-- The classic register (/classic-registers) began as a copy of the teaching
-- register with a parallel set of classic_* tables, functions and a logo
-- bucket, so the two could be compared side by side without touching each
-- other. It now reads and writes the teaching register's own tables — the same
-- registers, memberships, trainees, teaching days, sign-ins and feedback — so
-- an edit in either shows in both and access to a register is access in both.
--
-- That leaves everything classic_* unused. The data in it was placeholder data
-- (a sample NW · ENT register), and the owner chose to keep the teaching
-- register's copy and delete this one, so nothing is migrated across.
--
-- Apply only once the app that no longer reads these tables is live: until
-- then the deployed classic register still depends on them.
--
-- Dropping the tables takes their policies, indexes, triggers and row types
-- with them. The functions are dropped by exact signature so nothing of the
-- teaching register's can be caught by accident. `if exists` throughout, so
-- this can be applied twice.
-- ============================================================================

begin;

-- ----------------------------------------------------------------- tables --
-- Children before parents; `cascade` only mops up what hangs off each table
-- (its policies and triggers) — nothing outside classic_* refers to them.
drop table if exists public.classic_register_feedback        cascade;
drop table if exists public.classic_register_attendees       cascade;
drop table if exists public.classic_register_forms           cascade;
drop table if exists public.classic_register_sessions        cascade;
drop table if exists public.classic_register_access_requests cascade;
drop table if exists public.classic_register_members         cascade;
drop table if exists public.classic_register_stores          cascade;
drop table if exists public.classic_registers                cascade;

-- -------------------------------------------------------------- storage --
-- First, because three of these policies call is_classic_register_owner() and
-- would block it being dropped. The classic logo bucket's policies, then the
-- bucket itself. The classic
-- register now uses the teaching register's `register-logos` bucket.
drop policy if exists "classic register logos are readable"    on storage.objects;
drop policy if exists "classic register owners upload logos"   on storage.objects;
drop policy if exists "classic register owners replace logos"  on storage.objects;
drop policy if exists "classic register owners remove logos"   on storage.objects;

-- Empty when this was written. Some projects refuse direct writes to the
-- storage schema; if so the bucket is left for deleting from the dashboard
-- rather than failing the whole migration over an empty bucket.
do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'classic-register-logos') then
    delete from storage.buckets where id = 'classic-register-logos';
  end if;
exception when others then
  raise notice 'classic-register-logos bucket not removed (%); delete it from the dashboard', sqlerrm;
end;
$$;

-- -------------------------------------------------------------- functions --
drop function if exists public.archive_classic_register(uuid);
drop function if exists public.can_create_classic_register(uuid);
drop function if exists public.classic_audit_row_change();
drop function if exists public.classic_register_archive();
drop function if exists public.classic_register_archive_days();
drop function if exists public.classic_register_creatable_deaneries();
drop function if exists public.classic_register_creatable_specialties(uuid);
drop function if exists public.classic_register_directory();
drop function if exists public.classic_register_enrol_trainee(uuid, text, text, text);
drop function if exists public.classic_register_people(uuid);
drop function if exists public.classic_register_public_roster(uuid);
drop function if exists public.classic_register_public_session(uuid);
drop function if exists public.classic_register_record_checkin(uuid, text, text);
drop function if exists public.classic_register_record_feedback(uuid, text, integer, jsonb, text);
drop function if exists public.classic_register_resolve_trainee_email(uuid, text, text);
drop function if exists public.create_classic_register(uuid, uuid, text);
drop function if exists public.decide_classic_register_access(uuid, boolean, text);
drop function if exists public.is_classic_register_member(uuid, uuid);
drop function if exists public.is_classic_register_owner(uuid, uuid);
drop function if exists public.purge_expired_classic_registers();
drop function if exists public.remove_classic_register_member(uuid, uuid);
drop function if exists public.request_classic_register_access(uuid, text);
drop function if exists public.restore_classic_register(uuid);
drop function if exists public.save_classic_register(uuid, jsonb, bigint);
drop function if exists public.set_classic_register_member_role(uuid, uuid, public.classic_register_role);

drop type if exists public.classic_register_role;

commit;
