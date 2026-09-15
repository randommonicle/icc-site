#!/usr/bin/env bash
# Apply pending Supabase migrations to hosted via the aws-1-eu-west-2 SESSION POOLER.
#
# The connection (project ref + DB password from .env, percent-encoded, session pooler
# because the direct host is IPv6-only and the checkout is not linked) is built by
# scripts/db-env.sh, shared with db-migration-repair.sh and check-hosted-migrations.sh.
# No secrets are printed or committed; they stay in .env.
#
# Run from anywhere:  bash scripts/db-push.sh            (lists pending, prompts, applies)
#                     bash scripts/db-push.sh --dry-run  (lists what WOULD be applied)
#
# A migration that was applied by hand and is therefore Local-only in `migration list`
# although its objects exist must be RECORDED first (scripts/db-migration-repair.sh), or
# this re-runs it and a non-idempotent statement fails. Uses the repo-pinned CLI
# (package.json devDependency), never a global one.

set -u
. "$(dirname "$0")/db-env.sh"
icc_db_env || { echo "ERROR: $ICC_DB_ERR" >&2; exit 1; }
cd "$(dirname "$0")/.." || exit 1

echo "Pushing pending migrations to project '$ICC_DB_REF' via the aws-1-eu-west-2 session pooler..."
npx --no-install supabase db push --db-url "$ICC_DB_URL" "$@"
