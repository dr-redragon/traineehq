-- Assertions for 20260907140000_register_api_functions.sql.
--
-- These two functions are the write half of the anonymous teaching-day flow, and
-- both are service-role only: the edge function decides a caller is entitled to
-- reach them. Runs after the live-session fixture, which leaves 'mersey-ent'
-- with session …e1 and 'mersey-urology' with session …f1.

\set ON_ERROR_STOP on
\set ENT_SESSION 'a5000000-0000-4000-8000-0000000000e1'
\set URO_SESSION 'a5000000-0000-4000-8000-0000000000f1'

-- ----------------------------------------------------------------------------
-- 1. A new name joins the roster of the session's own register, and is marked
--    present for that day
-- ----------------------------------------------------------------------------
begin;

do $$
declare
  _r   jsonb := public.classic_register_enrol_trainee(
          'a5000000-0000-4000-8000-0000000000e1', 'Newly Arrived', 'new@example.invalid', 'ST5');
  _ent jsonb := (select data from public.classic_register_stores
                  where register_id = (select id from public.classic_registers where slug='mersey-ent'));
  _uro jsonb := (select data from public.classic_register_stores
                  where register_id = '9e000000-0000-4000-8000-00000000000b');
  _id  text  := _r->>'trainee_id';
begin
  if _id is null or not (_r->>'created')::boolean then
    raise exception 'FAIL 1: the trainee was not enrolled: %', _r;
  end if;

  if jsonb_array_length(_ent->'trainees') <> 3 then
    raise exception 'FAIL 1: ENT roster is % long, expected 3',
      jsonb_array_length(_ent->'trainees');
  end if;

  -- The register came from the session, so the other one must be untouched.
  if jsonb_array_length(_uro->'trainees') <> 1 then
    raise exception 'FAIL 1: enrolling on an ENT session changed the Urology roster';
  end if;

  if _ent->'attendance'->(_id || '|es1') is null then
    raise exception 'FAIL 1: the new trainee was not marked present for the day';
  end if;

  if (_ent->'attendance'->(_id || '|es1')->>'grade') <> 'ST5' then
    raise exception 'FAIL 1: the grade given at sign-in was not recorded';
  end if;

  raise notice 'ok  1  a new name joins the right register and is marked present';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 2. A name already on the roster attaches rather than duplicating
-- ----------------------------------------------------------------------------
begin;

do $$
declare
  _r    jsonb := public.classic_register_enrol_trainee(
           'a5000000-0000-4000-8000-0000000000e1', '  ent alpha  ', null, 'ST7');
  _ent  jsonb := (select data from public.classic_register_stores
                   where register_id = (select id from public.classic_registers where slug='mersey-ent'));
begin
  -- Matching is case- and whitespace-insensitive, because the name is typed.
  if (_r->>'created')::boolean then
    raise exception 'FAIL 2: a duplicate roster entry was created';
  end if;
  if _r->>'trainee_id' <> 'ent1' then
    raise exception 'FAIL 2: attached to % rather than the existing ent1', _r->>'trainee_id';
  end if;
  if jsonb_array_length(_ent->'trainees') <> 2 then
    raise exception 'FAIL 2: the roster grew to %', jsonb_array_length(_ent->'trainees');
  end if;
  raise notice 'ok  2  an existing name attaches instead of duplicating';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 3. An address is taken for a trainee who had none, and never overwrites one
-- ----------------------------------------------------------------------------
begin;

do $$
declare _ent jsonb;
begin
  -- ent2 has no address on file.
  perform public.classic_register_enrol_trainee(
    'a5000000-0000-4000-8000-0000000000e1', 'Ent Beta', 'beta@example.invalid', '');
  select data into _ent from public.classic_register_stores
   where register_id = (select id from public.classic_registers where slug='mersey-ent');

  if (select t->>'email' from jsonb_array_elements(_ent->'trainees') t where t->>'id' = 'ent2')
     <> 'beta@example.invalid' then
    raise exception 'FAIL 3: the typed address was not taken for a trainee who had none';
  end if;

  -- ent1 already has one; a different typed address must not replace it.
  perform public.classic_register_enrol_trainee(
    'a5000000-0000-4000-8000-0000000000e1', 'Ent Alpha', 'someone.else@example.invalid', '');
  select data into _ent from public.classic_register_stores
   where register_id = (select id from public.classic_registers where slug='mersey-ent');

  if (select t->>'email' from jsonb_array_elements(_ent->'trainees') t where t->>'id' = 'ent1')
     <> 'ent1@example.invalid' then
    raise exception 'FAIL 3: an address already on file was overwritten at sign-in';
  end if;

  raise notice 'ok  3  an address is filled in, never replaced';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 4. An empty name enrols nobody
