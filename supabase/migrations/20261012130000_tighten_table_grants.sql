-- Grant the browser roles what they use, and nothing that RLS does not cover.
--
-- Supabase's default privileges hand ALL on every new table to anon and
-- authenticated. The baseline never took them back from anon, so anon held
-- select/insert/update/delete — and TRUNCATE, REFERENCES and TRIGGER — on
-- twenty application tables, profiles and user_roles among them. Row-level
-- security was the only thing standing in the way, and TRUNCATE is not subject
-- to row-level security at all: it is refused today only because PostgREST
-- never issues it. One layer, where the register tables (20260907130000) have
-- two.
--
-- After this:
--   anon           SELECT deaneries, specialties and INSERT access_requests —
--                  exactly what the public Request Access form does — and no
--                  other table. Its only other door is the two check-in
--                  functions keyed on a session id.
--   authenticated  keeps the DML its policies govern, but loses TRUNCATE,
--                  REFERENCES and TRIGGER everywhere.
--   functions      anon may execute only register_public_session() and
--                  register_public_roster(); every other public function
--                  callable by anon is revoked (helpers like
--                  specialty_is_available() and trigger functions were exposed
--                  over /rest/v1/rpc for no reason).

begin;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.deaneries, public.specialties to anon;
grant insert on public.access_requests to anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- anon's EXECUTE often comes through PUBLIC, which signed-in users and the
-- service role may be relying on too (an RLS predicate run as authenticated,
-- say). So record who can execute each function first, revoke PUBLIC and
-- anon, then give back exactly what authenticated and service_role had.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as for_authenticated,
           has_function_privilege('service_role',  p.oid, 'execute') as for_service
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not in ('register_public_session', 'register_public_roster')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.for_authenticated then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.for_service then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- Keep it that way for whatever is created next. (Functions already default to
-- no anon EXECUTE since the baseline.)
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

commit;
