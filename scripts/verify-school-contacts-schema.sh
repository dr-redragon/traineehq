#!/usr/bin/env bash
#
# Verify school-scoped key contacts against a throwaway PostgreSQL 16 database,
# the same way verify-contacts-schema.sh verifies who may write contacts.
#
# Builds the database the way production was built — stubs, the baseline, every
# migration before 20261023090000_school_scoped_contacts.sql — loads a North
# West fixture as the live data would stand, applies that migration twice (for
# idempotency), then runs supabase/schema/test/school-contacts-assertions.sql.
# Nothing touches a real project.
#
#   ./scripts/verify-school-contacts-schema.sh
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). PostgreSQL refuses
# to run as root, so when invoked as root the cluster runs as `postgres`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55435}"

SCHEMA="$REPO_ROOT/supabase/schema"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
SCHOOLS="20261023090000_school_scoped_contacts.sql"

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/school-contacts-verify.XXXXXX)"
PGDATA="$WORKDIR/data"
SOCKET="$WORKDIR/sock"
mkdir -p "$SOCKET"

RUNAS=""
if [ "$(id -u)" = "0" ]; then
  RUNAS="postgres"
  chown -R postgres:postgres "$WORKDIR"
  chmod -R a+rX "$REPO_ROOT/supabase"
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

run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres schools"

echo "==> schema up to the school contacts migration"
apply schools "$SCHEMA/test/stubs.sql"
apply schools "$SCHEMA/0001_traineehq_baseline.sql"
for f in "$MIGRATIONS"/*.sql; do
  [[ "$(basename "$f")" < "$SCHOOLS" ]] || continue
  apply schools "$f"
done

echo "==> school contacts"
apply schools "$SCHEMA/test/school-contacts-fixture.sql"
apply schools "$MIGRATIONS/$SCHOOLS"
echo "  - re-applying the school contacts migration (idempotency)"
psql_as schools -f "$MIGRATIONS/$SCHOOLS"
apply schools "$SCHEMA/test/school-contacts-assertions.sql"

echo
echo "PASS — school contacts verified."
