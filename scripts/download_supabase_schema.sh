#!/usr/bin/env bash
set -euo pipefail

# ===== Config (public-only baseline) =====
export PGHOST="aws-1-ap-northeast-1.pooler.supabase.com"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres.bynmfoilackhtavlmyre"

# Use pg_dump 17 (Supabase server is 17.x). Adjust if your path differs.
PG_DUMP="/usr/lib/postgresql/17/bin/pg_dump"

echo "[1/6] Check tools..."
command -v psql >/dev/null 2>&1 || { echo "psql not found. Install: sudo apt install -y postgresql-client"; exit 1; }
test -x "$PG_DUMP" || { echo "pg_dump 17 not found at $PG_DUMP. Install: sudo apt install -y postgresql-client-17"; exit 1; }

mkdir -p .tmp

echo "[2/6] Connectivity check (psql select 1)..."
psql -c "select 1;" >/dev/null

echo "[3/6] Dump public schema..."
"$PG_DUMP" --schema-only --no-owner --no-privileges -n public -f .tmp/schema.public.remote.sql

echo "[4/6] Gate diff (ignore \\restrict/\\unrestrict tokens)..."
grep -vE '^(\\restrict|\\unrestrict)\b' db_schema.txt > .tmp/schema.baseline.clean.sql || true
grep -vE '^(\\restrict|\\unrestrict)\b' .tmp/schema.public.remote.sql > .tmp/schema.remote.clean.sql

if diff -q .tmp/schema.baseline.clean.sql .tmp/schema.remote.clean.sql >/dev/null 2>&1; then
  echo "OK: No schema changes (clean diff)."
  exit 0
fi

echo "[5/6] Changes detected -> update baseline db_schema.txt"
cp .tmp/schema.public.remote.sql db_schema.txt

echo "[6/6] Reminder: update ERD PNG manually"
echo "-> Supabase Dashboard > Database > Schema Visualizer > Export/Download PNG"
echo "-> Overwrite: supabase-schema-bynmfoilackhtavlmyre.png"
echo "Then commit:"
echo "  git add db_schema.txt supabase-schema-bynmfoilackhtavlmyre.png && git commit -m \"chore(schema): refresh baseline\""
