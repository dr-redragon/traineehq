#!/usr/bin/env bash
#
# Verify the register tenancy migration against a throwaway PostgreSQL 16
# database, the same way supabase/schema/0001_traineehq_baseline.sql was verified
# (see supabase/schema/README.md).
#
# It builds a scratch cluster in a temp directory, applies stubs for the
# Supabase-managed auth and storage schemas, then the baseline, then the
# migration, then the assertions — and throws the cluster away afterwards.
# Nothing touches a real Supabase project.
#
#   ./scripts/verify-register-schema.sh
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). On Debian/Ubuntu:
#   apt-get install postgresql-16
#
# PostgreSQL refuses to run as root, so when invoked as root this re-runs the
# cluster under the `postgres` system account.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55432}"

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/register-verify.XXXXXX)"
PGDATA="$WORKDIR/data"
SOCKET="$WORKDIR/sock"
mkdir -p "$SOCKET"

# The cluster must be readable and writable by whoever ends up running it.
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

PSQL="psql -h $SOCKET -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"

# The assertion file switches roles with SET LOCAL ROLE, so it has to connect as
# a superuser; the roles it becomes are the unprivileged anon/authenticated.
step() {
  echo "==> $1"
  if [ -n "$RUNAS" ]; then
    su "$RUNAS" -c "$PSQL -f $2"
  else
    $PSQL -f "$2"
  fi
}

step "stubs (auth, storage)"            "$REPO_ROOT/supabase/schema/test/stubs.sql"
step "baseline schema"                  "$REPO_ROOT/supabase/schema/0001_traineehq_baseline.sql"
step "register tenancy migration"       "$REPO_ROOT/supabase/migrations/20260907090000_register_multi_tenancy.sql"

echo "==> re-running the migration (idempotency)"
if [ -n "$RUNAS" ]; then
  su "$RUNAS" -c "$PSQL -f $REPO_ROOT/supabase/migrations/20260907090000_register_multi_tenancy.sql"
else
  $PSQL -f "$REPO_ROOT/supabase/migrations/20260907090000_register_multi_tenancy.sql"
fi

step "assertions"                       "$REPO_ROOT/supabase/schema/test/register-assertions.sql"

echo
echo "PASS — register schema verified."
