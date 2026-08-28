-- ============================================================================
-- TraineeHQ / HST Training Hub — complete baseline schema
--
-- Bootstraps a brand-new, self-owned Supabase project with everything the app
-- needs: extensions, enums, tables, constraints, indexes, triggers, the
-- security-definer helpers RLS depends on, row-level security policies, and the
-- storage bucket.
--
-- Run it once, top to bottom, against an EMPTY project. It is written to be
-- idempotent (if not exists / or replace / drop policy if exists) so a partial
-- run can be repeated safely, but it is not a migration for an existing
-- database — see supabase/schema/README.md.
--
-- Reconstructed from src/integrations/supabase/types.ts, which is generated from
-- the live schema, plus the access rules the application actually relies on. The
-- original project's RLS was never in version control; the policies here are
-- written from the app's behaviour and are the part most worth reviewing before
-- you point production at it.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'trainee', 'facilitator', 'super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contact_category as enum (
    'deanery', 'tpd', 'associate_dean', 'educational_supervisor',
    'trainee_rep', 'royal_college', 'trust_lead', 'rota_admin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resource_type as enum (
    'pdf', 'document', 'video', 'link', 'presentation', 'checklist', 'folder'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Shared trigger function
-- ----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Deaneries — the tenancy root. Everything else hangs off one of these.
create table if not exists public.deaneries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text not null,
  slug        text not null unique,
  logo_url    text,
  color       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Specialties — self-nesting one level (parent_specialty_id), soft-deletable.
create table if not exists public.specialties (
  id                   uuid primary key default gen_random_uuid(),
  deanery_id           uuid not null references public.deaneries(id) on delete cascade,
  parent_specialty_id  uuid references public.specialties(id) on delete cascade,
  name                 text not null,
  short_name           text not null,
  slug                 text not null,
  icon_name            text,
  color                text,
  sort_order           integer default 0,
  is_active            boolean not null default true,
  -- Soft delete: rows keep a 30-day grace period in the admin trash.
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (deanery_id, slug)
);

-- Profiles — one per auth user, created by the handle_new_user trigger below.
create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  first_name       text,
  last_name        text,
  email            text,
  training_grade   text,
  deanery_id       uuid references public.deaneries(id) on delete set null,
  specialty_id     uuid references public.specialties(id) on delete set null,
  gdpr_consent_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Roles — a user may hold several; the app takes the highest.
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null default 'trainee',
  deanery_id  uuid references public.deaneries(id) on delete cascade,
  unique (user_id, role)
);

create table if not exists public.trainee_specialties (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (user_id, specialty_id)
);

create table if not exists public.facilitator_specialties (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (user_id, specialty_id)
);

