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
  id              text primary key,
  name            text,
  public          boolean,
  file_size_limit bigint
);

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
