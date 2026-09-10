#!/usr/bin/env bash
#
# Verify the CLASSIC teaching register's schema — the second, independent
# register added by 20260909120000_classic_teaching_register.sql — against a
# throwaway PostgreSQL 16 database, exactly as scripts/verify-register-schema.sh
# does for the first one.
#
# The point of this script is fidelity. The classic migration is a mechanical
# mirror of the migrations that built the first register, so it is held to a
# mechanical mirror of that register's own assertions: supabase/schema/test/
# classic-*.sql are the register's assertion files with the same identifiers
# renamed. If the copy passes the original's tests, the copy behaves like the
# original.
#
#   ./scripts/verify-classic-register-schema.sh
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). On Debian/Ubuntu:
#   apt-get install postgresql-16
#
# PostgreSQL refuses to run as root, so when invoked as root this runs the
# cluster under the `postgres` system account.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55433}"

SCHEMA="$REPO_ROOT/supabase/schema"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
CLASSIC="$MIGRATIONS/20260909120000_classic_teaching_register.sql"

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/classic-register-verify.XXXXXX)"
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

psql_as() {
  local db="$1"; shift
  local cmd="psql -h $SOCKET -p $PORT -U postgres -d $db -v ON_ERROR_STOP=1 -q $*"
  if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$cmd"; else bash -c "$cmd"; fi
}

apply() { echo "  - $(basename "$2")"; psql_as "$1" -f "$2"; }

run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres classic"

echo "==> classic register"
apply classic "$SCHEMA/test/stubs.sql"
apply classic "$SCHEMA/0001_traineehq_baseline.sql"

# The live register's own migrations are applied first, so the classic schema is
# verified in the database it actually ships into — one that already carries the
# register it is meant to sit beside. A name collision between the two would fail
# here rather than in production.
for m in 20260907090000_register_multi_tenancy \
         20260907110000_register_access_admin \
         20260907120000_register_live_sessions \
         20260907130000_register_grants_lockdown \
         20260907140000_register_api_functions \
         20260907150000_registers_per_deanery \
         20260909090000_register_certificate_logo; do
  apply classic "$MIGRATIONS/$m.sql"
done

apply classic "$CLASSIC"
echo "  - re-applying the classic migration (idempotency)"
psql_as classic -f "$CLASSIC"

apply classic "$SCHEMA/test/classic-register-assertions.sql"
apply classic "$SCHEMA/test/classic-access-admin-assertions.sql"
apply classic "$SCHEMA/test/classic-live-sessions-assertions.sql"
apply classic "$SCHEMA/test/classic-grants-assertions.sql"
apply classic "$SCHEMA/test/classic-api-functions-assertions.sql"
apply classic "$SCHEMA/test/classic-per-deanery-assertions.sql"

# Last, and most important on a live system: the copy left the original alone.
apply classic "$SCHEMA/test/classic-isolation-assertions.sql"

echo
echo "PASS — classic register schema verified."
