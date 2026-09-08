-- ============================================================================
-- Stage 7: the live teaching day — check-in, feedback and certificates,
-- register-scoped.
--
-- The standalone register keeps four tables for the day itself: `sessions`,
-- `attendees`, `feedback_responses` and `form_templates`. None of them exist in
-- this project, so rather than adding `register_id` and backfilling, they are
-- created here scoped from the outset — `not null` from the first row.
--
-- THE SECURITY PROBLEM THIS SOLVES
--
-- In the standalone register `public_roster()` takes no arguments: there is one
-- register, so it returns it. Multi-tenant, an unscoped roster hands every
-- deanery's trainee list to anybody who scans any QR code.
--
-- Every anonymous door here is therefore keyed on the SESSION, and the register
-- is derived from it server-side. A visitor holds a session link and nothing
-- else; they cannot name a register, and passing somebody else's session id
-- gets them that session's register, which is exactly what a link is for.
--
-- `record_live_checkin` goes further than the original, which trusted the
-- browser for the blob's session key and so let any caller write attendance
-- against any teaching day. That key is now read from the session row.
--
-- Anonymous callers also lose the ability to LIST sessions. The original grants
-- anon `select` on `sessions` with `using (true)`, which was survivable with one
-- register and is not with many — it would expose every deanery's teaching
-- schedule. There is no anon grant on the table at all; one function returns one
-- session by id, so a link opens a door rather than a filing cabinet.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Superseded tables
--
-- teaching_sessions and attendance_records came from an abandoned sketch of this
-- feature in the baseline schema. Both are empty, nothing reads them, and
-- leaving two tables that look like they do this job is a trap for whoever comes
-- next. Flagged as dead weight in docs/REGISTER-INTEGRATION-PLAN.md; resolved.
-- ----------------------------------------------------------------------------
drop table if exists public.attendance_records;
drop table if exists public.teaching_sessions;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- A teaching day that has been published for check-in. `local_id` is the id of
-- the matching session inside the register blob, which is what ties a QR code
-- back to the attendance grid.
create table if not exists public.register_sessions (
  id           uuid primary key default gen_random_uuid(),
  register_id  uuid not null references public.registers(id) on delete cascade,
  title        text not null,
  session_date date not null,
  location     text,
  local_id     text,
  -- The feedback form for this day. Null falls back to the register's template.
  form         jsonb,
  created_at   timestamptz not null default now(),
  unique (register_id, local_id)
);

create index if not exists register_sessions_register_idx
  on public.register_sessions (register_id, session_date desc);

create table if not exists public.register_attendees (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.register_sessions(id) on delete cascade,
  name                text not null,
  email               text not null,
  grade               text,
  checked_in_at       timestamptz,
  feedback_completed  boolean not null default false,
  certificate_sent_at timestamptz,
  created_at          timestamptz not null default now(),
  unique (session_id, email)
);

create index if not exists register_attendees_session_idx
  on public.register_attendees (session_id);

-- ANONYMITY RULE, carried over unchanged: this table holds no identifier and no
-- foreign key to an attendee beyond the session they both belong to. The only
-- bridge is register_attendees.feedback_completed, a boolean flipped by the same
-- transaction that inserts the response. Do not add a person to this table.
create table if not exists public.register_feedback (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.register_sessions(id) on delete cascade,
  overall_rating integer check (overall_rating between 1 and 5),
  answers        jsonb not null default '{}'::jsonb,
  comments       text,
  submitted_at   timestamptz not null default now()
);

create index if not exists register_feedback_session_idx
  on public.register_feedback (session_id);

