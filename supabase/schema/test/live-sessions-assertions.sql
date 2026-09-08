-- Assertions for 20260907120000_register_live_sessions.sql.
--
-- The property under test: a trainee holding a check-in link for one register
-- can reach that register's teaching day and nothing else. In the standalone
-- register the roster took no argument, because there was only ever one; the
-- whole point of this migration is that an unscoped roster would hand every
-- deanery's trainee list to anybody who scanned any QR code.
--
-- Runs at the end of scenario A, which already has 'mersey-ent'.

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- Fixture: a second register, so "leaks across registers" is testable at all
-- ----------------------------------------------------------------------------
begin;

insert into public.registers (id, deanery_id, specialty_id, name, slug)
values ('9e000000-0000-4000-8000-00000000000b',
        'd0000000-0000-4000-8000-000000000001',   -- Mersey
        '50000000-0000-4000-8000-000000000002',   -- Urology
        'Mersey · Urology', 'mersey-urology');

insert into public.register_stores (register_id, data) values
  ((select id from public.registers where slug = 'mersey-ent'),
   jsonb_build_object(
     'trainees', jsonb_build_array(
       jsonb_build_object('id','ent1','name','Ent Alpha','email','ent1@example.invalid'),
       jsonb_build_object('id','ent2','name','Ent Beta')),
     'sessions', jsonb_build_array(jsonb_build_object('id','es1','month','2026-01','title','ENT day')),
     'attendance', '{}'::jsonb, 'excused', '[]'::jsonb, 'status', '[]'::jsonb))
on conflict (register_id) do update set data = excluded.data;

insert into public.register_stores (register_id, data) values
  ('9e000000-0000-4000-8000-00000000000b',
   jsonb_build_object(
     'trainees', jsonb_build_array(
       jsonb_build_object('id','uro1','name','Uro Gamma','email','uro1@example.invalid')),
     'sessions', jsonb_build_array(jsonb_build_object('id','us1','month','2026-01','title','Urology day')),
     'attendance', '{}'::jsonb, 'excused', '[]'::jsonb, 'status', '[]'::jsonb));

insert into public.register_sessions (id, register_id, title, session_date, local_id) values
  ('a5000000-0000-4000-8000-0000000000e1',
   (select id from public.registers where slug = 'mersey-ent'),
   'ENT teaching day', '2026-01-14', 'es1'),
  ('a5000000-0000-4000-8000-0000000000f1',
   '9e000000-0000-4000-8000-00000000000b',
   'Urology teaching day', '2026-01-21', 'us1');

commit;

-- ----------------------------------------------------------------------------
-- 1. The superseded sketch is gone
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.teaching_sessions') is not null
     or to_regclass('public.attendance_records') is not null then
    raise exception 'FAIL 1: the abandoned teaching_sessions/attendance_records survived';
  end if;
  raise notice 'ok  1  superseded tables dropped';
end $$;

-- ----------------------------------------------------------------------------
-- 2. A link reaches its own register's roster — and only that one
-- ----------------------------------------------------------------------------
begin;
set local role anon;

do $$
declare
  _ent jsonb := public.register_public_roster('a5000000-0000-4000-8000-0000000000e1');
  _uro jsonb := public.register_public_roster('a5000000-0000-4000-8000-0000000000f1');
begin
  if jsonb_array_length(_ent->'trainees') <> 2 then
    raise exception 'FAIL 2: ENT link saw % trainees, expected 2',
      jsonb_array_length(_ent->'trainees');
  end if;

  if jsonb_array_length(_uro->'trainees') <> 1 then
    raise exception 'FAIL 2: Urology link saw % trainees, expected 1',
      jsonb_array_length(_uro->'trainees');
  end if;

  -- The assertion the whole migration exists for.
  if _ent::text like '%Uro Gamma%' then
    raise exception 'FAIL 2: an ENT check-in link leaked a Urology trainee';
  end if;
  if _uro::text like '%Ent Alpha%' or _uro::text like '%Ent Beta%' then
    raise exception 'FAIL 2: a Urology check-in link leaked an ENT trainee';
  end if;

  raise notice 'ok  2  a check-in link cannot enumerate another register';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. The roster gives a has-email flag, never an address
-- ----------------------------------------------------------------------------
begin;
set local role anon;

do $$
declare _r jsonb := public.register_public_roster('a5000000-0000-4000-8000-0000000000e1');
begin
  if _r::text like '%@example.invalid%' then
    raise exception 'FAIL 3: the roster returned an email address';
  end if;

  if not (_r->'trainees'->0->>'has_email')::boolean then
    raise exception 'FAIL 3: the trainee with an address is not flagged';
  end if;
  if (_r->'trainees'->1->>'has_email')::boolean then
    raise exception 'FAIL 3: the trainee without an address is flagged';
  end if;

  raise notice 'ok  3  roster exposes a flag, not an address';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. An unknown session id yields nothing rather than everything
-- ----------------------------------------------------------------------------
begin;
set local role anon;

do $$
begin
  if public.register_public_roster('00000000-0000-4000-8000-000000000000') is not null then
    raise exception 'FAIL 4: an unknown session returned a roster';
  end if;
  if exists (select 1 from public.register_public_session('00000000-0000-4000-8000-000000000000')) then
    raise exception 'FAIL 4: an unknown session returned a row';
  end if;
  raise notice 'ok  4  an unknown session id returns nothing';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 5. Anonymous callers cannot list the tables at all
