#!/usr/bin/env bash
#
# Verify the access-request rules, against a throwaway PostgreSQL 16 database,
# the same way verify-contacts-schema.sh verifies key contacts.
#
# Applies the baseline, the subheadings and withdrawn-specialties migrations, and
# 20261011090000_access_request_improvements.sql (twice, for idempotency), then
# runs supabase/schema/test/access-request-improvements-assertions.sql.
# Nothing touches a real project.
#
#   ./scripts/verify-access-requests-schema.sh
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). PostgreSQL refuses
# to run as root, so when invoked as root the cluster runs as `postgres`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55434}"

SCHEMA="$REPO_ROOT/supabase/schema"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
SUBHEADINGS="$MIGRATIONS/20260908180000_resource_subheadings.sql"
WITHDRAWN="$MIGRATIONS/20260920120000_withdrawn_specialties_unreadable.sql"
REQUESTS="$MIGRATIONS/20261011090000_access_request_improvements.sql"
# Supersedes the existing-account refusal with a silent drop (no enumeration).
NO_ENUM="$MIGRATIONS/20261012110000_access_request_no_enumeration.sql"

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/access-requests-verify.XXXXXX)"
PGDATA="$WORKDIR/data"
SOCKET="$WORKDIR/sock"
mkdir -p "$SOCKET"

RUNAS=""
if [ "$(id -u)" = "0" ]; then
  RUNAS="postgres"
  chown -R postgres:postgres "$WORKDIR"
  # The cluster user has to be able to read the SQL it is handed.
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

run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres requests"

echo "==> access requests"
apply requests "$SCHEMA/test/stubs.sql"
apply requests "$SCHEMA/0001_traineehq_baseline.sql"
apply requests "$SUBHEADINGS"
apply requests "$WITHDRAWN"
apply requests "$REQUESTS"
echo "  - re-applying the access requests migration (idempotency)"
psql_as requests -f "$REQUESTS"
apply requests "$NO_ENUM"
apply requests "$SCHEMA/test/access-request-improvements-assertions.sql"

echo
echo "PASS — access request rules verified."
