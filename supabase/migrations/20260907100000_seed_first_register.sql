-- ============================================================================
-- Stage 2: the first register, and its owner
--
-- After 20260907090000_register_multi_tenancy.sql nothing is reachable: no
-- register exists, and no account holds a membership. By design — there is no
-- god-mode read, so a register with no members is a register nobody can open.
-- This migration ends that state by creating the ENT register from the legacy
-- attendance blob and naming its first owner.
--
-- It also promotes that account to TraineeHQ super_admin. The two are separate
-- grants on purpose and neither implies the other: the super_admin role governs
-- TraineeHQ content, the register_members row governs the register. This account
-- gets both because it is the operator's; nobody else inherits either.
--
-- IDEMPOTENT AND ORDER-TOLERANT. If the account has not signed up yet, the
-- migration applies cleanly, changes nothing, and says so — run it again once
-- the account exists (it is safe to repeat, and will pick up where it left off):
--
--     psql "$DATABASE_URL" -f supabase/migrations/20260907100000_seed_first_register.sql
-- ============================================================================

begin;

do $$
declare
  -- The operator's account. Matches the address the standalone register already
  -- bootstraps its own administrator from, so the same person owns both while
  -- the two systems run side by side.
  _email  constant text := 'mabdelaziz@outlook.com';

  _uid    uuid;
  _spec   uuid;
  _reg    uuid;
  _slug   text;
  _label  text;
  _blob   jsonb;
  _seeded boolean := false;
begin
  select id into _uid from auth.users where lower(email) = lower(_email);

  if _uid is null then
    raise notice '--';
    raise notice 'No account for % yet — nothing seeded.', _email;
    raise notice 'Sign up with that address, then run this migration again.';
    raise notice '--';
    return;
  end if;

  -- ------------------------------------------------------------------ role --
  insert into public.user_roles (user_id, role)
  values (_uid, 'super_admin')
  on conflict (user_id, role) do nothing;

  if found then
    raise notice 'Granted super_admin to %.', _email;
  else
    raise notice 'Already a super_admin: %.', _email;
  end if;

  -- ------------------------------------------------------------- specialty --
  -- The legacy register is the ENT teaching register, but it predates deaneries
  -- and carries no hint of which one it belongs to. Prefer the specialty in the
  -- owner's own deanery; failing that, take the first ENT specialty there is.
  select s.id
    into _spec
    from public.specialties s
    join public.deaneries d on d.id = s.deanery_id
    left join public.profiles p on p.user_id = _uid
   where s.deleted_at is null
     and s.is_active
     and (s.slug = 'ent' or s.short_name ilike 'ent' or s.name ilike '%otolaryng%')
   order by (p.deanery_id is not null and s.deanery_id = p.deanery_id) desc,
            d.name
   limit 1;

  if _spec is null then
    raise notice '--';
    raise notice 'No ENT specialty found, so no register was created.';
    raise notice 'Add one under Admin → Specialties, then run this migration again.';
    raise notice '--';
    return;
  end if;

  -- -------------------------------------------------------------- register --
  select id into _reg from public.registers where specialty_id = _spec;

  if _reg is null then
    -- Same name and slug create_register() would produce, so a register seeded
    -- here is indistinguishable from one made through the app.
    select d.slug || '-' || s.slug, d.short_name || ' · ' || s.name
      into _slug, _label
      from public.specialties s
      join public.deaneries d on d.id = s.deanery_id
     where s.id = _spec;

    insert into public.registers (specialty_id, name, slug, created_by)
    values (_spec, _label, _slug, _uid)
    returning id into _reg;

    raise notice 'Created register "%" (%).', _label, _slug;
  else
    raise notice 'Register already exists for that specialty; reusing it.';
  end if;

  -- ------------------------------------------------------------ membership --
  insert into public.register_members (register_id, user_id, role, granted_by)
  values (_reg, _uid, 'owner', _uid)
  on conflict (register_id, user_id) do update set role = 'owner';

  raise notice 'Owner of that register: %.', _email;

  -- ------------------------------------------------------- the legacy blob --
  -- public.register_store is the Lovable-era single-tenant table, left read-only
  -- by 20260828160000_revoke_anon_on_legacy_register_store.sql. It holds the real
  -- ENT attendance history in exactly the shape register_stores.data expects, so
  -- this is a copy rather than a transformation.
  --
  -- Reached through EXECUTE because the table is legacy: it is absent from
  -- supabase/schema/0001_traineehq_baseline.sql, so a project built from that
  -- baseline does not have it and a static reference would fail to plan.
  if to_regclass('public.register_store') is not null then
    execute 'select data from public.register_store where id = ''default''' into _blob;
  end if;

  -- Never overwrite a register that already holds data. Re-running this after
  -- the register has been used in anger must not roll it back to the import.
  select true into _seeded
    from public.register_stores
   where register_id = _reg
     and data is not null
     and data <> '{}'::jsonb;

  if coalesce(_seeded, false) then
    raise notice 'That register already holds data; the legacy blob was not copied over it.';

  elsif _blob is null or _blob = '{}'::jsonb then
    insert into public.register_stores (register_id, updated_by)
    values (_reg, _uid)
    on conflict (register_id) do nothing;

    raise notice 'No legacy register_store data found; the register starts empty.';

  else
    insert into public.register_stores (register_id, data, updated_by)
    values (_reg, _blob, _uid)
    on conflict (register_id) do update
      set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();

    raise notice 'Imported the legacy register: % trainees, % sessions.',
      coalesce(jsonb_array_length(_blob -> 'trainees'), 0),
      coalesce(jsonb_array_length(_blob -> 'sessions'), 0);
  end if;
end $$;

commit;

-- ============================================================================
-- AFTER RUNNING THIS
--
-- Confirm it landed:
--
--     select r.name, r.slug, m.role, u.email,
--            jsonb_array_length(s.data -> 'trainees') as trainees
--       from public.registers r
--       join public.register_members m on m.register_id = r.id
--       join auth.users u              on u.id = m.user_id
--       join public.register_stores s  on s.register_id = r.id;
--
-- The legacy public.register_store row is deliberately left in place. Drop it
-- only at Stage 10, once the import has been checked against the live register.
-- ============================================================================
