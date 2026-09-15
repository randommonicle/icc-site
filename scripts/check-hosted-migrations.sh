#!/usr/bin/env bash
# Does hosted Supabase carry every local migration? Exit 0 = yes. Exit 1 = no, OR could
# not tell: this FAILS CLOSED, because "could not check" and "checked, missing" must both
# stop a deploy. Called by .githooks/pre-push for a push to main (L-040: the 2026-09-14
# push deployed code whose migrations were not applied, and nothing stood in its way).
# Also usable by hand:  bash scripts/check-hosted-migrations.sh
#
# The only signal the repo-pinned CLI gives is its human-readable table, so the parse is
# STRICT: the header, the separator and every row must match the known shape, or the
# answer is "not recognised" and the push is refused. A CLI upgrade that changes the
# table therefore blocks pushes loudly rather than passing them quietly.
#
# There is deliberately no env-var bypass. `git push --no-verify` is the one override,
# and it is visible in the shell history.

# stdin: the CLI's stdout. Prints the verdict; returns 0 (all carried) or 1 (otherwise).
parse_migration_table() {
  local line state=0 missing="" remote_only="" rows=0 l r
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$state" in
      0)
        if [[ "$line" =~ ^[[:space:]]*Local[[:space:]]*[|][[:space:]]*Remote[[:space:]]*[|][[:space:]]*Time[[:space:]]*[(]UTC[)][[:space:]]*$ ]]; then
          state=1
        elif [[ "$line" =~ ^[[:space:]]*$ ]]; then
          :
        else
          echo "PUSH BLOCKED: migration-list output was not recognised (unexpected line before the table: '$line')"
          return 1
        fi ;;
      1)
        if [[ "$line" =~ ^[[:space:]]*-+[|]-+[|]-+[[:space:]]*$ ]]; then
          state=2
        else
          echo "PUSH BLOCKED: migration-list output was not recognised (no separator after the header)"
          return 1
        fi ;;
      2)
        if [[ "$line" =~ ^[[:space:]]*([0-9]{14})?[[:space:]]*[|][[:space:]]*([0-9]{14})?[[:space:]]*[|] ]]; then
          rows=$((rows + 1))
          l="${BASH_REMATCH[1]}"; r="${BASH_REMATCH[2]}"
          if [ -n "$l" ] && [ -z "$r" ]; then missing="$missing $l"; fi
          if [ -z "$l" ] && [ -n "$r" ]; then remote_only="$remote_only $r"; fi
        elif [[ "$line" =~ ^[[:space:]]*$ ]]; then
          :
        else
          echo "PUSH BLOCKED: migration-list output was not recognised (unexpected row: '$line')"
          return 1
        fi ;;
    esac
  done
  if [ "$state" -ne 2 ]; then
    echo "PUSH BLOCKED: migration-list output was not recognised (no Local | Remote table found)"
    return 1
  fi
  if [ -n "$remote_only" ]; then
    echo "WARNING: hosted carries migrations this checkout lacks:$remote_only (is this checkout up to date?)"
  fi
  if [ -n "$missing" ]; then
    echo "PUSH BLOCKED: hosted Supabase is missing migrations:$missing"
    echo "Apply them (bash scripts/db-push.sh) or, for one already applied by hand, record it (bash scripts/db-migration-repair.sh <version>), then push again."
    return 1
  fi
  echo "OK: hosted Supabase carries all $rows local migrations"
  return 0
}

main() {
  local root out
  . "$(dirname "${BASH_SOURCE[0]}")/db-env.sh"
  icc_db_env || { echo "PUSH BLOCKED: cannot verify hosted migrations: $ICC_DB_ERR"; return 1; }
  root=$(git rev-parse --show-toplevel)
  if ! out=$(cd "$root" && npx --no-install supabase migration list --db-url "$ICC_DB_URL" 2>/dev/null); then
    echo "PUSH BLOCKED: 'supabase migration list' failed (CLI not installed? run npm install at the repo root; network down?)"
    return 1
  fi
  printf '%s\n' "$out" | parse_migration_table
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
  exit $?
fi
