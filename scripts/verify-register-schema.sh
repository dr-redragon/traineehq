#!/usr/bin/env bash
#
# Verify the register migrations against a throwaway PostgreSQL 16 database, the
# same way supabase/schema/0001_traineehq_baseline.sql was verified (see
# supabase/schema/README.md).
#
# It builds a scratch cluster in a temp directory, applies stubs for the
# Supabase-managed auth and storage schemas, and runs two independent scenarios
# in two databases — then throws the cluster away. Nothing touches a real
# Supabase project and no credentials are needed.
#
#   ./scripts/verify-register-schema.sh
#
#   A  tenancy   the access rules of 20260907090000_register_multi_tenancy.sql,
#                exercised as the anon and authenticated roles PostgREST uses.
#                Ends by running the seed migration with no operator account
#                present, which must apply cleanly and change nothing.
#
#   B  seed      20260907100000_seed_first_register.sql against a project that
#                still carries the legacy public.register_store table.
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). On Debian/Ubuntu:
#   apt-get install postgresql-16
#
# PostgreSQL refuses to run as root, so when invoked as root this runs the
# cluster under the `postgres` system account.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55432}"

SCHEMA="$REPO_ROOT/supabase/schema"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
TENANCY="$MIGRATIONS/20260907090000_register_multi_tenancy.sql"
SEED="$MIGRATIONS/20260907100000_seed_first_register.sql"

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/register-verify.XXXXXX)"
PGDATA="$WORKDIR/data"
SOCKET="$WORKDIR/sock"
mkdir -p "$SOCKET"

RUNAS=""
if [ "$(id -u)" = "0" ]; then
  RUNAS="postgres"
  chown -R postgres:postgres "$WORKDIR"
fi

run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$*"; else bash -c "$*"; fi; }

cleanup() {
  run "$PGBIN/pg_ctl -D $PGDATA -s -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "==> initdb"
run "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null

echo "==> starting cluster on port $PORT"
run "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORT -k $SOCKET -c listen_addresses=' -w -s start"

# The assertion files switch roles with SET LOCAL ROLE, so they connect as a
# superuser; the roles they become are the unprivileged anon and authenticated.
psql_as() {
  local db="$1"; shift
  local cmd="psql -h $SOCKET -p $PORT -U postgres -d $db -v ON_ERROR_STOP=1 -q $*"
  if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$cmd"; else bash -c "$cmd"; fi
}

apply() { echo "  - $(basename "$2")"; psql_as "$1" -f "$2"; }

run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres tenancy"
run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres seed"

# ---------------------------------------------------------------- scenario A --
echo "==> A  tenancy"
apply tenancy "$SCHEMA/test/stubs.sql"
apply tenancy "$SCHEMA/0001_traineehq_baseline.sql"
apply tenancy "$TENANCY"
echo "  - re-applying the tenancy migration (idempotency)"
psql_as tenancy -f "$TENANCY"
apply tenancy "$SCHEMA/test/register-assertions.sql"

# The seed migration on a project where the operator has not signed up. It must
# apply cleanly and leave the tenancy scenario's own register untouched.
echo "  - seed migration with no operator account"
psql_as tenancy -f "$SEED"
psql_as tenancy -f "$SCHEMA/test/seed-noop-assertions.sql"

# ---------------------------------------------------------------- scenario B --
echo "==> B  seed"
apply seed "$SCHEMA/test/stubs.sql"
apply seed "$SCHEMA/0001_traineehq_baseline.sql"
apply seed "$SCHEMA/test/seed-fixture.sql"
apply seed "$TENANCY"
apply seed "$SEED"
echo "  - re-applying the seed migration (idempotency)"
psql_as seed -f "$SEED"
apply seed "$SCHEMA/test/seed-assertions.sql"

echo
echo "PASS — register schema verified."
