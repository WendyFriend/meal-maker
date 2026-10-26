#!/usr/bin/env bash
# Build and deploy to https://mealmaker.brotherk3d.com.
# Needs: SSH access as $DEPLOY_USER, and a .env with VITE_SUPABASE_URL and
# VITE_SUPABASE_PUBLISHABLE_KEY (baked into the site at build time).
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-wendy}"
HOST="${DEPLOY_HOST:-elvis-green.bnr.la}"
TARGET="$DEPLOY_USER@$HOST"

cd "$(dirname "$0")/.."

echo "Building site (dev logins on) and server..."
npm run build:dev-site
npm run build:server-bundle

echo "Uploading site..."
rsync -rlz --delete --chmod=a+rX dist/ "$TARGET:/var/www/mealmaker/"

echo "Uploading server..."
rsync -rlz --delete --chmod=a+rX dist-server/ "$TARGET:/opt/mealmaker/app/dist-server/"
rsync -lz --chmod=a+r package.json "$TARGET:/opt/mealmaker/app/package.json"

echo "Restarting..."
ssh "$TARGET" "sudo mealmaker-ctl restart && sleep 2 && sudo mealmaker-ctl status | head -3"

echo "Deployed: https://mealmaker.brotherk3d.com"
