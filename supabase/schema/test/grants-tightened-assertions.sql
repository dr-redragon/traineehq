-- Assertions for 20261012130000_tighten_table_grants.sql.
--
-- The point: the browser roles hold only the privileges the app uses, so row-
-- level security is a second layer, not the only one.

\set ON_ERROR_STOP on

do $$
declare
  t record;
  _allowed text[] := array['deaneries:SELECT', 'specialties:SELECT', 'access_requests:INSERT'];
begin
  -- anon: exactly the public form's three privileges, on any public table.
  for t in
    select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public'
  loop
    if not (t.table_name || ':' || t.privilege_type) = any (_allowed) then
      raise exception 'FAIL 1: anon holds % on %', t.privilege_type, t.table_name;
    end if;
  end loop;

  -- authenticated: never TRUNCATE, REFERENCES or TRIGGER.
  for t in
    select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  loop
    raise exception 'FAIL 1: authenticated holds % on %', t.privilege_type, t.table_name;
  end loop;

  raise notice 'ok  1  anon has only the public form''s privileges; nobody can TRUNCATE';
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname not in ('register_public_session', 'register_public_roster')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    raise exception 'FAIL 2: anon can execute %', f.sig;
  end loop;

  -- ...while what signed-in users rely on still works.
  if not has_function_privilege('authenticated', 'public.specialty_is_available(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.can_access_specialty(uuid, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.register_public_roster(uuid)', 'execute') then
    raise exception 'FAIL 2: a function the app relies on lost its grant';
  end if;
  if has_function_privilege('authenticated', 'public.email_has_account(text)', 'execute') then
    raise exception 'FAIL 2: email_has_account became callable from a browser again';
  end if;
  raise notice 'ok  2  anon executes only the two check-in functions; the app''s helpers still work';
end $$;