-- One shared feedback template per register, inherited by new teaching days.
-- Single-tenant this was `form_templates` keyed on the text 'default'.
create table if not exists public.register_forms (
  register_id uuid primary key references public.registers(id) on delete cascade,
  form        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- THE ANONYMOUS DOORS
--
-- Three functions, each taking a session id and nothing else. A trainee has a
-- link; that link is the whole of their authority, and it reaches exactly one
-- register's teaching day.
-- ============================================================================

-- One session, by id. Replaces the anon `select` grant the original gave on the
-- table: the columns are the same ones checkin/feedback/session pages read, but
-- a caller can no longer list what they were not sent.
create or replace function public.register_public_session(_session_id uuid)
returns table (
  id           uuid,
  title        text,
  session_date date,
  location     text,
  local_id     text,
  form         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.session_date, s.location, s.local_id,
         coalesce(s.form, f.form)
    from public.register_sessions s
    left join public.register_forms f on f.register_id = s.register_id
   where s.id = _session_id;
$$;

-- The name list behind the sign-in dropdown, for the register this session
-- belongs to. Names and a has-email flag only: never an address, and never
-- attendance, excusals or long-term status.
--
-- The register is derived from the session. There is deliberately no variant
-- that takes a register id — that is the whole difference between this and the
-- single-tenant original.
create or replace function public.register_public_roster(_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trainees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        t->>'id',
               'name',      t->>'name',
               'has_email', nullif(btrim(coalesce(t->>'email', '')), '') is not null
             ) order by t->>'name')
        from jsonb_array_elements(st.data->'trainees') t
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sn->>'id', 'month', sn->>'month', 'title', sn->>'title'))
        from jsonb_array_elements(st.data->'sessions') sn
    ), '[]'::jsonb)
  )
  from public.register_sessions s
  join public.register_stores  st on st.register_id = s.register_id
 where s.id = _session_id;
$$;

-- Mirror a check-in into the register's own attendance map.
--
-- Both the register and the blob's session key are read from the session row.
-- The original took that key from the browser, so a caller could write a mark
-- against any teaching day in the register; here they can only write against the
-- one their link names.
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
         -- Not version + 1: this is a trainee signing in, not an organiser's
         -- edit, and bumping the version would make every open organiser tab
         -- think somebody had saved over them.
         updated_at = now()
   where register_id = _register;
end;
$$;

-- Read or store a trainee's contact address, for the certificate.
--
-- Service role only — the Edge Function calls it and puts the address on the
-- attendee row. It is never granted to anon or authenticated, so no browser can
-- read an address through it.
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
             updated_at = now()
       where register_id = _register;
    end if;
    return _new_email;
  end if;

  return _existing;
end;
$$;

-- ============================================================================
-- FUNCTION GRANTS
-- ============================================================================
revoke execute on function public.register_public_session(uuid)                  from public, anon;
revoke execute on function public.register_public_roster(uuid)                   from public, anon;
revoke execute on function public.register_record_checkin(uuid, text, text)      from public, anon;
revoke execute on function public.register_resolve_trainee_email(uuid, text, text)
  from public, anon, authenticated;

-- The three doors a trainee with a link needs, and nothing else.
grant execute on function public.register_public_session(uuid)             to anon, authenticated;
grant execute on function public.register_public_roster(uuid)              to anon, authenticated;
grant execute on function public.register_record_checkin(uuid, text, text) to anon, authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'register_sessions','register_attendees','register_feedback','register_forms'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Members see their own register's teaching days, attendees and feedback.
-- Everything anonymous goes through the functions above, so there is no anon
-- policy on any of these tables.
drop policy if exists "members read their sessions" on public.register_sessions;
create policy "members read their sessions"
  on public.register_sessions for select to authenticated
  using (public.is_register_member(auth.uid(), register_id));

drop policy if exists "members read their attendees" on public.register_attendees;
create policy "members read their attendees"
  on public.register_attendees for select to authenticated
  using (exists (
    select 1 from public.register_sessions s
     where s.id = session_id and public.is_register_member(auth.uid(), s.register_id)
  ));

-- Feedback is readable in aggregate by the register's members; it carries no
-- identifier, so a member reading it learns what was said and not by whom.
drop policy if exists "members read their feedback" on public.register_feedback;
create policy "members read their feedback"
  on public.register_feedback for select to authenticated
  using (exists (
    select 1 from public.register_sessions s
     where s.id = session_id and public.is_register_member(auth.uid(), s.register_id)
  ));

drop policy if exists "members read their form template" on public.register_forms;
create policy "members read their form template"
  on public.register_forms for select to authenticated
  using (public.is_register_member(auth.uid(), register_id));

-- No insert, update or delete policy anywhere in this file, for either role.
-- Publishing a day, recording an attendee, submitting feedback and editing a
-- form all run through the Edge Function under the service role, which checks
-- membership itself — the same shape as the standalone register's register-api.

-- ============================================================================
-- TABLE GRANTS
--
-- Read-only for signed-in members; anon gets nothing at all. The baseline's
-- blanket grant ran long before these tables existed.
-- ============================================================================
grant select on public.register_sessions  to authenticated;
grant select on public.register_attendees to authenticated;
grant select on public.register_feedback  to authenticated;
grant select on public.register_forms     to authenticated;

commit;
