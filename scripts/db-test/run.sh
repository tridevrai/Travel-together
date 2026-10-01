#!/usr/bin/env bash
# Runs the pgTAP suite in supabase/tests/database against a throwaway local
# Postgres (no Docker needed). Requires Postgres 15+ server binaries, the pgTAP
# extension and pg_prove (Debian/Ubuntu: postgresql-16 postgresql-16-pgtap
# libtap-parser-sourcehandler-pgtap).
#
# With Docker and the Supabase CLI available, prefer the real stack:
#   supabase start && supabase test db
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
PORT="${PGTEST_PORT:-54329}"

# initdb refuses to run as root; drop to the postgres user if needed.
if [ "$(id -u)" = 0 ]; then
  RUN_AS=(runuser -u postgres --)
else
  RUN_AS=()
fi

WORK="$(mktemp -d)"
chmod 777 "$WORK"
cleanup() {
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/postgres.log" -w \
  -o "-p $PORT -k $WORK -c listen_addresses='' -c wal_level=logical" start >/dev/null

export PGHOST="$WORK" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
psql_q() { PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_q -c 'alter database postgres set search_path = "$user", public, extensions'
psql_q -f "$ROOT/scripts/db-test/supabase-shim.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  psql_q -f "$migration"
done

PGOPTIONS="-c client_min_messages=warning" pg_prove --ext .sql -r "$ROOT/supabase/tests/database"
