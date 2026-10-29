#!/usr/bin/env bash
# Build and deploy to https://mealmaker.brotherk3d.com.
# Needs: SSH access as $DEPLOY_USER, and a .env with VITE_SUPABASE_URL and
# VITE_SUPABASE_PUBLISHABLE_KEY (baked into the site at build time).
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/bk3d_deploy}"
export RSYNC_RSH="ssh -i $SSH_KEY"
HOST="${DEPLOY_HOST:-elvis-green.bnr.la}"
TARGET="$DEPLOY_USER@$HOST"

cd "$(dirname "$0")/.."

# Mirrors a local folder to the VPS: rsync when installed, else tar over ssh
# (Git Bash on Windows has no rsync). Both replace the remote folder's contents.
upload_dir() {
    local from="$1" to="$2"
    if command -v rsync > /dev/null; then
        rsync -rlz --delete --chmod=a+rX "$from/" "$TARGET:$to/"
    else
        tar -C "$from" -czf - . | ssh -i "$SSH_KEY" "$TARGET" "mkdir -p '$to' && find '$to' -mindepth 1 -delete && tar -C '$to' -xzf - && chmod -R a+rX '$to'"
    fi
}

echo "Building site (dev logins on) and server..."
npm run build:dev-site
npm run build:server-bundle

echo "Uploading site..."
upload_dir dist /var/www/mealmaker

echo "Uploading server..."
upload_dir dist-server /opt/mealmaker/app/dist-server
scp -q -i "$SSH_KEY" package.json "$TARGET:/opt/mealmaker/app/package.json"

echo "Restarting..."
ssh -i "$SSH_KEY" "$TARGET" "systemctl restart mealmaker && sleep 3 && systemctl is-active mealmaker"

echo "Deployed: https://mealmaker.brotherk3d.com"
