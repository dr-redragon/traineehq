#!/usr/bin/env bash
#
# Verify who may write key contacts, against a throwaway PostgreSQL 16 database,
# the same way verify-register-schema.sh verifies the register.
#
# Applies the baseline, the migrations that last rewrote the contacts read
# policy, and 20261010120000_facilitators_manage_specialty_contacts.sql (twice,
# for idempotency), then runs supabase/schema/test/contacts-assertions.sql as
# an admin, a facilitator and a trainee. Nothing touches a real project.
#
#   ./scripts/verify-contacts-schema.sh
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). PostgreSQL refuses
# to run as root, so when invoked as root the cluster runs as `postgres`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55433}"

SCHEMA="$REPO_ROOT/supabase/schema"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
SUBHEADINGS="$MIGRATIONS/20260908180000_resource_subheadings.sql"
WITHDRAWN="$MIGRATIONS/20260920120000_withdrawn_specialties_unreadable.sql"
CONTACTS="$MIGRATIONS/20261010120000_facilitators_manage_specialty_contacts.sql"

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/contacts-verify.XXXXXX)"
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

run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres contacts"

echo "==> contacts"
apply contacts "$SCHEMA/test/stubs.sql"
apply contacts "$SCHEMA/0001_traineehq_baseline.sql"
# The read policy the app runs under was last rewritten here, and that
# migration names a table the subheadings one creates.
apply contacts "$SUBHEADINGS"
apply contacts "$WITHDRAWN"
apply contacts "$CONTACTS"
echo "  - re-applying the contacts migration (idempotency)"
psql_as contacts -f "$CONTACTS"
apply contacts "$SCHEMA/test/contacts-assertions.sql"

echo
echo "PASS — contacts write policies verified."
