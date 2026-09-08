-- ============================================================================
-- The two database operations the register-api edge function cannot do safely
-- from outside a transaction.
--
-- Both are service-role only. They are the write half of the anonymous
-- teaching-day flow, and the edge function is what decides a caller is entitled
-- to reach them; granting either to a browser would hand it the ability to
-- append to a register's roster, or to record feedback against somebody else.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Joining the roster at sign-in
--
-- Somebody signing in as "my name is not on the list" used to exist only as an
-- attendee row: the register reported them as unmatched and then forgot them, so
-- they were missing from the grid and had to be re-added by hand before the next
-- teaching day. They now join the roster as they sign in.
--
-- The register comes from the session, never from the caller.
-- ----------------------------------------------------------------------------
create or replace function public.register_enrol_trainee(
  _session_id uuid,
  _name       text,
  _email      text,
  _grade      text
)
returns jsonb                -- {"trainee_id": text|null, "created": boolean}
language plpgsql
security definer
set search_path = public
as $$
declare
  _register   uuid;
  _local      text;
  _name_in    text := btrim(coalesce(_name, ''));
  _email_in   text := nullif(btrim(lower(coalesce(_email, ''))), '');
  _grade_in   text := btrim(coalesce(_grade, ''));
  _trainee_id text;
  _index      integer;
  _has_email  boolean;
  _created    boolean := false;
begin
  if _name_in = '' then
    return jsonb_build_object('trainee_id', null, 'created', false);
  end if;

  select s.register_id, s.local_id into _register, _local
    from public.register_sessions s where s.id = _session_id;

  if _register is null then
    return jsonb_build_object('trainee_id', null, 'created', false);
  end if;

  -- Two people signing in at the same moment both read-modify-write this one
  -- row; without the lock the second append silently overwrites the first.
  perform 1 from public.register_stores where register_id = _register for update;
  if not found then
    return jsonb_build_object('trainee_id', null, 'created', false);
  end if;

  -- A name already on the roster — a misread list, a second sign-in from another
  -- device — attaches to that record rather than creating a duplicate.
  select t->>'id', i, nullif(btrim(coalesce(t->>'email', '')), '') is not null
    into _trainee_id, _index, _has_email
    from public.register_stores,
         lateral jsonb_array_elements(data->'trainees') with ordinality as arr(t, i)
   where register_id = _register
     and lower(btrim(t->>'name')) = lower(_name_in)
   limit 1;

  if _trainee_id is null then
    _created := true;
    -- The same shape of id the browser generates (7 base-36 characters), so
    -- nothing downstream can tell a self-registered trainee from a typed one.
    _trainee_id := substr(md5(random()::text || clock_timestamp()::text), 1, 7);

    update public.register_stores
       set data = jsonb_set(
                    coalesce(data, '{}'::jsonb), '{trainees}',
                    coalesce(data->'trainees', '[]'::jsonb) || jsonb_build_array(
                      jsonb_build_object(
                        'id', _trainee_id,
                        'name', _name_in,
                        'email', coalesce(_email_in, ''),
                        'grade', _grade_in,
                        -- Empty, exactly as a trainee added by hand is. The next
                        -- organiser load dates the grade from the attendance
                        -- written below, so a later sign-in supersedes it on the
                        -- same rule as everybody else's.
                        'gradeFrom', ''
                      )),
                    true),
           updated_at = now()
     where register_id = _register;

  elsif _email_in is not null and not _has_email then
    -- Known already, but with no address on file: take the one they typed.
    update public.register_stores
       set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                            to_jsonb(_email_in), true),
           updated_at = now()
     where register_id = _register;
  end if;

  -- Mark them present. An unpublished day has no blob key; the roster entry
  -- still stands, there is simply no cell for it yet.
  if _local is not null then
    perform public.register_record_checkin(_session_id, _trainee_id, _grade_in);
  end if;

  return jsonb_build_object('trainee_id', _trainee_id, 'created', _created);
end;
$$;

-- ----------------------------------------------------------------------------
-- Recording feedback
--
-- ANONYMITY. The identifier is passed in solely to flip the attendee's
-- feedback_completed gate, which is what a certificate is issued against. It is
-- never written to register_feedback, and the insert and the flip happen in one
-- transaction so a response cannot be recorded without closing the gate, nor the
-- gate closed without a response.
-- ----------------------------------------------------------------------------
create or replace function public.register_record_feedback(
  _session_id uuid,
  _identifier text,
  _overall    integer,
  _answers    jsonb,
  _comments   text
)
returns table (
  status              text,
  attendee_id         uuid,
  attendee_name       text,
  attendee_email      text,
  checked_in          boolean,
  certificate_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  a     public.register_attendees%rowtype;
  ident text := nullif(btrim(coalesce(_identifier, '')), '');
begin
  if not exists (select 1 from public.register_sessions s where s.id = _session_id) then
    return query select 'unknown_session'::text, null::uuid, null::text, null::text,
                        false, null::timestamptz;
    return;
  end if;

  if ident is not null then
    select * into a
      from public.register_attendees att
     where att.session_id = _session_id
       and (att.id::text = ident or lower(att.email) = lower(ident))
     limit 1
       for update;
  end if;

  -- Already gave feedback for this day: do not record a second response.
  if a.id is not null and a.feedback_completed then
    return query select 'already_submitted'::text, a.id, a.name, a.email,
                        (a.checked_in_at is not null), a.certificate_sent_at;
    return;
  end if;

  insert into public.register_feedback (session_id, overall_rating, answers, comments)
  values (_session_id, _overall, coalesce(_answers, '{}'::jsonb),
          nullif(btrim(coalesce(_comments, '')), ''));

  if a.id is null then
    -- The feedback still counts; there is simply nobody to gate a certificate for.
    return query select 'recorded_unmatched'::text, null::uuid, null::text, null::text,
                        false, null::timestamptz;
    return;
  end if;

  update public.register_attendees set feedback_completed = true where id = a.id;

  return query select 'recorded'::text, a.id, a.name, a.email,
                      (a.checked_in_at is not null), a.certificate_sent_at;
end;
$$;

revoke all on function public.register_enrol_trainee(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.register_record_feedback(uuid, text, integer, jsonb, text)
  from public, anon, authenticated;

commit;