-- ----------------------------------------------------------------------------
begin;
do $$
declare _r jsonb := public.classic_register_enrol_trainee(
  'a5000000-0000-4000-8000-0000000000e1', '   ', null, null);
begin
  if _r->>'trainee_id' is not null then
    raise exception 'FAIL 4: an empty name was enrolled';
  end if;
  raise notice 'ok  4  an empty name enrols nobody';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 5. Feedback records, flips the gate, and stores no identifier
-- ----------------------------------------------------------------------------
begin;

insert into public.classic_register_attendees (id, session_id, name, email, checked_in_at)
values ('b7000000-0000-4000-8000-0000000000a1',
        'a5000000-0000-4000-8000-0000000000e1',
        'Ent Alpha', 'ent1@example.invalid', now());

do $$
declare _r record;
begin
  select * into _r from public.classic_register_record_feedback(
    'a5000000-0000-4000-8000-0000000000e1', 'ent1@example.invalid', 5,
    '{"content":4}'::jsonb, 'Very good');

  if _r.status <> 'recorded' then
    raise exception 'FAIL 5: expected recorded, got %', _r.status;
  end if;

  if not (select feedback_completed from public.classic_register_attendees
           where id = 'b7000000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL 5: the feedback gate was not closed';
  end if;

  -- The anonymity rule: nothing identifying may reach this table.
  if exists (
    select 1 from public.classic_register_feedback f
     where f.session_id = 'a5000000-0000-4000-8000-0000000000e1'
       and (f.answers::text ilike '%ent1%' or coalesce(f.comments,'') ilike '%ent1%')
  ) then
    raise exception 'FAIL 5: an identifier reached the feedback table';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='classic_register_feedback'
         and column_name in ('attendee_id','name','email','user_id')) <> 0 then
    raise exception 'FAIL 5: classic_register_feedback has a column identifying a person';
  end if;

  raise notice 'ok  5  feedback records, closes the gate, and names nobody';
end $$;

-- ----------------------------------------------------------------------------
-- 6. A second submission is refused rather than counted twice
-- ----------------------------------------------------------------------------
do $$
declare _r record;
begin
  select * into _r from public.classic_register_record_feedback(
    'a5000000-0000-4000-8000-0000000000e1', 'ent1@example.invalid', 1,
    '{}'::jsonb, 'Changed my mind');

  if _r.status <> 'already_submitted' then
    raise exception 'FAIL 6: a second response was accepted (%)', _r.status;
  end if;
  if (select count(*) from public.classic_register_feedback
       where session_id = 'a5000000-0000-4000-8000-0000000000e1') <> 1 then
    raise exception 'FAIL 6: a second response was written';
  end if;
  raise notice 'ok  6  a second submission is refused';
end $$;

-- ----------------------------------------------------------------------------
-- 7. Feedback from somebody with no attendee row is still kept
-- ----------------------------------------------------------------------------
do $$
declare _r record;
begin
  select * into _r from public.classic_register_record_feedback(
    'a5000000-0000-4000-8000-0000000000e1', 'nobody@example.invalid', 3, '{}'::jsonb, null);

  if _r.status <> 'recorded_unmatched' then
    raise exception 'FAIL 7: expected recorded_unmatched, got %', _r.status;
  end if;
  if (select count(*) from public.classic_register_feedback
       where session_id = 'a5000000-0000-4000-8000-0000000000e1') <> 2 then
    raise exception 'FAIL 7: unmatched feedback was discarded';
  end if;
  raise notice 'ok  7  unmatched feedback is kept, with nobody to certify';
end $$;

-- ----------------------------------------------------------------------------
-- 8. An unknown session is refused
-- ----------------------------------------------------------------------------
do $$
declare _r record;
begin
  select * into _r from public.classic_register_record_feedback(
    '00000000-0000-4000-8000-000000000000', 'x', 3, '{}'::jsonb, null);
  if _r.status <> 'unknown_session' then
    raise exception 'FAIL 8: expected unknown_session, got %', _r.status;
  end if;
  raise notice 'ok  8  an unknown session is refused';
end $$;
rollback;

-- ----------------------------------------------------------------------------
-- 9. Neither function is reachable from a browser, on either role
-- ----------------------------------------------------------------------------
do $$
declare _role text; _fn text;
begin
  foreach _role in array array['anon','authenticated']
  loop
    foreach _fn in array array[
      'classic_register_enrol_trainee(uuid, text, text, text)',
      'classic_register_record_feedback(uuid, text, integer, jsonb, text)'
    ]
    loop
      if has_function_privilege(_role, 'public.' || _fn, 'EXECUTE') then
        raise exception 'FAIL 9: % can execute %', _role, _fn;
      end if;
    end loop;
  end loop;
  raise notice 'ok  9  neither function is reachable from a browser';
end $$;

\echo ''
\echo 'All register-api function assertions passed.'
