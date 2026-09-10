# Scripts

Standalone tooling, independent of the app — nothing imports any of it.

- **`verify-register-schema.sh`** — checks the register tenancy migration against
  a throwaway database. No credentials, nothing to point at.
- **`migrate-database.mjs`**, **`migrate-storage.mjs`** — move TraineeHQ from one
  Supabase project to another. Node 18+ and `npm install` (they use `pg` and
  `@supabase/supabase-js`).
- **`anonymise-register-import.sql`** — copy a register out of the standalone ENT
  project with every name, address and free-text reason replaced. Read-only
  against the source; returns the blob and a checksum to verify the copy.
- **`seed-classic-register.sql`** — fill a classic teaching register with a
  fictional cohort and three years of teaching days, so its features can be
  tested against something the size of a real programme.

---

## verify-register-schema.sh

```sh
./scripts/verify-register-schema.sh
```

Builds a scratch PostgreSQL 16 cluster in a temp directory, runs two independent
scenarios in two databases, and deletes the cluster afterwards. It never touches
a real project, so it is safe to run anywhere and needs no secrets. Every
migration is applied twice to prove it is idempotent.

**A — tenancy.** Stubs, the baseline, then
`20260907090000_register_multi_tenancy.sql`, then
`supabase/schema/test/register-assertions.sql`. Asserts the access rules the
multi-register design depends on, connecting as the same `anon` and
`authenticated` roles PostgREST uses:

- membership is an explicit grant — enrolment on a specialty confers nothing, and
  a `super_admin` reads no register data until granted;
- the directory is browsable by someone with no access at all (which is why it is
  a security-definer function and not a view);
- nobody approves their own request for access, at either layer;
- the last owner of a register cannot be removed;
- the blob can only be written through `save_register()`, and a write built on a
  stale read is refused rather than silently winning.

It ends by applying the seed migration to a project whose operator account does
not exist, which must apply cleanly and change nothing.

**B — seed.** The same, plus `supabase/schema/test/seed-fixture.sql`, which
recreates the legacy `public.register_store` table a live project still carries.
Then `20260907100000_seed_first_register.sql` and its assertions: the operator
becomes a `super_admin` and the sole owner of one register on the ENT specialty,
the legacy blob arrives intact, and a re-run neither duplicates anything nor
overwrites a register that has since been used.

Requires the PostgreSQL 16 server binaries (`initdb`, `pg_ctl`) — on
Debian/Ubuntu, `apt-get install postgresql-16`. Set `PGBIN` if they live
somewhere other than `/usr/lib/postgresql/16/bin`.

---

## seed-classic-register.sql

Demo data for one classic register: 14 fictional trainees, 19 teaching days
across 2024/25, 2025/26 and 2026/27, and the attendance, excusals and long-term
statuses that go with them.

```sh
psql "$DATABASE_URL" -f scripts/seed-classic-register.sql
```

or paste the file into the Supabase SQL editor. Set the slug on the line marked
`<<<` first — with a slug that matches nothing the script aborts and lists the
registers that do exist.

Everything it writes carries an id beginning `seed-`, and it rebuilds only those
rows. Trainees, days, marks, excusals and statuses you added yourself are read,
kept and written back untouched, so a re-run replaces the demo data rather than
doubling it. The commented block at the foot of the file removes the demo data
again and leaves your own rows behind.

The data is chosen to exercise the parts of the register that are easy to get
wrong rather than to look tidy: a maternity leave that has since expired, one
trainee out of programme now, an IDT in and an IDT out, a CCT, open-ended leave
with no end month, grades that differ between academic years, a few marks in the
bare `true` form the standalone register used before grade was captured, all ten
excusal reasons including a free-text one, two trainees with no email address,
and one day still in the future.

Names are invented and every address is on `example.com`, which is reserved for
documentation and accepts no mail — so a certificate run or a chaser sent from a
seeded register cannot reach anybody. Don't replace them with real addresses.

It writes the register's own document and nothing else. Publishing a day for
check-in is the edge function's job — do that from the Check-in tab against any
seeded day.

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