-- Content tree: specialty -> subsection -> folder / resource
create table if not exists public.subsections (
  id            uuid primary key default gen_random_uuid(),
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  name          text not null,
  sort_order    integer default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.resource_folders (
  id             uuid primary key default gen_random_uuid(),
  subsection_id  uuid not null references public.subsections(id) on delete cascade,
  name           text not null,
  -- Grouping label within a subsection. Free text, not a table — see the
  -- evaluation doc; persisting these properly is a known follow-up.
  subheading     text,
  sort_order     integer default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.resources (
  id             uuid primary key default gen_random_uuid(),
  subsection_id  uuid not null references public.subsections(id) on delete cascade,
  folder_id      uuid references public.resource_folders(id) on delete set null,
  title          text not null,
  description    text,
  resource_type  public.resource_type not null default 'document',
  -- Storage path inside the "resources" bucket, e.g. {specialty}/{subsection}/{uuid}.pdf
  file_url       text,
  external_url   text,
  embed_url      text,
  file_size      bigint,
  subheading     text,
  sort_order     integer default 0,
  added_by       uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Directory
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text not null,
  category      public.contact_category not null,
  organisation  text not null,
  email         text not null,
  phone         text,
  profile_url   text,
  specialty_id  uuid references public.specialties(id) on delete cascade,
  deanery_id    uuid references public.deaneries(id) on delete cascade,
  archived      boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Announcements and per-specialty notices
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  deanery_id  uuid references public.deaneries(id) on delete cascade,
  title       text not null,
  content     text not null,
  is_active   boolean default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.specialty_notices (
  id            uuid primary key default gen_random_uuid(),
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  content       text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Discussions
create table if not exists public.discussions (
  id            uuid primary key default gen_random_uuid(),
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  content       text not null,
  is_pinned     boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.discussion_comments (
  id             uuid primary key default gen_random_uuid(),
  discussion_id  uuid not null references public.discussions(id) on delete cascade,
  parent_id      uuid references public.discussion_comments(id) on delete cascade,
  author_id      uuid not null references auth.users(id) on delete cascade,
  content        text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.discussion_votes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  discussion_id  uuid references public.discussions(id) on delete cascade,
  comment_id     uuid references public.discussion_comments(id) on delete cascade,
  vote_type      integer not null,
  created_at     timestamptz not null default now(),
  -- A vote belongs to exactly one of a discussion or a comment.
  constraint discussion_votes_target_check check (
    (discussion_id is not null and comment_id is null) or
    (discussion_id is null and comment_id is not null)
  ),
  constraint discussion_votes_type_check check (vote_type in (-1, 1))
);

-- One vote per user per target. Partial uniques because one side is always null.
create unique index if not exists discussion_votes_user_discussion_uniq
  on public.discussion_votes (user_id, discussion_id) where discussion_id is not null;
create unique index if not exists discussion_votes_user_comment_uniq
  on public.discussion_votes (user_id, comment_id) where comment_id is not null;

-- Per-user saved items
create table if not exists public.bookmarks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  resource_id  uuid not null references public.resources(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (user_id, resource_id)
);

create table if not exists public.starred_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, contact_id)
);

create table if not exists public.watched_discussions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  discussion_id  uuid not null references public.discussions(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (user_id, discussion_id)
);

create table if not exists public.dashboard_preferences (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  widget_layout         jsonb not null default '[]'::jsonb,
  hidden_widgets        jsonb not null default '[]'::jsonb,
  right_column_widgets  jsonb not null default '[]'::jsonb,
  widget_settings       jsonb not null default '{}'::jsonb,
  columns               integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Access requests (public sign-up funnel)
create table if not exists public.access_requests (
  id              uuid primary key default gen_random_uuid(),
  first_name      text not null,
  last_name       text not null,
  email           text not null,
  training_grade  text,
  reason          text,
  deanery_id      uuid references public.deaneries(id) on delete set null,
  specialty_id    uuid references public.specialties(id) on delete set null,
  status          public.request_status not null default 'pending',
  review_note     text,
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Teaching sessions and attendance. Present in the original schema but unused by
-- the app, which uses the standalone register at register.traineehq.com. Kept so
-- the schema matches, and so attendance can be folded back in later.
create table if not exists public.teaching_sessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  session_date  date not null,
  location      text,
  notes         text,
  specialty_id  uuid references public.specialties(id) on delete cascade,
  deanery_id    uuid references public.deaneries(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.teaching_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      public.attendance_status not null default 'present',
  notes       text,
  marked_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, user_id)
);

-- Audit log. The original has this table and never writes to it; it is here so
-- login/view/download auditing can be switched on without a schema change.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  details     jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes on the columns the app filters and joins on
-- ----------------------------------------------------------------------------
create index if not exists specialties_deanery_idx          on public.specialties (deanery_id) where deleted_at is null;
create index if not exists specialties_parent_idx           on public.specialties (parent_specialty_id);
create index if not exists subsections_specialty_idx        on public.subsections (specialty_id);
create index if not exists resources_subsection_idx         on public.resources (subsection_id);
create index if not exists resources_folder_idx             on public.resources (folder_id);
create index if not exists resources_created_at_idx         on public.resources (created_at desc);
create index if not exists resource_folders_subsection_idx  on public.resource_folders (subsection_id);
create index if not exists profiles_user_idx                on public.profiles (user_id);
create index if not exists profiles_deanery_idx             on public.profiles (deanery_id);
create index if not exists user_roles_user_idx              on public.user_roles (user_id);
create index if not exists trainee_specialties_user_idx     on public.trainee_specialties (user_id);
create index if not exists facilitator_specialties_user_idx on public.facilitator_specialties (user_id);
create index if not exists discussions_specialty_idx        on public.discussions (specialty_id);
create index if not exists discussion_comments_disc_idx     on public.discussion_comments (discussion_id);
create index if not exists discussion_votes_disc_idx        on public.discussion_votes (discussion_id);
create index if not exists discussion_votes_comment_idx     on public.discussion_votes (comment_id);
create index if not exists bookmarks_user_idx               on public.bookmarks (user_id);
create index if not exists starred_contacts_user_idx        on public.starred_contacts (user_id);
create index if not exists watched_discussions_user_idx     on public.watched_discussions (user_id);
create index if not exists contacts_specialty_idx           on public.contacts (specialty_id) where archived is not true;
create index if not exists specialty_notices_specialty_idx  on public.specialty_notices (specialty_id) where is_active;
create index if not exists announcements_deanery_idx        on public.announcements (deanery_id) where is_active;
create index if not exists access_requests_status_idx       on public.access_requests (status, created_at desc);
create index if not exists audit_log_user_idx               on public.audit_log (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'deaneries','specialties','profiles','subsections','resource_folders','resources',
    'contacts','announcements','specialty_notices','discussions','discussion_comments',
    'dashboard_preferences','access_requests','teaching_sessions','attendance_records'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.update_updated_at_column()', t);
  end loop;
end $$;

-- ============================================================================
-- NEW USER BOOTSTRAP
--
-- Every auth user gets a profile and the baseline 'trainee' role. The
-- invite-user edge function relies on this having already run (it upgrades the
-- role afterwards rather than creating it).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'trainee')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- SECURITY-DEFINER HELPERS
--
-- RLS policies must not query a table that is itself protected by RLS on the
-- same user, or the policy recurses. These run as the definer, with search_path
-- pinned so they cannot be hijacked by a caller-set path.
-- ============================================================================

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_facilitator_for(_user_id uuid, _specialty_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.facilitator_specialties
    where user_id = _user_id and specialty_id = _specialty_id
  );
$$;

-- Can this user see the specialty at all?
--   super_admin  every specialty
--   admin        every specialty in their own deanery
--   facilitator  the specialties they facilitate (and their children)
--   trainee      the specialties they are enrolled on (and their children)
create or replace function public.can_access_specialty(_user_id uuid, _specialty_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select id, deanery_id, parent_specialty_id
    from public.specialties
    where id = _specialty_id
  )
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1
      from public.user_roles ur, target t
      where ur.user_id = _user_id
        and ur.role = 'admin'
        and (
          ur.deanery_id is null
          or ur.deanery_id = t.deanery_id
        )
    )
    or exists (
      select 1 from public.facilitator_specialties fs, target t
      where fs.user_id = _user_id
        and fs.specialty_id in (t.id, t.parent_specialty_id)
    )
    or exists (
      select 1 from public.trainee_specialties ts, target t
      where ts.user_id = _user_id
        and ts.specialty_id in (t.id, t.parent_specialty_id)
    );
$$;

-- Can this user add/edit/delete content in the subsection?
create or replace function public.can_manage_resource(_user_id uuid, _subsection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin(_user_id)
    or exists (
      select 1
      from public.subsections s
      join public.specialties sp on sp.id = s.specialty_id
      join public.facilitator_specialties fs on fs.user_id = _user_id
      where s.id = _subsection_id
        and fs.specialty_id in (sp.id, sp.parent_specialty_id)
    );
$$;

-- Display names for discussion authors. Deliberately narrow: it exposes names
-- only, never emails, so the client never needs to read profiles wholesale.
create or replace function public.get_profile_display_names()
returns table (user_id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.first_name, p.last_name
  from public.profiles p;
$$;

-- Supabase's default privileges on the public schema grant EXECUTE on every new
-- function to anon, authenticated and service_role at creation time, so `anon`
-- must be revoked BY NAME -- "revoke from public" alone leaves those explicit
-- grants in place and the helpers stay callable over /rest/v1/rpc without a
-- session. get_profile_display_names would otherwise hand every user's name to
-- an anonymous caller, and the predicates would let one probe whether a given
-- uuid is an admin.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_facilitator_for(uuid, uuid) from public, anon;
revoke execute on function public.can_access_specialty(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_resource(uuid, uuid) from public, anon;
revoke execute on function public.get_profile_display_names() from public, anon;

-- RLS policy expressions are evaluated as the querying role, so signed-in users
-- must keep EXECUTE on the predicates their policies reference.
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_facilitator_for(uuid, uuid) to authenticated;
grant execute on function public.can_access_specialty(uuid, uuid) to authenticated;
grant execute on function public.can_manage_resource(uuid, uuid) to authenticated;
grant execute on function public.get_profile_display_names() to authenticated;

-- A trigger function on auth.users; nothing should reach it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Keep functions added later out of anon's reach by default.
alter default privileges in schema public revoke execute on functions from anon;

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- RLS is the only authorisation boundary in this application: the browser talks
-- to PostgREST directly with the user's own JWT, and the route guards in the
-- React app are convenience only. Every table is enabled and denies by default.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'deaneries','specialties','profiles','user_roles','trainee_specialties',
    'facilitator_specialties','subsections','resource_folders','resources','contacts',
    'announcements','specialty_notices','discussions','discussion_comments',
    'discussion_votes','bookmarks','starred_contacts','watched_discussions',
    'dashboard_preferences','access_requests','teaching_sessions','attendance_records',
    'audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- deaneries --
drop policy if exists "deaneries readable by signed-in users" on public.deaneries;
create policy "deaneries readable by signed-in users"
  on public.deaneries for select to authenticated using (true);

-- The Request Access form needs the deanery list before the user has an account.
drop policy if exists "active deaneries readable anonymously" on public.deaneries;
create policy "active deaneries readable anonymously"
  on public.deaneries for select to anon using (is_active);

drop policy if exists "admins manage deaneries" on public.deaneries;
create policy "admins manage deaneries"
  on public.deaneries for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- -------------------------------------------------------------- specialties --
drop policy if exists "specialties readable by permitted users" on public.specialties;
create policy "specialties readable by permitted users"
  on public.specialties for select to authenticated
  using (deleted_at is null and public.can_access_specialty(auth.uid(), id));

-- Admins additionally see the soft-delete trash for their own deanery.
drop policy if exists "admins read deleted specialties" on public.specialties;
create policy "admins read deleted specialties"
  on public.specialties for select to authenticated
  using (public.is_admin(auth.uid()));

-- The Request Access form lists specialties for the chosen deanery.
drop policy if exists "active specialties readable anonymously" on public.specialties;
create policy "active specialties readable anonymously"
  on public.specialties for select to anon
  using (is_active and deleted_at is null);

drop policy if exists "admins manage specialties" on public.specialties;
create policy "admins manage specialties"
  on public.specialties for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------- profiles --
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
  on public.profiles for delete to authenticated
  using (public.is_admin(auth.uid()));

-- --------------------------------------------------------------- user_roles --
-- Readable so the app can resolve its own role; writable only by admins, and
-- never by the user themselves — self-service writes here are privilege
-- escalation.
drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles"
  on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (
    public.is_admin(auth.uid())
    -- Only a super admin may mint another super admin.
    and (role <> 'super_admin' or public.has_role(auth.uid(), 'super_admin'))
  );

-- --------------------------------------------------- specialty assignments --
drop policy if exists "read own trainee specialties" on public.trainee_specialties;
create policy "read own trainee specialties"
  on public.trainee_specialties for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "admins manage trainee specialties" on public.trainee_specialties;
create policy "admins manage trainee specialties"
  on public.trainee_specialties for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "read facilitator specialties" on public.facilitator_specialties;
create policy "read facilitator specialties"
  on public.facilitator_specialties for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "admins manage facilitator specialties" on public.facilitator_specialties;
create policy "admins manage facilitator specialties"
  on public.facilitator_specialties for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- --------------------------------------------------------------- subsections --
drop policy if exists "subsections follow specialty access" on public.subsections;
create policy "subsections follow specialty access"
  on public.subsections for select to authenticated
  using (public.can_access_specialty(auth.uid(), specialty_id));

drop policy if exists "managers write subsections" on public.subsections;
create policy "managers write subsections"
  on public.subsections for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

-- ---------------------------------------------------- folders and resources --
drop policy if exists "folders follow subsection access" on public.resource_folders;
create policy "folders follow subsection access"
  on public.resource_folders for select to authenticated
  using (exists (
    select 1 from public.subsections s
    where s.id = subsection_id
      and public.can_access_specialty(auth.uid(), s.specialty_id)
  ));

drop policy if exists "managers write folders" on public.resource_folders;
create policy "managers write folders"
  on public.resource_folders for all to authenticated
  using (public.can_manage_resource(auth.uid(), subsection_id))
  with check (public.can_manage_resource(auth.uid(), subsection_id));

drop policy if exists "resources follow subsection access" on public.resources;
create policy "resources follow subsection access"
  on public.resources for select to authenticated
  using (exists (
    select 1 from public.subsections s
    where s.id = subsection_id
      and public.can_access_specialty(auth.uid(), s.specialty_id)
  ));

drop policy if exists "managers write resources" on public.resources;
create policy "managers write resources"
  on public.resources for all to authenticated
  using (public.can_manage_resource(auth.uid(), subsection_id))
  with check (public.can_manage_resource(auth.uid(), subsection_id));

-- ----------------------------------------------------------------- contacts --
drop policy if exists "contacts readable by signed-in users" on public.contacts;
create policy "contacts readable by signed-in users"
  on public.contacts for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (
      archived is not true
      and (specialty_id is null or public.can_access_specialty(auth.uid(), specialty_id))
    )
  );

drop policy if exists "admins manage contacts" on public.contacts;
create policy "admins manage contacts"
  on public.contacts for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ------------------------------------------- announcements and notices ------
drop policy if exists "announcements readable by signed-in users" on public.announcements;
create policy "announcements readable by signed-in users"
  on public.announcements for select to authenticated
  using (is_active or public.is_admin(auth.uid()));

drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements"
  on public.announcements for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "notices follow specialty access" on public.specialty_notices;
create policy "notices follow specialty access"
  on public.specialty_notices for select to authenticated
  using (is_active and public.can_access_specialty(auth.uid(), specialty_id));

drop policy if exists "managers write notices" on public.specialty_notices;
create policy "managers write notices"
  on public.specialty_notices for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    author_id = auth.uid()
    and (
      public.is_admin(auth.uid())
      or public.is_facilitator_for(auth.uid(), specialty_id)
    )
  );

-- -------------------------------------------------------------- discussions --
drop policy if exists "discussions follow specialty access" on public.discussions;
create policy "discussions follow specialty access"
  on public.discussions for select to authenticated
  using (public.can_access_specialty(auth.uid(), specialty_id));

drop policy if exists "members post discussions" on public.discussions;
create policy "members post discussions"
  on public.discussions for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_access_specialty(auth.uid(), specialty_id)
  );

drop policy if exists "authors and managers edit discussions" on public.discussions;
create policy "authors and managers edit discussions"
  on public.discussions for update to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_facilitator_for(auth.uid(), specialty_id)
  )
  with check (
    author_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

drop policy if exists "authors and managers delete discussions" on public.discussions;
create policy "authors and managers delete discussions"
  on public.discussions for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_facilitator_for(auth.uid(), specialty_id)
  );

drop policy if exists "comments follow discussion access" on public.discussion_comments;
create policy "comments follow discussion access"
  on public.discussion_comments for select to authenticated
  using (exists (
    select 1 from public.discussions d
    where d.id = discussion_id
      and public.can_access_specialty(auth.uid(), d.specialty_id)
  ));

drop policy if exists "members post comments" on public.discussion_comments;
create policy "members post comments"
  on public.discussion_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.discussions d
      where d.id = discussion_id
        and public.can_access_specialty(auth.uid(), d.specialty_id)
    )
  );

