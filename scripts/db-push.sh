#!/usr/bin/env bash
# Apply pending Supabase migrations via the aws-1-eu-west-2 SESSION POOLER.
#
# Why this exists instead of a plain `supabase db push`: the project's direct DB host
# is IPv6-only (unreachable on an IPv4 network) and the working copy is not `supabase
# link`ed, so a plain push fails with "Cannot find project ref". This reads the project
# ref + DB password from .env, percent-encodes the password, and pushes through the
# session pooler. No secrets are printed or committed; they stay in .env.
#
# Run from anywhere:  bash scripts/db-push.sh
# It will list the pending migrations and prompt before applying.

cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd) — run this from inside the icc-site repo." >&2
  exit 1
fi

REF=$(grep -E '^SUPABASE_URL=' .env | sed -E 's#.*://([^.]+)\..*#\1#')
PW=$(grep -E '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2- | tr -d "\"'")

if [ -z "$REF" ] || [ -z "$PW" ]; then
  echo "ERROR: could not read SUPABASE_URL / SUPABASE_DB_PASSWORD from .env" >&2
  exit 1
fi

# Percent-encode the password so a special character (@ : / # ? space) cannot break
# the connection URL. % must be encoded first.
PW_ENC=$(printf '%s' "$PW" \
  | sed -e 's/%/%25/g' -e 's/@/%40/g' -e 's/:/%3A/g' -e 's#/#%2F#g' \
        -e 's/#/%23/g' -e 's/?/%3F/g' -e 's/ /%20/g')

echo "Pushing pending migrations to project '$REF' via the aws-1-eu-west-2 session pooler..."
supabase db push --db-url "postgresql://postgres.${REF}:${PW_ENC}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
