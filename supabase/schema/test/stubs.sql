-- Stubs for the Supabase-managed schemas, so the baseline and the register
-- migration can be executed against a plain PostgreSQL 16 database.
--
-- Only what those scripts actually touch is stubbed. auth.uid() reads a session
-- setting, which is what lets the assertions in verify-register-schema.sh switch
-- between users and exercise RLS as each of them.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- PostgREST connects as one of these; the grants and policies name them.
do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;  exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  -- handle_new_user() reads first_name/last_name out of this.
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- In Supabase this reads the `sub` claim of the request's JWT. Here it reads a
-- session GUC so a test can become any user with `set local`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean,
  file_size_limit    bigint,
  -- Carried by the real storage.buckets, and written by the certificate-logo
  -- migrations of both registers. Added here so those migrations can be
  -- verified rather than skipped.
  allowed_mime_types text[]
);

-- A cluster created before the column existed still needs it.
alter table storage.buckets add column if not exists allowed_mime_types text[];

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on auth.users to authenticated;

-- ----------------------------------------------------------------------------
-- Supabase's default privileges
--
-- A real Supabase project ships with these, so every table and function created
-- afterwards is granted to anon and authenticated unless a migration says
-- otherwise. Reproducing them here is the difference between a test database
-- that behaves like production and one that flatters it: without these lines the
-- "anon cannot select X" assertions pass because nothing granted anon anything,
-- which proves the test fixture rather than the migration.
--
-- This was not hypothetical. Stages 1 and 7 both claimed "anon gets nothing at
-- all here", both passed against a stub database without these grants, and both
-- were wrong on the live project — RLS still withheld every row, but the grant
-- underneath was there. 20260907130000 revokes them explicitly.
-- ----------------------------------------------------------------------------
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
