#!/usr/bin/env bash
#
# Apply the schema to a throwaway PostgreSQL 16 cluster and run the access and
# plan assertions in supabase/test/assertions.sql. Nothing touches a real
# Supabase project and no credentials are needed.
#
#   ./scripts/verify-schema.sh
#
# Requires the PostgreSQL 16 server binaries (apt-get install postgresql-16).
# PostgreSQL refuses to run as root, so as root this uses the `postgres` account.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-55433}"
[ -x "$PGBIN/initdb" ] || { echo "initdb not found in $PGBIN — set PGBIN"; exit 1; }

WORK="$(mktemp -d /tmp/register-verify.XXXXXX)"
mkdir -p "$WORK/sock" "$WORK/sql"
cp "$ROOT"/supabase/test/*.sql "$ROOT"/supabase/migrations/*.sql "$WORK/sql/"
chmod -R a+rX "$WORK"

RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="postgres"; chown -R postgres:postgres "$WORK"; fi
run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$*"; else bash -c "$*"; fi; }
trap 'run "$PGBIN/pg_ctl -D $WORK/data -s -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

run "$PGBIN/initdb -D $WORK/data -U postgres --auth=trust -E UTF8" >/dev/null
run "$PGBIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK/sock -c listen_addresses=' -w -s start"
run "$PGBIN/createdb -h $WORK/sock -p $PORT -U postgres verify"

sql() { run "psql -h $WORK/sock -p $PORT -U postgres -d verify -v ON_ERROR_STOP=1 -q -f $1" 2>&1 | grep -v "NOTICE:.*skipping" || true; }

echo "==> stubs for the Supabase-managed auth and storage schemas"
sql "$WORK/sql/stubs.sql"
for f in "$WORK"/sql/2*.sql; do
  echo "==> $(basename "$f")"; sql "$f"
  echo "    again (must be re-runnable)"; sql "$f"
done
echo "==> assertions"
OUT="$(sql "$WORK/sql/assertions.sql")"
echo "$OUT"
echo "$OUT" | grep -q "all schema assertions passed" || { echo "FAILED"; exit 1; }