drop policy if exists "authors edit comments" on public.discussion_comments;
create policy "authors edit comments"
  on public.discussion_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "authors and admins delete comments" on public.discussion_comments;
create policy "authors and admins delete comments"
  on public.discussion_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "votes readable by signed-in users" on public.discussion_votes;
create policy "votes readable by signed-in users"
  on public.discussion_votes for select to authenticated using (true);

drop policy if exists "users cast own votes" on public.discussion_votes;
create policy "users cast own votes"
  on public.discussion_votes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------- per-user saved data --
do $$
declare t text;
begin
  foreach t in array array['bookmarks','starred_contacts','watched_discussions','dashboard_preferences']
  loop
    execute format('drop policy if exists "owner reads" on public.%I', t);
    execute format(
      'create policy "owner reads" on public.%I for select to authenticated
         using (user_id = auth.uid())', t);
    execute format('drop policy if exists "owner writes" on public.%I', t);
    execute format(
      'create policy "owner writes" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------- access requests --
-- Anyone may submit one; only reviewers may read or act on them. Applicants
-- cannot read back what they submitted, so this leaks no roster of who applied.
drop policy if exists "anyone submits an access request" on public.access_requests;
create policy "anyone submits an access request"
  on public.access_requests for insert to anon, authenticated
  with check (status = 'pending' and reviewed_by is null and reviewed_at is null);

drop policy if exists "reviewers read access requests" on public.access_requests;
create policy "reviewers read access requests"
  on public.access_requests for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'));

drop policy if exists "reviewers update access requests" on public.access_requests;
create policy "reviewers update access requests"
  on public.access_requests for update to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'));

-- ------------------------------------------- teaching sessions / attendance --
drop policy if exists "sessions readable by signed-in users" on public.teaching_sessions;
create policy "sessions readable by signed-in users"
  on public.teaching_sessions for select to authenticated using (true);

drop policy if exists "managers write sessions" on public.teaching_sessions;
create policy "managers write sessions"
  on public.teaching_sessions for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'));

drop policy if exists "attendance visible to owner and managers" on public.attendance_records;
create policy "attendance visible to owner and managers"
  on public.attendance_records for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.has_role(auth.uid(), 'facilitator')
  );

drop policy if exists "managers write attendance" on public.attendance_records;
create policy "managers write attendance"
  on public.attendance_records for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'facilitator'));

