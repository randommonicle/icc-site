#!/usr/bin/env bash
# Source this, then call icc_db_env: it sets ICC_DB_REF and ICC_DB_URL from .env (never
# printed, never committed). The ONE place the hosted connection is built: db-push.sh,
# db-migration-repair.sh and check-hosted-migrations.sh all source it, so there is one
# construction to fix, not three.
#
# Where .env lives: the root of the current checkout, or, from a git worktree (whose root
# has no .env because it is gitignored and machine-local), the main worktree's root.
#
# Why the aws-1-eu-west-2 SESSION pooler: the project's direct DB host is IPv6-only
# (unreachable on an IPv4 network) and the working copy is not `supabase link`ed, so a
# plain `supabase db push` fails with "Cannot find project ref". Session mode (port 5432)
# keeps session state, which DDL needs; the transaction pooler (6543) does not.
#
# Returns 1 with ICC_DB_ERR set when the values cannot be read, so a caller can fail
# closed with a real message instead of a confusing connection error.

icc_db_env() {
  ICC_DB_ERR=""
  local root common env ref pw enc
  root=$(git rev-parse --show-toplevel 2>/dev/null) || { ICC_DB_ERR="not inside a git checkout"; return 1; }
  env="$root/.env"
  if [ ! -f "$env" ]; then
    # A worktree: .git is a file, and --git-common-dir names the main checkout's .git
    # (absolute from a worktree, the bare ".git" from the main checkout itself).
    common=$(cd "$root" && git rev-parse --git-common-dir 2>/dev/null)
    case "$common" in /*|[A-Za-z]:*) ;; *) common="$root/$common" ;; esac
    env="$(dirname "$common")/.env"
  fi
  if [ ! -f "$env" ]; then
    ICC_DB_ERR="no .env at $root/.env (nor at the main worktree's root); on this machine it must hold SUPABASE_URL and SUPABASE_DB_PASSWORD"
    return 1
  fi
  ref=$(grep -E '^SUPABASE_URL=' "$env" | sed -E 's#.*://([^.]+)\..*#\1#' | tr -d '\r')
  pw=$(grep -E '^SUPABASE_DB_PASSWORD=' "$env" | cut -d= -f2- | tr -d "\"'" | tr -d '\r')
  if [ -z "$ref" ] || [ -z "$pw" ]; then
    ICC_DB_ERR="could not read SUPABASE_URL / SUPABASE_DB_PASSWORD from $env"
    return 1
  fi
  # Percent-encode the password so a special character (@ : / # ? space) cannot break the
  # connection URL. % must be encoded first.
  enc=$(printf '%s' "$pw" \
    | sed -e 's/%/%25/g' -e 's/@/%40/g' -e 's/:/%3A/g' -e 's#/#%2F#g' \
          -e 's/#/%23/g' -e 's/?/%3F/g' -e 's/ /%20/g')
  ICC_DB_REF="$ref"
  ICC_DB_URL="postgresql://postgres.${ref}:${enc}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
  return 0
}
