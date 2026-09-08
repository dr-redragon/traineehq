-- ============================================================================
-- A register belongs to a deanery, not only to a specialty
--
-- 20260907090000 keyed registers on `specialty_id` alone, reasoning that
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

begin;

alter table public.registers
  add column if not exists deanery_id uuid references public.deaneries(id) on delete restrict;

-- Existing registers keep the deanery their specialty already implied.
update public.registers r
   set deanery_id = s.deanery_id
  from public.specialties s
 where s.id = r.specialty_id
   and r.deanery_id is null;

alter table public.registers alter column deanery_id set not null;

alter table public.registers drop constraint if exists registers_specialty_id_key;
create unique index if not exists registers_deanery_specialty_key
  on public.registers (deanery_id, specialty_id);

create index if not exists registers_deanery_idx on public.registers (deanery_id);

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
--   anyone else              the deaneries of the registers they already hold
-- ----------------------------------------------------------------------------
create or replace function public.register_creatable_deaneries()
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
         select 1 from public.register_members m
           join public.registers r on r.id = m.register_id
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
        where r.deanery_id = _deanery_id and r.specialty_id = s.id
     )
   order by s.name;
$$;

-- ----------------------------------------------------------------------------
-- create_register now takes both
-- ----------------------------------------------------------------------------
drop function if exists public.create_register(uuid, text);

create or replace function public.create_register(
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

  if not public.can_create_register(_caller) then
    raise exception 'You do not have permission to create a register'
      using hint = 'Registers can be created by administrators, or by anyone who already belongs to one.';
  end if;

  if not exists (select 1 from public.register_creatable_deaneries() d where d.id = _deanery_id) then
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

-- ----------------------------------------------------------------------------
-- The directory now reads the deanery off the register itself
-- ----------------------------------------------------------------------------
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
    r.id, r.name, r.slug,
    d.name as deanery_name,
    s.name as specialty_name,
    (select count(*) from public.register_members m where m.register_id = r.id),
    public.is_register_member(auth.uid(), r.id),
    (select ar.status
       from public.register_access_requests ar
      where ar.register_id = r.id and ar.user_id = auth.uid()
      order by ar.created_at desc
      limit 1)
  from public.registers r
  join public.specialties s on s.id = r.specialty_id
  join public.deaneries   d on d.id = r.deanery_id
  where r.is_active
  order by d.name, s.name;
$$;

revoke execute on function public.create_register(uuid, uuid, text)          from public, anon;
revoke execute on function public.register_creatable_deaneries()             from public, anon;
revoke execute on function public.register_creatable_specialties(uuid)       from public, anon;

grant execute on function public.create_register(uuid, uuid, text)           to authenticated;
grant execute on function public.register_creatable_deaneries()              to authenticated;
grant execute on function public.register_creatable_specialties(uuid)        to authenticated;

commit;