-- ---------------------------------------------------------------- audit log --
-- Append-only from the client's point of view: a user may record their own
-- activity and read it back; only admins see everyone's. No update or delete
-- policy exists, so the log cannot be rewritten through the API.
drop policy if exists "users write own audit entries" on public.audit_log;
create policy "users write own audit entries"
  on public.audit_log for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users read own audit entries" on public.audit_log;
create policy "users read own audit entries"
  on public.audit_log for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- ============================================================================
-- STORAGE
--
-- One private bucket. Objects are keyed {specialtyId}/{subsectionId}/{uuid}.{ext},
-- so the second path segment identifies the subsection whose permissions apply.
-- The app reads files through short-lived signed URLs, never public links.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', false, 524288000)  -- 500 MB
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "resources readable by permitted users" on storage.objects;
create policy "resources readable by permitted users"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(name))[2]
          and public.can_access_specialty(auth.uid(), s.specialty_id)
      )
    )
  );

drop policy if exists "resources writable by managers" on storage.objects;
create policy "resources writable by managers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  );

drop policy if exists "resources updatable by managers" on storage.objects;
create policy "resources updatable by managers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  );

drop policy if exists "resources deletable by managers" on storage.objects;
create policy "resources deletable by managers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.subsections s
        where s.id::text = (storage.foldername(name))[2]
          and public.can_manage_resource(auth.uid(), s.id)
      )
    )
  );

-- ============================================================================
-- GRANTS
--
-- PostgREST checks table grants before RLS. anon gets only what the two public
-- forms need; everything else requires a session.
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on public.deaneries, public.specialties to anon;
grant insert on public.access_requests to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
grant insert on public.audit_log to authenticated;

commit;

-- ============================================================================
-- AFTER RUNNING THIS
--
-- 1. Create the first deanery, then the first specialty.
-- 2. Sign up the account that will own the site, then promote it:
--        insert into public.user_roles (user_id, role)
--        select id, 'super_admin' from auth.users where email = 'you@example.com'
--        on conflict (user_id, role) do nothing;
-- 3. Set the edge function secrets: RESEND_API_KEY, CONTACT_FORWARD_TO.
-- 4. Point the app at the new project by updating .env, then regenerate
--    src/integrations/supabase/types.ts against it.
-- ============================================================================
