#!/usr/bin/env bash
# One-time VPS preparation for the API.   bash script/vps-setup.sh
#
# The database already exists (mealmaker, on the VPS's own Postgres, owned by the
# app's login), so this only:
#   * creates the thumbnail folder (/opt/mealmaker/thumbnails)
#   * appends the API settings to /opt/mealmaker/.env if they are missing
# It never prints or changes existing values. Safe to re-run.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
HOST="${DEPLOY_HOST:-elvis-green.bnr.la}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/bk3d_deploy}"

ssh -i "$SSH_KEY" -o BatchMode=yes "$DEPLOY_USER@$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
ENV=/opt/mealmaker/.env
mkdir -p /opt/mealmaker/thumbnails
chown wendy:mealmaker /opt/mealmaker/thumbnails
chmod 755 /opt/mealmaker/thumbnails

add() {   # add NAME VALUE: only if NAME is not already set
    grep -q "^$1=" "$ENV" || printf '%s=%s\n' "$1" "$2" >> "$ENV"
}
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV" | head -1 | cut -d= -f2-)"
[ -n "$DB_URL" ] || { echo "DATABASE_URL is missing from $ENV" >&2; exit 1; }
add NUTRITION_DATABASE_URL "$DB_URL"
add NUTRITION_LAB_DATABASE mealmaker
add THUMBNAIL_DIR /opt/mealmaker/thumbnails
add LOOKUP_OLLAMA_URL https://ollama.com
grep -q '^OPENAI_API_KEY=' "$ENV" || echo "NOTE: OPENAI_API_KEY is not set in $ENV, so voice transcription will answer 503."
echo "Environment names now set: $(grep -oE '^[A-Z_]+=' "$ENV" | tr -d '=' | tr '\n' ' ')"
REMOTE
