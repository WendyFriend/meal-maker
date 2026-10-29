#!/usr/bin/env bash
# Upload generated food thumbnails to the VPS.   npm run deploy:thumbs
#
# Sends only images that are new or changed (by size) since the last upload, so
# re-running after the studio makes more is quick. With --prune, images on the
# VPS that no longer exist here (erased or rejected ones) are deleted too.
#
# Uses tar over ssh, so it needs nothing but ssh on either end.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
HOST="${DEPLOY_HOST:-elvis-green.bnr.la}"
TARGET="$DEPLOY_USER@$HOST"
REMOTE_DIR="${THUMBNAIL_DIR:-/opt/mealmaker/thumbnails}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/bk3d_deploy}"
LOCAL_DIR="db/lab/thumbnails"

cd "$(dirname "$0")/.."

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# "<name> <bytes>" for every image, on each side.
find "$LOCAL_DIR" -maxdepth 1 -name '*.webp' -printf '%f %s\n' | sort > "$WORK/local"
ssh -i "$SSH_KEY" "$TARGET" "find '$REMOTE_DIR' -maxdepth 1 -name '*.webp' -printf '%f %s\n' | sort" > "$WORK/remote"

comm -23 "$WORK/local" "$WORK/remote" | cut -d' ' -f1 > "$WORK/send"
SEND=$(wc -l < "$WORK/send")
echo "$(wc -l < "$WORK/local") images here, $(wc -l < "$WORK/remote") on the VPS; $SEND to send."

if [ "$SEND" -gt 0 ]; then
    tar -C "$LOCAL_DIR" -cf - -T "$WORK/send" | ssh -i "$SSH_KEY" "$TARGET" "tar -C '$REMOTE_DIR' -xf - && chmod a+r '$REMOTE_DIR'/*.webp"
    echo "Sent $SEND."
fi

if [ "${1:-}" = "--prune" ]; then
    cut -d' ' -f1 "$WORK/local" > "$WORK/local-names"
    cut -d' ' -f1 "$WORK/remote" > "$WORK/remote-names"
    comm -13 "$WORK/local-names" "$WORK/remote-names" > "$WORK/delete"
    DELETE=$(wc -l < "$WORK/delete")
    if [ "$DELETE" -gt 0 ]; then
        ssh -i "$SSH_KEY" "$TARGET" "cd '$REMOTE_DIR' && xargs rm -f" < "$WORK/delete"
    fi
    echo "Pruned $DELETE that are gone here."
fi
