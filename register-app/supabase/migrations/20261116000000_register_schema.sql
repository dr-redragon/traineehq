-- ============================================================================
-- The Register — complete schema
--
-- One migration for a fresh, dedicated Supabase project. It creates:
--
--   accounts        profiles (filled from the Google / Apple / NHS sign-in),
--                   subscriptions (written only by the Stripe webhook)
--   registers       a register, its members (owner / editor / viewer), its
--                   data, its history
--   invitations     collaborators are invited by email and accept by signing in
--   teaching days   published sessions, attendees, feedback, form templates
--
-- THE PLAN RULE, enforced here and nowhere else that matters:
--
--   event register     free. One event — every day in it falls inside a
--                      window of register_event_max_days() days.
--   regular register   needs a subscription. It is "entitled" while at least
--                      one of its OWNERS holds an active subscription;
--                      collaborators never need one. An unentitled regular
--                      register is read-only: nothing is deleted, nothing can
--                      be written until an owner subscribes again.
--
-- The browser shows the same rule, but only as a courtesy. create_register(),
-- save_register() and the edge functions are what actually refuse.
--
-- Access is per register and explicit. There is no directory of other
-- people's registers and no administrator who can read them: you see a
-- register because you made it or accepted an invitation to it.
--
-- Every table has row-level security enabled AND forced, and the grants at the
-- foot of this file start from nothing: a fresh Supabase project hands anon and
-- authenticated every privilege on new public tables by default.
-- ============================================================================

begin;

-- ------------------------------------------------------------------ types --
do $$ begin
  -- owner   everything, including who else has access
  -- editor  read and write: attendance, days, people, check-in, certificates
  -- viewer  read only
  create type public.register_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.register_kind as enum ('regular', 'event');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- helpers --
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- accounts --
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  first_name text,
  last_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per person who has ever started a checkout. Written only by the
-- Stripe webhook and the billing functions (service role). `status` is Stripe's
-- own subscription status, plus 'comp' for an account given the plan by hand:
--
--   insert into public.subscriptions (user_id, status) values ('<uuid>', 'comp')
--   on conflict (user_id) do update set status = 'comp';
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'none',
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  action     text not null,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_user_idx on public.audit_log (user_id, created_at desc);

-- -------------------------------------------------------------- registers --
create table if not exists public.registers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(btrim(name)) between 2 and 80),
  -- Who runs it: a trust, a deanery, a society. Printed above the register's
  -- name on certificates. Optional.
  organisation          text check (organisation is null or char_length(organisation) <= 80),
  kind                  public.register_kind not null default 'event',
  slug                  text not null unique,
  is_active             boolean not null default true,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Object path in the register-logos bucket, or null for no badge.
  certificate_logo_path text,
  -- Which certificate template the register uses and the wording and colour
  -- an owner has changed on it. Read by the browser, which draws the PDF and
  -- sanitises every field as it does so; capped here so it cannot be used to
  -- store anything sizeable.
  certificate_design    jsonb not null default '{}'::jsonb
    check (jsonb_typeof(certificate_design) = 'object'
           and pg_column_size(certificate_design) <= 4096),
  -- Null means live. register_archive_days() after this it is destroyed.
  archived_at           timestamptz,
  archived_by           uuid references auth.users(id) on delete set null
);
create index if not exists registers_created_by_idx on public.registers (created_by);
create index if not exists registers_archived_idx on public.registers (archived_at)
  where archived_at is not null;

