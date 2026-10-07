#!/usr/bin/env bash
# Applies the stub + all migrations to a scratch database and runs the SQL tests.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-lumen_test}
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$P -d "$DB" -f supabase/tests/supabase_stub.sql 2>&1 | grep -v -E "wal_level|HINT" || true
for f in supabase/migrations/*.sql; do
  echo "migrate $(basename "$f")"
  $P -d "$DB" -f "$f"
done
for t in supabase/tests/test_*.sql; do
  echo "test $(basename "$t")"
  $P -d "$DB" -f "$t"
done
echo "all good"
