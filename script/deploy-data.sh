#!/usr/bin/env bash
# Deploy the local nutrition_lab database to the VPS.   npm run deploy:data
#
# The VPS has one database, `mealmaker`, and its login cannot create databases,
# so the data is swapped by schema inside it, atomically (one transaction):
#   public      -> renamed nl_prev   (the previous data, kept for rollback)
#   new public  <- the dump, restored, then checked (food count, search resolver)
# If any check fails the whole transaction rolls back and the live data is untouched.
# The API keeps running; queries wait on the swap for a moment. Keys live in the
# separate `api` schema, which a deploy never touches (and the dump excludes).
#
#   npm run deploy:data                 # deploy
#   npm run deploy:data -- --rollback   # put the previous data back
#
# Needs SSH as $DEPLOY_USER (default root) with $SSH_KEY.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
HOST="${DEPLOY_HOST:-elvis-green.bnr.la}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/bk3d_deploy}"
TARGET="$DEPLOY_USER@$HOST"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes)
SCP=(scp -q -i "$SSH_KEY" -o BatchMode=yes)
PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/18/bin}"
LAB_DB="${NUTRITION_LAB_DATABASE:-nutrition_lab}"

cd "$(dirname "$0")/.."

# Runs on the VPS. Reads the app's database login from its env file without printing it.
REMOTE_HEAD='set -euo pipefail
DB_URL="$(grep -E "^DATABASE_URL=" /opt/mealmaker/.env | head -1 | cut -d= -f2- | tr -d "\"'"'"'")"
psql_() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
'

if [ "${1:-}" = "--rollback" ]; then
    "${SSH[@]}" "$TARGET" "bash -s" <<EOS
$REMOTE_HEAD
psql_ <<'SQL'
BEGIN;
DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'nl_prev') THEN
        RAISE EXCEPTION 'There is no nl_prev to roll back to.';
    END IF;
END \$\$;
DROP SCHEMA IF EXISTS nl_rolledback CASCADE;
ALTER SCHEMA public RENAME TO nl_rolledback;
ALTER SCHEMA nl_prev RENAME TO public;
ALTER EXTENSION pg_trgm SET SCHEMA public;
ALTER EXTENSION unaccent SET SCHEMA public;
COMMIT;
SQL
echo "Rolled back. The undone data is kept as schema nl_rolledback."
EOS
    exit 0
fi

DB_URL="$(grep -E '^NUTRITION_DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')"
[ -n "$DB_URL" ] || { echo "NUTRITION_DATABASE_URL is not in .env" >&2; exit 1; }
LAB_URL="${DB_URL%/*}/$LAB_DB"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
native() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

echo "Dumping $LAB_DB..."
"$PG_BIN/pg_dump" -d "$LAB_URL" -Fp --no-owner --no-acl --exclude-schema=api -f "$(native "$WORK/dump.sql")"
FOODS="$("$PG_BIN/psql" -d "$LAB_URL" -X -tA -c "SELECT count(*) FROM food" | tr -d '\r')"
echo "  $(du -h "$WORK/dump.sql" | cut -f1) of SQL, $FOODS foods."

# Swap script: runs inside the one transaction, around the dump.
cat > "$WORK/swap.sql" <<SQL
\set ON_ERROR_STOP on
BEGIN;
DROP SCHEMA IF EXISTS nl_prev CASCADE;
ALTER SCHEMA public RENAME TO nl_prev;
CREATE SCHEMA public;
-- Extensions are relocatable; carrying them into the new schema keeps the old
-- one's indexes working (they refer to operator classes by id, not name).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
ALTER EXTENSION pg_trgm SET SCHEMA public;
ALTER EXTENSION unaccent SET SCHEMA public;
\i /tmp/mealmaker_dump.sql
-- The dump empties search_path; the checks and the live app both need public.
SET search_path = public;
DO \$\$ BEGIN
    IF (SELECT count(*) FROM public.food) <> $FOODS THEN
        RAISE EXCEPTION 'food count % does not match the expected $FOODS', (SELECT count(*) FROM public.food);
    END IF;
    IF (SELECT count(*) FROM public.resolve_food_detailed('apple', 3)) = 0 THEN
        RAISE EXCEPTION 'the search resolver returned nothing for "apple"';
    END IF;
END \$\$;
COMMIT;
ANALYZE;
SQL

echo "Uploading..."
"${SCP[@]}" "$WORK/dump.sql" "$TARGET:/tmp/mealmaker_dump.sql"
"${SCP[@]}" "$WORK/swap.sql" "$TARGET:/tmp/mealmaker_swap.sql"

echo "Restoring and swapping on the VPS..."
"${SSH[@]}" "$TARGET" "bash -s" <<EOS
$REMOTE_HEAD
trap 'rm -f /tmp/mealmaker_dump.sql /tmp/mealmaker_swap.sql' EXIT
psql_ -f /tmp/mealmaker_swap.sql
echo "Live. The previous data is kept as schema nl_prev (npm run deploy:data -- --rollback)."
EOS