create table if not exists public.register_members (
  register_id uuid not null references public.registers(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.register_role not null default 'editor',
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (register_id, user_id)
);
create index if not exists register_members_user_idx on public.register_members (user_id);

-- A pending invitation. The token is the secret in the emailed link; the email
-- is who it was meant for. Either is enough to accept: the link for somebody
-- whose sign-in address differs from the one invited (Apple's private relay,
-- an NHS address invited but a Google account used), the address for somebody
-- who simply signs in without ever opening the email.
create table if not exists public.register_invites (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers(id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email like '%_@_%._%'),
  role        public.register_role not null default 'editor',
  token       text not null unique,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);
create unique index if not exists register_invites_one_open
  on public.register_invites (register_id, email) where accepted_at is null;
create index if not exists register_invites_email_idx
  on public.register_invites (email) where accepted_at is null;

-- The register itself: one JSONB document per register, with a version that
-- serialises organiser saves (see save_register).
create table if not exists public.register_stores (
  register_id uuid primary key references public.registers(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.register_store_history (
  id          bigint generated always as identity primary key,
  register_id uuid not null references public.registers(id) on delete cascade,
  version     bigint not null,
  data        jsonb not null,
  saved_by    uuid references auth.users(id) on delete set null,
  saved_at    timestamptz,
  replaced_by uuid references auth.users(id) on delete set null,
  replaced_at timestamptz not null default now(),
  unique (register_id, version)
);
create index if not exists register_store_history_register_idx
  on public.register_store_history (register_id, version desc);

-- ---------------------------------------------------------- teaching days --
-- A day published for check-in. `local_id` is the id of the matching session
-- inside the register's JSONB document.
create table if not exists public.register_sessions (
  id           uuid primary key default gen_random_uuid(),
  register_id  uuid not null references public.registers(id) on delete cascade,
  title        text not null,
  session_date date not null,
  location     text,
  local_id     text,
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
create index if not exists register_attendees_session_idx on public.register_attendees (session_id);

-- Deliberately carries no attendee id: feedback is anonymous.
create table if not exists public.register_feedback (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.register_sessions(id) on delete cascade,
  overall_rating integer check (overall_rating between 1 and 5),
  answers        jsonb not null default '{}'::jsonb,
  comments       text,
  submitted_at   timestamptz not null default now()
);
create index if not exists register_feedback_session_idx on public.register_feedback (session_id);

create table if not exists public.register_forms (
  register_id uuid primary key references public.registers(id) on delete cascade,
  form        jsonb not null,
  updated_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subscriptions', 'registers'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.update_updated_at_column()', t);
  end loop;
end $$;

-- ------------------------------------------------------ new-user bootstrap --
-- Every sign-in provider names people differently: Google sends given_name and
-- family_name, Microsoft (the NHS route) sends full_name, Apple sends a name
-- only on the very first sign-in and often not at all.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  _full text  := btrim(coalesce(_meta->>'full_name', _meta->>'name', ''));
  _first text := nullif(btrim(coalesce(_meta->>'given_name', _meta->>'first_name',
                                       split_part(_full, ' ', 1))), '');
  _last text  := nullif(btrim(coalesce(_meta->>'family_name', _meta->>'last_name',
                                       nullif(substr(_full, length(split_part(_full, ' ', 1)) + 2), ''))), '');
begin
  insert into public.profiles (user_id, email, first_name, last_name)
  values (new.id, lower(new.email), _first, _last)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ plan rules --
create or replace function public.has_active_subscription(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- past_due is Stripe still retrying the card: the register stays writable
  -- through that, and Stripe moves the status on if the retries run out.
  select exists (
    select 1 from public.subscriptions
     where user_id = _user_id
       and status in ('active', 'trialing', 'past_due', 'comp')
  );
$$;

-- How long one "event" may run. A conference or course, not a programme.
create or replace function public.register_event_max_days()
returns integer language sql immutable set search_path = public as $$ select 7 $$;

create or replace function public.register_archive_days()
returns integer language sql immutable set search_path = public as $$ select 15 $$;

-- ------------------------------------------- carried over from TraineeHQ --
-- Membership tests, archiving, history, and the check-in and feedback
-- writers: unchanged from the register this app was split out of.
create or replace function public.is_register_member(_user_id uuid, _register_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.register_members
    where user_id = _user_id and register_id = _register_id
  );
$$;

create or replace function public.is_register_owner(_user_id uuid, _register_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.register_members
    where user_id = _user_id and register_id = _register_id and role = 'owner'
  );
$$;

create or replace function public.register_blob_counts(_data jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'trainees',   case when jsonb_typeof(_data -> 'trainees') = 'array'
                       then jsonb_array_length(_data -> 'trainees') else 0 end,
    'sessions',   case when jsonb_typeof(_data -> 'sessions') = 'array'
                       then jsonb_array_length(_data -> 'sessions') else 0 end,
    'attendance', case when jsonb_typeof(_data -> 'attendance') = 'object'
                       then (select count(*) from jsonb_object_keys(_data -> 'attendance')) else 0 end
  );
$$;

create or replace function public.purge_expired_registers() returns integer
language plpgsql security definer set search_path = public as $$
declare
  _gone integer;
begin
  delete from public.registers
   where archived_at is not null
     and archived_at < now() - make_interval(days => public.register_archive_days());
  get diagnostics _gone = row_count;
  return _gone;
end;
$$;

create or replace function public.archive_register(_register_id uuid) returns timestamp with time zone
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _when   timestamptz;
begin
  if _caller is null then
    raise exception 'You must be signed in to archive a register';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can archive this register';
  end if;

  -- `is_active` goes with it: every existing read path filters on that column
  -- and none of them has been taught about `archived_at`.
  update public.registers
     set archived_at = now(), archived_by = _caller, is_active = false
   where id = _register_id
     and archived_at is null
  returning archived_at into _when;

  if _when is null then
    raise exception 'That register is already in the archive';
  end if;

  return _when + make_interval(days => public.register_archive_days());
end;
$$;

create or replace function public.restore_register(_register_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _rows   integer;
begin
  if _caller is null then
    raise exception 'You must be signed in to restore a register';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can restore this register';
  end if;

  update public.registers
     set archived_at = null, archived_by = null, is_active = true
   where id = _register_id
     and archived_at is not null
     and archived_at >= now() - make_interval(days => public.register_archive_days());
  get diagnostics _rows = row_count;

  if _rows = 0 then
    raise exception 'That register is not in the archive, or its % days are already up',
      public.register_archive_days();
  end if;
end;
$$;

create or replace function public.remove_register_member(_register_id uuid, _user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  _caller       uuid := auth.uid();
  _target_role  public.register_role;
  _owner_count  integer;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  select role into _target_role
    from public.register_members
   where register_id = _register_id and user_id = _user_id;

  if _target_role is null then
    raise exception 'That person is not a member of this register';
  end if;

  -- An owner may remove anyone; anyone may remove themselves.
  if not (public.is_register_owner(_caller, _register_id) or _caller = _user_id) then
    raise exception 'Only an owner can remove another member';
  end if;

  if _target_role = 'owner' then
    select count(*) into _owner_count
      from public.register_members
     where register_id = _register_id and role = 'owner';

    if _owner_count <= 1 then
      raise exception 'This is the register''s only owner'
        using hint = 'Make somebody else an owner first, then remove this one.';
    end if;
  end if;

  delete from public.register_members
   where register_id = _register_id and user_id = _user_id;
end;
$$;

create or replace function public.set_register_member_role(_register_id uuid, _user_id uuid, _role public.register_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  _caller      uuid := auth.uid();
  _current     public.register_role;
  _owner_count integer;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can change what someone can do in this register';
  end if;

  select role into _current
    from public.register_members
   where register_id = _register_id and user_id = _user_id;

  if _current is null then
    raise exception 'That person is not a member of this register';
  end if;

  if _current = _role then
    return;
  end if;

  -- The mirror of the rule in remove_register_member(): a register with no owner
  -- can never have its membership managed again, and no super_admin can quietly
  -- step in to fix it.
  if _current = 'owner' and _role <> 'owner' then
    select count(*) into _owner_count
      from public.register_members
     where register_id = _register_id and role = 'owner';

    if _owner_count <= 1 then
      raise exception 'This is the register''s only owner'
        using hint = 'Make somebody else an owner first.';
    end if;
  end if;

  update public.register_members
     set role = _role
   where register_id = _register_id and user_id = _user_id;
end;
$$;

create or replace function public.register_history(_register_id uuid) returns TABLE(version bigint, saved_at timestamp with time zone, saved_by uuid, replaced_at timestamp with time zone, replaced_by uuid, counts jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_register_owner(auth.uid(), _register_id) then
    raise exception 'Only an owner of this register can see its history';
  end if;
  return query
    select h.version, h.saved_at, h.saved_by, h.replaced_at, h.replaced_by,
           public.register_blob_counts(h.data)
      from public.register_store_history h
     where h.register_id = _register_id
     order by h.version desc;
end;
$$;

create or replace function public.register_store_snapshot() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _before jsonb;
  _after  jsonb;
begin
  -- A check-in rewrites the blob without bumping the version; only organiser
  -- saves are versions worth keeping.
  if NEW.version is not distinct from OLD.version then
    return NEW;
  end if;

  insert into public.register_store_history
    (register_id, version, data, saved_by, saved_at, replaced_by)
  values
    (OLD.register_id, OLD.version, coalesce(OLD.data, '{}'::jsonb),
     OLD.updated_by, OLD.updated_at, auth.uid())
  on conflict (register_id, version) do nothing;

  _before := public.register_blob_counts(OLD.data);
  _after  := public.register_blob_counts(NEW.data);
  if (_after->>'trainees')::int   < (_before->>'trainees')::int
     or (_after->>'sessions')::int   < (_before->>'sessions')::int
     or (_after->>'attendance')::int < (_before->>'attendance')::int then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.records_removed', jsonb_build_object(
      'register_id', NEW.register_id, 'from_version', OLD.version,
      'to_version', NEW.version, 'before', _before, 'after', _after));
  end if;

  return NEW;
end;
$$;

create or replace function public.audit_register_lifecycle() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP <> 'UPDATE' then   -- the row is being removed
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.deleted', jsonb_build_object(
      'register_id', OLD.id, 'name', OLD.name, 'archived_at', OLD.archived_at));
    return OLD;
  end if;

  if OLD.archived_at is null and NEW.archived_at is not null then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.archived', jsonb_build_object('register_id', NEW.id));
  elsif OLD.archived_at is not null and NEW.archived_at is null then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.restored', jsonb_build_object('register_id', NEW.id));
  end if;
  return NEW;
end;
$$;

create or replace function public.register_public_session(_session_id uuid) returns TABLE(id uuid, title text, session_date date, location text, local_id text, form jsonb)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.session_date, s.location, s.local_id,
         coalesce(s.form, f.form)
    from public.register_sessions s
    left join public.register_forms f on f.register_id = s.register_id
   where s.id = _session_id;
$$;

create or replace function public.register_public_roster(_session_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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
    ), '[]'::jsonb),
    -- The register's own list of grades or roles for the sign-in form, if its
    -- organisers have set one. Null means the form's defaults.
    'grades', case when jsonb_typeof(st.data->'settings'->'grades') = 'array'
                   then st.data->'settings'->'grades' end
  )
  from public.register_sessions s
  join public.register_stores  st on st.register_id = s.register_id
 where s.id = _session_id;
$$;

create or replace function public.register_record_checkin(_session_id uuid, _trainee_id text, _grade text) returns void
language plpgsql security definer set search_path = public as $$
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

create or replace function public.register_enrol_trainee(_session_id uuid, _name text, _email text, _grade text) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    -- Adding oneself is open to anybody holding the day's link, so it has a
    -- ceiling: without one a script could grow the roster without limit. Far
    -- above any real event; an organiser can still add people by hand.
    if (select jsonb_array_length(coalesce(data->'trainees', '[]'::jsonb))
          from public.register_stores where register_id = _register) >= 5000 then
      return jsonb_build_object('trainee_id', null, 'created', false);
    end if;

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

create or replace function public.register_record_feedback(_session_id uuid, _identifier text, _overall integer, _answers jsonb, _comments text) returns TABLE(status text, attendee_id uuid, attendee_name text, attendee_email text, checked_in boolean, certificate_sent_at timestamp with time zone)
language plpgsql security definer set search_path = public as $$
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

create or replace function public.register_resolve_trainee_email(_session_id uuid, _trainee_id text, _email text) returns text
language plpgsql security definer set search_path = public as $$
declare
  _register  uuid;
  _existing  text;
  _index     integer;
  _new_email text := nullif(btrim(lower(coalesce(_email, ''))), '');
begin
  select s.register_id into _register
    from public.register_sessions s where s.id = _session_id;

  if _register is null or _trainee_id is null then
    return _new_email;
  end if;

  select i, nullif(btrim(coalesce(t->>'email', '')), '') into _index, _existing
    from public.register_stores st,
         lateral jsonb_array_elements(st.data->'trainees') with ordinality as arr(t, i)
   where st.register_id = _register
     and t->>'id' = _trainee_id
   limit 1;

  -- What is on file stands. A sign-in form is not where an address changes.
  if _existing is not null then
    return _existing;
  end if;

  if _new_email is not null and _index is not null then
    update public.register_stores
       set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                            to_jsonb(_new_email), true),
           updated_at = now()
     where register_id = _register;
  end if;

  return _new_email;
end;
$$;

-- Whether this person may change a register's contents: an owner or an
-- editor. A viewer is a member — they can read everything — and no more.
create or replace function public.can_edit_register(_user_id uuid, _register_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.register_members
     where user_id = _user_id and register_id = _register_id
       and role::text in ('owner', 'editor')
  );
$$;

-- The largest register document save_register() accepts. A busy register
-- running for years is a few hundred kilobytes; this is a ceiling on abuse,
-- not a limit anybody should meet.
create or replace function public.register_max_bytes()
returns integer language sql immutable set search_path = public as $$ select 4 * 1024 * 1024 $$;

-- Whether a register may be written to. An event register always may; a
-- regular one while any of its owners is subscribed.
create or replace function public.register_is_entitled(_register_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.registers r
     where r.id = _register_id
       and (r.kind = 'event'
            or exists (
              select 1 from public.register_members m
               where m.register_id = r.id
                 and m.role = 'owner'
                 and public.has_active_subscription(m.user_id)))
  );
$$;

create or replace function public.assert_register_writable(_register_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.register_is_entitled(_register_id) then
    raise exception 'This register is read-only: none of its owners has an active subscription'
      using hint = 'Nothing has been deleted. An owner can subscribe from the Account page to carry on.';
  end if;
end;
$$;

-- The number of days from the first day in a register to the last, inclusive.
-- A day recorded with only a month counts as that month's first.
create or replace function public.register_span_days(_data jsonb)
returns integer language sql immutable set search_path = public as $$
  select coalesce(max(d) - min(d) + 1, 0)
    from (
      select case
               when s->>'date'  ~ '^\d{4}-\d{2}-\d{2}$' then (s->>'date')::date
               when s->>'month' ~ '^\d{4}-\d{2}$'       then ((s->>'month') || '-01')::date
             end as d
        from jsonb_array_elements(
               case when jsonb_typeof(_data->'sessions') = 'array'
                    then _data->'sessions' else '[]'::jsonb end) s
    ) days;
$$;

-- ---------------------------------------------------- creating a register --
create or replace function public.create_register(
  _name text,
  _kind public.register_kind default 'event',
  _organisation text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _clean  text := btrim(coalesce(_name, ''));
  _base   text;
  _slug   text;
  _id     uuid;
begin
  if _caller is null then
    raise exception 'You must be signed in to create a register';
  end if;

  if char_length(_clean) < 2 or char_length(_clean) > 80 then
    raise exception 'Give the register a name between 2 and 80 characters';
  end if;

  if _kind = 'regular' and not public.has_active_subscription(_caller) then
    raise exception 'A regular register needs a subscription'
      using hint = 'Subscribe from the Account page, or create a free event register instead.';
  end if;

  _base := left(coalesce(nullif(btrim(regexp_replace(lower(_clean), '[^a-z0-9]+', '-', 'g'), '-'), ''),
                         'register'), 40);
  loop
    -- The suffix makes the address unguessable from the name and keeps two
    -- registers with the same name apart.
    _slug := _base || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    exit when not exists (select 1 from public.registers where slug = _slug);
  end loop;

  insert into public.registers (name, organisation, kind, slug, created_by)
  values (_clean, nullif(btrim(coalesce(_organisation, '')), ''), _kind, _slug, _caller)
  returning id into _id;

  insert into public.register_stores (register_id, updated_by) values (_id, _caller);

  insert into public.register_members (register_id, user_id, role, granted_by)
  values (_id, _caller, 'owner', _caller);

  return jsonb_build_object('id', _id, 'slug', _slug);
end;
$$;

-- Your registers, and only yours.
create or replace function public.register_directory()
returns table (
  id uuid, name text, slug text, organisation text, kind public.register_kind,
  member_count bigint, i_am_member boolean, i_am_owner boolean,
  my_role public.register_role,
  certificate_logo_path text, certificate_design jsonb,
  entitled boolean, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.slug, r.organisation, r.kind,
         (select count(*) from public.register_members m where m.register_id = r.id),
         true,
         me.role = 'owner',
         me.role,
         r.certificate_logo_path,
         r.certificate_design,
         public.register_is_entitled(r.id),
         r.created_at
    from public.registers r
    join public.register_members me on me.register_id = r.id and me.user_id = auth.uid()
   where r.is_active
   order by r.created_at desc;
$$;

create or replace function public.register_archive()
returns table (
  id uuid, name text, slug text, organisation text, kind public.register_kind,
  archived_at timestamptz, purge_at timestamptz, trainee_count integer, session_count integer
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.purge_expired_registers();

  return query
    select r.id, r.name, r.slug, r.organisation, r.kind,
           r.archived_at,
           r.archived_at + make_interval(days => public.register_archive_days()),
           (public.register_blob_counts(st.data)->>'trainees')::int,
           (public.register_blob_counts(st.data)->>'sessions')::int
      from public.registers r
      left join public.register_stores st on st.register_id = r.id
     where r.archived_at is not null
       and public.is_register_owner(auth.uid(), r.id)
     order by r.archived_at desc;
end;
$$;

-- Names and addresses of a register's members, for its other members.
create or replace function public.register_people(_register_id uuid)
returns table (user_id uuid, first_name text, last_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.first_name, p.last_name, p.email
    from public.profiles p
    join public.register_members m on m.user_id = p.user_id and m.register_id = _register_id
   where public.is_register_member(auth.uid(), _register_id);
$$;

-- What the Account page shows. One place decides what "subscribed" means.
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'subscribed',           public.has_active_subscription(auth.uid()),
    'status',               coalesce(s.status, 'none'),
    'current_period_end',   s.current_period_end,
    'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'managed_by_stripe',    s.stripe_subscription_id is not null,
    'event_max_days',       public.register_event_max_days()
  )
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

-- ----------------------------------------------------------------- saving --
create or replace function public.save_register(
  _register_id uuid, _data jsonb, _expected_version bigint
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  _caller  uuid := auth.uid();
  _kind    public.register_kind;
  _version bigint;
begin
  if _caller is null or not public.is_register_member(_caller, _register_id) then
    raise exception 'You do not have access to that register';
  end if;

  if not public.can_edit_register(_caller, _register_id) then
    raise exception 'You have view-only access to this register'
      using hint = 'Ask one of its owners if you need to make changes.';
  end if;

  if jsonb_typeof(_data) is distinct from 'object' then
    raise exception 'That is not a register';
  end if;

  if pg_column_size(_data) > public.register_max_bytes() then
    raise exception 'This register has grown too large to save';
  end if;

  perform public.assert_register_writable(_register_id);

  select kind into _kind from public.registers where id = _register_id;
  if _kind = 'event' and public.register_span_days(_data) > public.register_event_max_days() then
    raise exception 'An event register covers one event of up to % days',
      public.register_event_max_days()
      using hint = 'For teaching that runs through the year, create a regular register.';
  end if;

  update public.register_stores
     set data       = _data,
         version    = version + 1,
         updated_at = now(),
         updated_by = _caller
   where register_id = _register_id
     and version     = _expected_version
  returning version into _version;

  if _version is null then
    -- Either the register is gone, or somebody else saved first. Distinguish
    -- them, because the second is recoverable by re-reading and the first is not.
    if not exists (select 1 from public.register_stores where register_id = _register_id) then
      raise exception 'That register does not exist';
    end if;
    raise exception 'This register was saved by somebody else while you were editing'
      using errcode = '40001',
            hint    = 'Reload to pick up their changes, then make your edit again.';
  end if;

  return _version;
end;
$$;

create or replace function public.restore_register_version(_register_id uuid, _version bigint)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _data   jsonb;
  _new    bigint;
begin
  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner of this register can restore an earlier version';
  end if;

  perform public.assert_register_writable(_register_id);

  select data into _data from public.register_store_history
   where register_id = _register_id and version = _version;
  if _data is null then
    raise exception 'That version is not in the history';
  end if;

  update public.register_stores
     set data = _data, version = version + 1, updated_at = now(), updated_by = _caller
   where register_id = _register_id
  returning version into _new;

  insert into public.audit_log (user_id, action, details)
  values (_caller, 'register.version_restored', jsonb_build_object(
    'register_id', _register_id, 'restored_version', _version, 'new_version', _new));
  return _new;
end;
$$;

-- ------------------------------------------------------------ invitations --
create or replace function public.invite_to_register(
  _register_id uuid, _email text, _role public.register_role default 'editor'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _clean  text := lower(btrim(coalesce(_email, '')));
  _inv    public.register_invites;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can invite people to this register';
  end if;

  if _clean !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That does not look like an email address';
  end if;

  if exists (
    select 1 from public.register_members m
      join auth.users u on u.id = m.user_id
     where m.register_id = _register_id and lower(u.email) = _clean
  ) then
    raise exception 'That person already has access to this register';
  end if;

  -- Each invitation is an email this service sends in the owner's name. A
  -- ceiling on how many can be outstanding keeps a register from being used
  -- to send mail to a list of strangers.
  if (select count(*) from public.register_invites
       where register_id = _register_id and accepted_at is null and email <> _clean) >= 50 then
    raise exception 'This register already has 50 invitations waiting'
      using hint = 'Withdraw the ones no longer needed, then invite again.';
  end if;

  -- Inviting the same address again replaces the earlier invitation: a new
  -- link, a new fortnight, and the old link stops working.
  insert into public.register_invites (register_id, email, role, token, invited_by)
  values (_register_id, _clean, _role,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          _caller)
  on conflict (register_id, email) where accepted_at is null
  do update set role       = excluded.role,
                token      = excluded.token,
                invited_by = excluded.invited_by,
                created_at = now(),
                expires_at = now() + interval '14 days'
  returning * into _inv;

  insert into public.audit_log (user_id, action, details)
  values (_caller, 'register.invited', jsonb_build_object(
    'register_id', _register_id, 'email', _clean, 'role', _role));

  return jsonb_build_object(
    'id', _inv.id, 'email', _inv.email, 'token', _inv.token, 'expires_at', _inv.expires_at);
end;
$$;

-- What the invitation page shows before somebody accepts.
create or replace function public.register_invite_preview(_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'register_name', r.name,
    'organisation',  r.organisation,
    'kind',          r.kind,
    'role',          i.role,
    'invited_by',    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'usable',        i.accepted_at is null and i.expires_at > now() and r.archived_at is null,
    -- An owner invitation is only for the address it was sent to; see
    -- accept_register_invite().
    'wrong_account', i.role = 'owner' and not exists (
                       select 1 from auth.users u
                        where u.id = auth.uid() and lower(u.email) = i.email
                          and u.email_confirmed_at is not null),
    'already_member', public.is_register_member(auth.uid(), r.id),
    'slug',          case when public.is_register_member(auth.uid(), r.id) then r.slug end
  )
  from public.register_invites i
  join public.registers r on r.id = i.register_id
  left join public.profiles p on p.user_id = i.invited_by
  where auth.uid() is not null and i.token = _token;
$$;

create or replace function public.accept_register_invite(_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _inv    public.register_invites;
  _reg    public.registers;
begin
  if _caller is null then
    raise exception 'Sign in to accept this invitation';
  end if;

  select * into _inv from public.register_invites where token = _token for update;
  if _inv.id is null then
    raise exception 'This invitation has been withdrawn or replaced'
      using hint = 'Ask whoever invited you to send it again.';
  end if;

  select * into _reg from public.registers where id = _inv.register_id;
  if _reg.archived_at is not null then
    raise exception 'That register has been deleted';
  end if;

  -- Somebody already inside opening the link — the owner checking it works —
  -- must not use it up.
  if public.is_register_member(_caller, _inv.register_id) then
    return jsonb_build_object('register_id', _reg.id, 'slug', _reg.slug, 'name', _reg.name);
  end if;

  if _inv.accepted_at is not null then
    raise exception 'This invitation has already been used';
  end if;
  if _inv.expires_at < now() then
    raise exception 'This invitation has expired'
      using hint = 'Ask whoever invited you to send it again.';
  end if;

  -- A link can be forwarded, and whoever holds it may use it. That is an
  -- acceptable way to become an editor or a viewer; it is not an acceptable
  -- way to become an owner, who can read everything, remove everybody else
  -- and delete the register. An owner invitation is therefore good only for
  -- the address it was sent to, proven by signing in with it.
  if _inv.role = 'owner' and not exists (
    select 1 from auth.users u
     where u.id = _caller and lower(u.email) = _inv.email and u.email_confirmed_at is not null
  ) then
    raise exception 'This invitation is for a different account'
      using hint = 'It makes its holder an owner, so it can only be accepted by signing in with the address it was sent to.';
  end if;

  insert into public.register_members (register_id, user_id, role, granted_by)
  values (_inv.register_id, _caller, _inv.role, _inv.invited_by)
  on conflict (register_id, user_id) do nothing;

  update public.register_invites
     set accepted_at = now(), accepted_by = _caller
   where id = _inv.id;

  return jsonb_build_object('register_id', _reg.id, 'slug', _reg.slug, 'name', _reg.name);
end;
$$;

-- Accept every invitation addressed to the caller's own, verified, sign-in
-- address. Called once after signing in, so somebody invited does not have to
-- find the email: they sign in and the register is there.
create or replace function public.claim_register_invites()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _email  text;
  _inv    public.register_invites;
  _count  integer := 0;
begin
  if _caller is null then
    return 0;
  end if;

  select lower(email) into _email
    from auth.users
   where id = _caller and email_confirmed_at is not null;
  if _email is null then
    return 0;
  end if;

  for _inv in
    select i.* from public.register_invites i
      join public.registers r on r.id = i.register_id and r.archived_at is null
     where i.email = _email and i.accepted_at is null and i.expires_at > now()
       for update of i
  loop
    insert into public.register_members (register_id, user_id, role, granted_by)
    values (_inv.register_id, _caller, _inv.role, _inv.invited_by)
    on conflict (register_id, user_id) do nothing;

    update public.register_invites
       set accepted_at = now(), accepted_by = _caller
     where id = _inv.id;
    _count := _count + 1;
  end loop;

  return _count;
end;
$$;

-- The registers that would be left with nobody able to manage them if this
-- person's account went. Account deletion destroys these with the account.
create or replace function public.registers_solely_owned_by(_user_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.register_id
    from public.register_members m
   where m.user_id = _user_id and m.role = 'owner'
     and not exists (
       select 1 from public.register_members o
        where o.register_id = m.register_id and o.role = 'owner' and o.user_id <> _user_id);
$$;

-- ------------------------------------------------------------------ audit --
create or replace function public.audit_register_members()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.member_added', jsonb_build_object(
      'register_id', NEW.register_id, 'subject_user_id', NEW.user_id, 'role', NEW.role));
  elsif TG_OP = 'DELETE' then
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.member_removed', jsonb_build_object(
      'register_id', OLD.register_id, 'subject_user_id', OLD.user_id, 'role', OLD.role));
  else
    insert into public.audit_log (user_id, action, details)
    values (auth.uid(), 'register.member_role_changed', jsonb_build_object(
      'register_id', NEW.register_id, 'subject_user_id', NEW.user_id,
      'from', OLD.role, 'to', NEW.role));
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_register_members on public.register_members;
create trigger audit_register_members after insert or delete or update on public.register_members
  for each row execute function public.audit_register_members();

drop trigger if exists audit_register_lifecycle on public.registers;
create trigger audit_register_lifecycle after delete or update of archived_at on public.registers
  for each row execute function public.audit_register_lifecycle();

drop trigger if exists register_store_snapshot on public.register_stores;
create trigger register_store_snapshot before update on public.register_stores
  for each row execute function public.register_store_snapshot();

-- ------------------------------------------------------ row-level security --
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'subscriptions', 'audit_log', 'registers', 'register_members',
    'register_invites', 'register_stores', 'register_store_history',
    'register_sessions', 'register_attendees', 'register_feedback', 'register_forms'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- audit_log and register_store_history have no policies at all: they are
-- reached only through security-definer functions and the service role.

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "members read their registers" on public.registers;
create policy "members read their registers" on public.registers
  for select to authenticated using (public.is_register_member(auth.uid(), id));

drop policy if exists "owners update their register" on public.registers;
create policy "owners update their register" on public.registers
  for update to authenticated
  using (public.is_register_owner(auth.uid(), id))
  with check (public.is_register_owner(auth.uid(), id));

drop policy if exists "owners delete their archived register" on public.registers;
create policy "owners delete their archived register" on public.registers
  for delete to authenticated
  using (public.is_register_owner(auth.uid(), id) and archived_at is not null);

drop policy if exists "members read membership of their registers" on public.register_members;
create policy "members read membership of their registers" on public.register_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_register_member(auth.uid(), register_id));

drop policy if exists "owners read invitations" on public.register_invites;
create policy "owners read invitations" on public.register_invites
  for select to authenticated using (public.is_register_owner(auth.uid(), register_id));

drop policy if exists "owners withdraw invitations" on public.register_invites;
create policy "owners withdraw invitations" on public.register_invites
  for delete to authenticated
  using (public.is_register_owner(auth.uid(), register_id) and accepted_at is null);

drop policy if exists "members read their register data" on public.register_stores;
create policy "members read their register data" on public.register_stores
  for select to authenticated using (public.is_register_member(auth.uid(), register_id));

drop policy if exists "members read their sessions" on public.register_sessions;
create policy "members read their sessions" on public.register_sessions
  for select to authenticated using (public.is_register_member(auth.uid(), register_id));

drop policy if exists "members read their attendees" on public.register_attendees;
create policy "members read their attendees" on public.register_attendees
  for select to authenticated using (exists (
    select 1 from public.register_sessions s
     where s.id = register_attendees.session_id
       and public.is_register_member(auth.uid(), s.register_id)));

drop policy if exists "members read their feedback" on public.register_feedback;
create policy "members read their feedback" on public.register_feedback
  for select to authenticated using (exists (
    select 1 from public.register_sessions s
     where s.id = register_feedback.session_id
       and public.is_register_member(auth.uid(), s.register_id)));

drop policy if exists "members read their form template" on public.register_forms;
create policy "members read their form template" on public.register_forms
  for select to authenticated using (public.is_register_member(auth.uid(), register_id));

-- ---------------------------------------------------------------- storage --
-- Certificate badges. Public-read: a crest is branding, not personal data.
-- Paths are '<register_id>/<uuid>.<ext>', so the first folder segment is the
-- register whose owners may write there.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('register-logos', 'register-logos', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "register logos are readable" on storage.objects;
create policy "register logos are readable" on storage.objects
  for select using (bucket_id = 'register-logos');

drop policy if exists "register owners upload logos" on storage.objects;
create policy "register owners upload logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'register-logos'
              and public.is_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid));

drop policy if exists "register owners replace logos" on storage.objects;
create policy "register owners replace logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'register-logos'
         and public.is_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid));

drop policy if exists "register owners remove logos" on storage.objects;
create policy "register owners remove logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'register-logos'
         and public.is_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- ----------------------------------------------------------------- grants --
-- Start from nothing. A Supabase project's default privileges give anon and
-- authenticated everything on a new public table and EXECUTE on every new
-- function; row-level security would still hold, but a function meant for the
-- service role alone (register_record_checkin, say) would be callable by
-- anybody with the publishable key.
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.profiles to authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, delete on public.registers to authenticated;
grant update (name, organisation, certificate_logo_path, certificate_design) on public.registers to authenticated;
grant select on public.register_members to authenticated;
grant select, delete on public.register_invites to authenticated;
grant select on public.register_stores, public.register_sessions, public.register_attendees,
                public.register_feedback, public.register_forms to authenticated;

-- What a signed-in person may call. Everything not listed is the service
-- role's alone — notably the check-in and feedback writers, which the
-- register-api function reaches after its own checks.
grant execute on function
  public.is_register_member(uuid, uuid),
  public.is_register_owner(uuid, uuid),
  public.can_edit_register(uuid, uuid),
  public.has_active_subscription(uuid),
  public.register_is_entitled(uuid),
  public.register_event_max_days(),
  public.register_archive_days(),
  public.my_plan(),
  public.create_register(text, public.register_kind, text),
  public.register_directory(),
  public.register_archive(),
  public.register_people(uuid),
  public.save_register(uuid, jsonb, bigint),
  public.register_history(uuid),
  public.restore_register_version(uuid, bigint),
  public.archive_register(uuid),
  public.restore_register(uuid),
  public.remove_register_member(uuid, uuid),
  public.set_register_member_role(uuid, uuid, public.register_role),
  public.invite_to_register(uuid, text, public.register_role),
  public.register_invite_preview(text),
  public.accept_register_invite(text),
  public.claim_register_invites()
to authenticated;

-- What somebody holding only a check-in link may call: the day's title and
-- the roster's names. The link's session id is the whole of their authority.
grant execute on function
  public.register_public_session(uuid),
  public.register_public_roster(uuid)
to anon, authenticated;

commit;
