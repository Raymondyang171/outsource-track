#!/usr/bin/env bash
set -euo pipefail

# This script updates the db_schema.txt file with the current public schema from the Supabase database.

# ===== Config (public-only baseline) =====
export PGHOST="aws-1-ap-northeast-1.pooler.supabase.com"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres.bynmfoilackhtavlmyre"
export PGPASSFILE
PGPASSFILE="$(pwd)/../.tmp/pgpass.conf"

# Use pg_dump 17 (Supabase server is 17.x). Adjust if your path differs.
PG_DUMP="/usr/lib/postgresql/17/bin/pg_dump"

echo "[1/3] Check tools..."
command -v psql >/dev/null 2>&1 || { echo "psql not found. Install: sudo apt install -y postgresql-client"; exit 1; }
test -x "$PG_DUMP" || { echo "pg_dump 17 not found at $PG_DUMP. Install: sudo apt install -y postgresql-client-17"; exit 1; }
test -f "$PGPASSFILE" || { echo "pgpass.conf not found at $PGPASSFILE"; exit 1; }

echo "[2/3] Connectivity check (psql select 1)..."
psql -c "select 1;" >/dev/null

echo "[3/3] Dump public schema to db_schema.txt..."
"$PG_DUMP" --schema-only --no-owner --no-privileges -n public > db_schema.txt

echo "✅ Done. db_schema.txt has been updated."
echo "Reminder: also update ERD PNG manually if there are table changes."
echo "-> Supabase Dashboard > Database > Schema Visualizer > Export/Download PNG"
echo "-> Overwrite: supabase-schema-bynmfoilackhtavlmyre.png"

