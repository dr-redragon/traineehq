-- ============================================================================
-- A trainee signing in is a write like any other
--
-- THE BUG THIS FIXES. `register_record_checkin()` and `register_enrol_trainee()`
-- patch `register_stores.data` directly, and deliberately did not bump
-- `version` — the reasoning being that a trainee scanning a QR code is not an
-- organiser's edit, so it should not make an open organiser tab think somebody
-- had saved over them.
--
-- That reasoning is wrong here, and the consequence was that sign-ins
-- disappeared. `save_register()` is optimistic: it refuses a write whose
-- expected version has moved, and `useRegisterStore` answers a refusal by
-- re-reading and replaying the edit on top of whatever arrived in the meantime.
-- Leaving the version alone defeats exactly that. An organiser with the
-- register open holds a blob from before the sign-in; the sign-in lands in the
-- database at the same version; the organiser then ticks any cell, their save
-- is accepted because the version still matches, and the whole blob — the
-- sign-in included — is overwritten with what their tab had before it.
-- Silently, with no conflict raised and nothing to notice.
--
-- Bumping the version turns that into the conflict it always was, and the
-- client's existing replay does the rest: the tick is re-applied to a blob that
-- has the sign-in in it, and both survive.
-- ============================================================================

create or replace function public.register_record_checkin(
  _session_id uuid,
  _trainee_id text,
  _grade      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _register uuid;
  _local    text;
  _key      text;
begin
  if _trainee_id is null or btrim(_trainee_id) = '' then
    return;
  end if;

  select s.register_id, s.local_id into _register, _local
    from public.register_sessions s
   where s.id = _session_id;

  -- An unpublished teaching day has no blob key to write against.
  if _register is null or _local is null then
    return;
  end if;

  -- Only somebody already on that register's roster. Without this the function
  -- would happily invent an attendance key for any string a caller passed.
  if not exists (
    select 1
      from public.register_stores st,
           lateral jsonb_array_elements(st.data->'trainees') t
     where st.register_id = _register
       and t->>'id' = _trainee_id
  ) then
    return;
  end if;

  _key := _trainee_id || '|' || _local;

  update public.register_stores
     set data = jsonb_set(
                  jsonb_set(coalesce(data, '{}'::jsonb), '{attendance}',
                            coalesce(data->'attendance', '{}'::jsonb)),
                  array['attendance', _key],
                  jsonb_build_object('grade', coalesce(_grade, '')),
                  true),
         -- version + 1, so an organiser editing from a blob taken before this
         -- sign-in is refused and replays their edit on top of it. See the
         -- header of this migration.
         version    = version + 1,
         updated_at = now()
   where register_id = _register;
end;
$$;

-- ----------------------------------------------------------------------------
-- The same, for the two writes made when somebody signs in under a name the
-- roster does not hold: appending them to it, and backfilling an address.
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
           version    = version + 1,
           updated_at = now()
     where register_id = _register;

  elsif _email_in is not null and not _has_email then
    -- Known already, but with no address on file: take the one they typed.
    update public.register_stores
       set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                            to_jsonb(_email_in), true),
           version    = version + 1,
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
-- And for the address written back when a trainee types one on the sign-in form.
-- ----------------------------------------------------------------------------
create or replace function public.register_resolve_trainee_email(
  _session_id uuid,
  _trainee_id text,
  _email      text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _register  uuid;
  _existing  text;
  _index     integer;
  _new_email text := nullif(btrim(coalesce(_email, '')), '');
begin
  select s.register_id into _register
    from public.register_sessions s where s.id = _session_id;

  if _register is null or _trainee_id is null then
    return _new_email;
  end if;

  select i, t->>'email' into _index, _existing
    from public.register_stores st,
         lateral jsonb_array_elements(st.data->'trainees') with ordinality as arr(t, i)
   where st.register_id = _register
     and t->>'id' = _trainee_id
   limit 1;

  if _new_email is not null then
    if _index is not null then
      update public.register_stores
         set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                              to_jsonb(_new_email), true),
             version    = version + 1,
             updated_at = now()
       where register_id = _register;
    end if;
    return _new_email;
  end if;

  return _existing;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants, restated exactly as the migrations that created these functions left
-- them. `create or replace function` keeps the existing ACL, so none of this is
-- strictly needed — it is here so the end state is legible from this file, and
-- so a replay onto a fresh database lands in the same place.
--
-- register_record_checkin is the one door an anonymous trainee needs: it is
-- what a QR sign-in writes the attendance mark through. The other two are
-- service-role only, called by the Edge Function on the caller's behalf.
-- ----------------------------------------------------------------------------
revoke execute on function public.register_record_checkin(uuid, text, text)      from public, anon;
grant  execute on function public.register_record_checkin(uuid, text, text)      to anon, authenticated;

revoke all on function public.register_enrol_trainee(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.register_resolve_trainee_email(uuid, text, text)
  from public, anon, authenticated;
