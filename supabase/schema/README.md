# Database schema

`0001_traineehq_baseline.sql` builds the entire TraineeHQ database from nothing:
extensions, enums, all 23 application tables, constraints, indexes, triggers, the
security-definer helpers, row-level security policies, the storage bucket and its
policies, and the role grants.

It exists so the app can run on a Supabase project you own, rather than the
Lovable-managed one it was generated against.

## Why this is a separate folder from `migrations/`

`supabase/migrations/` is the incremental history of the *original* Lovable
project. Only two files were ever committed there, so that history does not
describe the live schema and cannot rebuild it. This folder holds the whole
schema as one script instead.

Once you are running on your own project, this file is the starting point and
`migrations/` becomes the ongoing history again — add new changes there.

## Where it came from, and what to check

The tables, columns, enums and foreign keys are reconstructed from
`src/integrations/supabase/types.ts`, which Supabase generates from the live
schema, so they match it exactly (verified column-for-column).

**The RLS policies are not a copy — they could not be.** The original project's
policies were never in version control and are not readable through the API. They
are written here from the access rules the application actually relies on:

| Role | Sees | Can change |
|---|---|---|
| `super_admin` | every deanery | everything, incl. minting other super admins |
| `admin` | their own deanery | all content, contacts, users in it |
| `facilitator` | specialties assigned to them | content in those specialties |
| `trainee` | specialties they are enrolled on | their own bookmarks, posts, votes, profile |

Anonymous access is limited to exactly what the two public forms need: reading
active deaneries and specialties, and inserting a pending `access_requests` row.

Read the policy section before you put real data behind it. RLS is the *only*
authorisation boundary in this app — the route guards in the React app are
convenience, not security.

## Running it

Against a new project, in the SQL editor or via `psql`:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/schema/0001_traineehq_baseline.sql
```

It is idempotent, so a partial run can be repeated. The closing comment block
lists the four follow-up steps (first deanery, first super admin, function
secrets, repointing `.env`).

## How it was verified

Executed against a throwaway PostgreSQL 16 database with stubs standing in for
the Supabase-managed `auth` and `storage` schemas:

- runs clean end to end, and again on a second run (idempotent);
- all 23 tables match `types.ts` column-for-column;
- all 5 enums match label-for-label;
- every `public` table has RLS enabled and forced; 59 policies created;
- the access helpers were exercised against a fixture of two deaneries, a nested
  specialty and five users — 16 assertions covering super admin, cross-deanery
  admin, facilitator, enrolled trainee and outsider, all passing;
- deleting an `auth.users` row cascades to the profile, roles, enrolments and
  bookmarks, which the original schema did not do.

What that does **not** cover: the policies were verified through the helper
functions, not by connecting as `anon` and `authenticated` through PostgREST.
Smoke-test the running app against the new project before cutting over.
