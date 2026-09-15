#!/usr/bin/env bash
# Record ONE migration as applied in hosted history WITHOUT running its SQL.
#
# For a migration that was applied by hand (SQL editor, Management API, psql) and so shows
# Local-only in `supabase migration list` although its objects already exist. Left alone,
# `db push` re-runs it and a non-idempotent statement (create type ..., create table ...)
# fails before the genuinely pending migrations are reached. That was the 2026-09-06
# deposit migration on 2026-09-15 (L-040).
#
# VERIFY THE OBJECTS EXIST FIRST: every migration ends in a commented post-apply block of
# catalog queries; run those against hosted and only then record it. Recording a migration
# whose objects are missing hides the gap for good.
#
# Usage:  bash scripts/db-migration-repair.sh 20260906120000

set -u
v="${1:-}"
case "$v" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
  *) echo "usage: $0 <14-digit migration version>" >&2; exit 2 ;;
esac

. "$(dirname "$0")/db-env.sh"
icc_db_env || { echo "ERROR: $ICC_DB_ERR" >&2; exit 1; }
cd "$(dirname "$0")/.." || exit 1

if ! ls "supabase/migrations/${v}_"*.sql >/dev/null 2>&1; then
  echo "ERROR: no local migration supabase/migrations/${v}_*.sql" >&2
  exit 1
fi

echo "Recording $v as applied in project '$ICC_DB_REF' (history only; no SQL runs)..."
npx --no-install supabase migration repair --status applied "$v" --db-url "$ICC_DB_URL"
