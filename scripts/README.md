# Scripts

Standalone tooling, independent of the app — nothing imports any of it.

- **`verify-register-schema.sh`** — checks the register tenancy migration against
  a throwaway database. No credentials, nothing to point at.
- **`migrate-database.mjs`**, **`migrate-storage.mjs`** — move TraineeHQ from one
  Supabase project to another. Node 18+ and `npm install` (they use `pg` and
  `@supabase/supabase-js`).

---

## verify-register-schema.sh

```sh
./scripts/verify-register-schema.sh
```

Builds a scratch PostgreSQL 16 cluster in a temp directory, applies stubs for the
Supabase-managed `auth` and `storage` schemas, then the baseline, then
`supabase/migrations/20260907090000_register_multi_tenancy.sql`, then the
assertions in `supabase/schema/test/register-assertions.sql` — and deletes the
cluster afterwards. It never touches a real project, so it is safe to run
anywhere and needs no secrets.

It re-runs the migration a second time to prove it is idempotent, then asserts
the access rules the multi-register design depends on, connecting as the same
`anon` and `authenticated` roles PostgREST uses:

- membership is an explicit grant — enrolment on a specialty confers nothing, and
  a `super_admin` reads no register data until granted;
- the directory is browsable by someone with no access at all (which is why it is
  a security-definer function and not a view);
- nobody approves their own request for access, at either layer;
- the last owner of a register cannot be removed;
- the blob can only be written through `save_register()`, and a write built on a
  stale read is refused rather than silently winning.

Requires the PostgreSQL 16 server binaries (`initdb`, `pg_ctl`) — on
Debian/Ubuntu, `apt-get install postgresql-16`. Set `PGBIN` if they live
somewhere other than `/usr/lib/postgresql/16/bin`.

---

## Migrating between projects

Two scripts for moving TraineeHQ from one Supabase project to another. They can
be run against any pair of projects that share the schema in `supabase/schema/`.

### Order

1. Run `supabase/schema/0001_traineehq_baseline.sql` against the empty target.
2. `migrate-database.mjs` — rows, including auth users.
3. `migrate-storage.mjs` — the files those rows point at.

Both are safe to re-run and both take `--dry-run`.

### migrate-database.mjs

```sh
SOURCE_DATABASE_URL='postgres://...' \
TARGET_DATABASE_URL='postgres://...' \
node scripts/migrate-database.mjs --dry-run

# then, for real
SOURCE_DATABASE_URL='postgres://...' \
TARGET_DATABASE_URL='postgres://...' \
node scripts/migrate-database.mjs
```

Connection strings come from **Project Settings → Database → Connection string**
in each project. They embed the database password — keep them out of the repo
and out of shell history (a leading space, or a `.env` file you never commit).

It copies `auth.users` and `auth.identities` first, **with password hashes**, so
everyone keeps their existing login and no one has to reset anything. Then every
public table, parents before children. Finally it reconciles `profiles` and
`user_roles`: the target's `on_auth_user_created` trigger invents a profile and a
`trainee` role for each user as they are inserted, and any such row the source
does not have is removed, so the result matches rather than being a superset.

It ends by comparing row counts table by table and exits non-zero on any
mismatch. `VERBOSE=1` prints every table, not just the differing ones.

Two details that will bite anyone writing this by hand: `auth.users.confirmed_at`
and `auth.identities.email` are **generated columns** and reject explicit values,
so the script builds its column list from `information_schema` and skips them.

### migrate-storage.mjs

```sh
SOURCE_SUPABASE_URL='https://<ref>.supabase.co' SOURCE_SERVICE_ROLE_KEY='...' \
TARGET_SUPABASE_URL='https://<ref>.supabase.co' TARGET_SERVICE_ROLE_KEY='...' \
node scripts/migrate-storage.mjs --dry-run
```

Service-role keys come from **Project Settings → API**. They bypass RLS
entirely — treat them as passwords, and rotate them if they are ever exposed.

By default it copies only files a `resources` row actually points at. **This is
almost always what you want.** Deleting a resource in this app has never deleted
its storage object, so a long-lived bucket fills with orphans: on the project
this was written against, 212 of 223 objects were unreferenced — 167 MB of the
167.4 MB total, against 70 KB of live files. Pass `--all` to copy everything
anyway.

It handles both `file_url` formats: bare bucket paths, and the older rows that
stored a full public URL — including one that pointed at a *different* Supabase
project altogether. Anything that is a genuinely external link is left alone.

Files already in the target are skipped, uploads use `upsert`, and referenced
paths missing from the source bucket are reported rather than failing the run —
those are rows pointing at a file that was deleted underneath them.
