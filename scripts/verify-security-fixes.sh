#!/usr/bin/env bash
#
# Verify the October 2026 security fixes against a throwaway PostgreSQL 16
# database, the same way verify-register-schema.sh verifies the register.
#
# Builds the database the way production was built — stubs, the baseline, then
# EVERY migration in filename order — re-applies the new migrations to prove
# they are idempotent, then runs each assertion file as the users it names.
# Nothing touches a real project.
#
#   ./scripts/verify-security-fixes.sh
#
# Requires PostgreSQL 16 server binaries (initdb, pg_ctl). PostgreSQL refuses
# to run as root, so when invoked as root the cluster runs as `postgres`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55434}"

SCHEMA="$REPO_ROOT/supabase/schema"
MIGRATIONS="$REPO_ROOT/supabase/migrations"

# The migrations under test, re-applied for idempotency.
NEW_MIGRATIONS=(
  20261011090000_resources_storage_object_path.sql
  20261011100000_register_checkin_hardening.sql
  20261011110000_deanery_scoped_admins.sql
  20261011120000_link_scheme_constraints.sql
)

ASSERTIONS=(
  storage-assertions.sql
  register-checkin-assertions.sql
  deanery-admin-assertions.sql
  link-scheme-assertions.sql
)

[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORKDIR="$(mktemp -d /tmp/security-verify.XXXXXX)"
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

run "$PGBIN/createdb -h $SOCKET -p $PORT -U postgres security"

echo "==> schema"
apply security "$SCHEMA/test/stubs.sql"
apply security "$SCHEMA/0001_traineehq_baseline.sql"
for f in "$MIGRATIONS"/*.sql; do
  apply security "$f"
done

echo "==> idempotency"
for f in "${NEW_MIGRATIONS[@]}"; do
  apply security "$MIGRATIONS/$f"
done

echo "==> assertions"
for f in "${ASSERTIONS[@]}"; do
  apply security "$SCHEMA/test/$f"
done

echo
echo "PASS — security fixes verified."
