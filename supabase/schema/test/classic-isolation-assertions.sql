-- ============================================================================
-- The copy must not disturb the register it was copied from.
--
-- Everything else in this suite proves the classic register works. This file
-- proves the LIVE one still does, which is the actual promise made when a
-- duplicate is added to a running system.
--
-- It exists because of a real bug caught during deployment: policy names are
-- scoped to their table, so the generator left them alone — but both registers
-- put their certificate-logo policies on the one shared storage.objects table.
-- The copy's "drop policy if exists" therefore deleted the live register's logo
-- policies and replaced them with ones pointing at the classic bucket. Nothing
-- in the schema would have complained; logo upload would simply have stopped
-- working on the register being kept.
-- ============================================================================

do $$
declare _missing text;
begin
  -- 1. The live register's four logo policies still exist, and still point at
  --    the live register's bucket.
  foreach _missing in array array[
    'register logos are readable', 'register owners upload logos',
    'register owners replace logos', 'register owners remove logos'
  ]
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = _missing
         and coalesce(qual, with_check) like '%''register-logos''%'
    ) then
      raise exception 'FAIL 1: storage policy "%" is missing or no longer points at register-logos', _missing;
    end if;
  end loop;
  raise notice 'ok  1  the live register keeps its four logo policies';

  -- 2. The copy has four of its own, pointing at its own bucket.
  foreach _missing in array array[
    'classic register logos are readable', 'classic register owners upload logos',
    'classic register owners replace logos', 'classic register owners remove logos'
  ]
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = _missing
         and coalesce(qual, with_check) like '%''classic-register-logos''%'
    ) then
      raise exception 'FAIL 2: storage policy "%" is missing or does not point at classic-register-logos', _missing;
    end if;
  end loop;
  raise notice 'ok  2  the copy has its own four, on its own bucket';

  -- 3. Two buckets, not one renamed.
  if (select count(*) from storage.buckets where id in ('register-logos', 'classic-register-logos')) <> 2 then
    raise exception 'FAIL 3: expected both logo buckets to exist';
  end if;
  raise notice 'ok  3  both logo buckets exist';

  -- 4. The live register's own tables, functions and policies are all still
  --    there. A rename that reached too far would show up here.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'registers') then
    raise exception 'FAIL 4: public.registers is gone';
  end if;
  foreach _missing in array array[
    'is_register_member', 'is_register_owner', 'register_directory',
    'save_register', 'create_register', 'register_people'
  ]
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = _missing) then
      raise exception 'FAIL 4: the live register lost public.%()', _missing;
    end if;
  end loop;
  raise notice 'ok  4  the live register keeps its tables and functions';
end $$;

do $$
begin
  raise notice 'All classic-isolation assertions passed.';
end $$;