-- ----------------------------------------------------------------------------
begin;
set local role anon;

do $$
declare _t text; _n bigint;
begin
  foreach _t in array array['register_sessions','register_attendees','register_feedback','register_forms']
  loop
    begin
      execute format('select count(*) from public.%I', _t) into _n;
    exception when insufficient_privilege then
      _n := 0;
    end;
    if _n <> 0 then
      raise exception 'FAIL 5: anon read % rows from %', _n, _t;
    end if;
  end loop;
  raise notice 'ok  5  anon lists no sessions, attendees, feedback or forms';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 6. Anonymous callers cannot reach the email resolver
-- ----------------------------------------------------------------------------
begin;
set local role anon;

do $$
begin
  begin
    perform public.register_resolve_trainee_email(
      'a5000000-0000-4000-8000-0000000000e1', 'ent1', null);
    raise exception 'FAIL 6: anon called the email resolver';
  exception when insufficient_privilege then
    raise notice 'ok  6  anon cannot resolve a stored email';
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.register_resolve_trainee_email(
      'a5000000-0000-4000-8000-0000000000e1', 'ent1', null);
    raise exception 'FAIL 6b: a signed-in member called the email resolver';
  exception when insufficient_privilege then
    raise notice 'ok  6b even a member cannot resolve a stored email from a browser';
  end;
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 7. Check-in writes the right key, derived rather than supplied
-- ----------------------------------------------------------------------------
begin;
set local role anon;
do $$ begin perform public.register_record_checkin(
  'a5000000-0000-4000-8000-0000000000e1', 'ent1', 'ST6'); end $$;
reset role;

do $$
declare _att jsonb;
begin
  select data->'attendance' into _att from public.register_stores
   where register_id = (select id from public.registers where slug = 'mersey-ent');

  if _att->'ent1|es1' is null then
    raise exception 'FAIL 7: the check-in did not land on the session''s own key';
  end if;
  if _att->'ent1|es1'->>'grade' <> 'ST6' then
    raise exception 'FAIL 7: the grade was not recorded';
  end if;
  raise notice 'ok  7  check-in writes the key derived from the session';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 8. A trainee from another register cannot be checked in
-- ----------------------------------------------------------------------------
begin;
set local role anon;
do $$
begin
  perform public.register_record_checkin('a5000000-0000-4000-8000-0000000000e1', 'uro1', 'ST6');
  perform public.register_record_checkin('a5000000-0000-4000-8000-0000000000e1', 'made-up', 'ST6');
end $$;
reset role;

do $$
declare _att jsonb;
begin
  select data->'attendance' into _att from public.register_stores
   where register_id = (select id from public.registers where slug = 'mersey-ent');

  if _att <> '{}'::jsonb then
    raise exception 'FAIL 8: a foreign or invented trainee was checked in: %', _att;
  end if;
  raise notice 'ok  8  only that register''s own roster can be checked in';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 9. A check-in does not bump the version and stampede the organisers' tabs
-- ----------------------------------------------------------------------------
begin;

do $$
declare
  _rid    uuid := (select id from public.registers where slug = 'mersey-ent');
  _before bigint;
  _after  bigint;
begin
  select version into _before from public.register_stores where register_id = _rid;

  -- As the trainee's browser would, through the anon door.
  set local role anon;
  perform public.register_record_checkin('a5000000-0000-4000-8000-0000000000e1', 'ent1', '');
  reset role;

  select version into _after from public.register_stores where register_id = _rid;

  if _after <> _before then
    raise exception 'FAIL 9: a trainee check-in moved the save version from % to %',
      _before, _after;
  end if;
  raise notice 'ok  9  a check-in leaves the organiser save version alone';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 10. Members read their own register's sessions; non-members read none
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';   -- owns mersey-ent only

do $$
begin
  if (select count(*) from public.register_sessions) <> 1 then
    raise exception 'FAIL 10: a member saw % sessions, expected only their own',
      (select count(*) from public.register_sessions);
  end if;
  if (select register_id from public.register_sessions)
     <> (select id from public.registers where slug = 'mersey-ent') then
    raise exception 'FAIL 10: a member saw the wrong register''s session';
  end if;
  raise notice 'ok 10  a member sees only their own register''s teaching days';
end $$;
commit;

begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000004';   -- belongs to nothing

do $$
begin
  if (select count(*) from public.register_sessions) <> 0 then
    raise exception 'FAIL 10b: a non-member read teaching days';
  end if;
  raise notice 'ok 10b a non-member reads no teaching days';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- 11. Nobody writes these tables from a browser
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local test.uid = '11111111-0000-4000-8000-000000000002';

do $$
begin
  begin
    insert into public.register_sessions (register_id, title, session_date)
    values ((select id from public.registers where slug = 'mersey-ent'), 'Sneaky', '2026-02-01');
    raise exception 'FAIL 11: an owner published a teaching day directly';
  exception when insufficient_privilege then
    raise notice 'ok 11  publishing goes through the edge function, not the table';
  end;
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 12. RLS enabled and forced on all four
-- ----------------------------------------------------------------------------
do $$
declare _t text;
begin
  foreach _t in array array['register_sessions','register_attendees','register_feedback','register_forms']
  loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = _t
         and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'FAIL 12: RLS not enabled and forced on %', _t;
    end if;
  end loop;
  raise notice 'ok 12  RLS enabled and forced on all four tables';
end $$;

\echo ''
\echo 'All live-session assertions passed.'
