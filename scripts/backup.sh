#!/usr/bin/env bash
#
# Manual backup of the live Supabase project.
#
# This is not a belt-and-braces extra. `supabase backups list` reports an
# empty backup set and point-in-time recovery disabled on this project, so
# until that changes this script is the ONLY thing standing between the
# clinic and total data loss. See docs/COMPLIANCE.md.
#
# Produces three files, because a restore needs all three:
#   <stamp>-roles.sql   cluster roles
#   <stamp>-schema.sql  tables, policies, functions, triggers
#   <stamp>-data.sql    the rows
#
# Storage objects (consent signatures, X-rays, per-tooth images) are NOT
# included — they live in the storage bucket, not the database. Backing
# those up is a separate, still-open task; see docs/COMPLIANCE.md.
#
# Two ways to run it, in order of preference:
#
#   1. Direct pg_dump. Needs postgres client tools (`brew install libpq`)
#      and the database password from the Supabase dashboard
#      (Project Settings → Database → Connection string):
#
#        export SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres'
#        ./scripts/backup.sh
#
#   2. Via the Supabase CLI, which runs pg_dump inside a container and so
#      needs Docker Desktop or Podman running:
#
#        ./scripts/backup.sh
#
# Usage:  [SUPABASE_DB_URL=...] ./scripts/backup.sh [output-directory]

set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

have() { command -v "$1" >/dev/null 2>&1; }

if [ -n "${SUPABASE_DB_URL:-}" ] && have pg_dump; then
  MODE=pg_dump
elif have supabase && (have docker || have podman); then
  MODE=cli
else
  cat >&2 <<'ERR'
error: no usable dump method.

  Either set SUPABASE_DB_URL and install postgres client tools:
      brew install libpq
      export PATH="$(brew --prefix libpq)/bin:$PATH"
      export SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres'

  ...or install Docker Desktop / Podman so the Supabase CLI can run
  pg_dump in a container.

See docs/COMPLIANCE.md.
ERR
  exit 1
fi

mkdir -p "$OUT_DIR"
echo "Backing up to $OUT_DIR (timestamp $STAMP, method $MODE)"

if [ "$MODE" = pg_dump ]; then
  echo "  roles…"
  pg_dumpall --roles-only --dbname "$SUPABASE_DB_URL" > "$OUT_DIR/$STAMP-roles.sql"
  echo "  schema…"
  pg_dump --schema-only --dbname "$SUPABASE_DB_URL" > "$OUT_DIR/$STAMP-schema.sql"
  echo "  data…"
  # COPY rather than INSERT: far faster to restore, and round-trips nulls,
  # jsonb and arrays more reliably.
  pg_dump --data-only --column-inserts=false --dbname "$SUPABASE_DB_URL" > "$OUT_DIR/$STAMP-data.sql"
else
  echo "  roles…"
  supabase db dump --role-only -f "$OUT_DIR/$STAMP-roles.sql"
  echo "  schema…"
  supabase db dump -f "$OUT_DIR/$STAMP-schema.sql"
  echo "  data…"
  supabase db dump --data-only --use-copy -f "$OUT_DIR/$STAMP-data.sql"
fi

echo
echo "Done. Files written:"
ls -lh "$OUT_DIR/$STAMP"-*.sql | awk '{print "  " $9 "  " $5}'

cat <<'NOTE'

These files contain the clinic's complete patient records in plain text.
Treat them as you would the paper files: encrypted storage, access limited
to whoever is responsible for the data, destroyed when no longer needed.
Do not commit them — ./backups/ is gitignored for that reason.

Verify a backup restores rather than assuming it. The procedure is in
docs/COMPLIANCE.md. An untested backup is not a backup.
NOTE
