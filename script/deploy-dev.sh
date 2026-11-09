#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="meal-maker-dev.vercel.app" # This is the default Vercel deployment URL for the app

echo "Incrementing app version..."
npm run version:bump

echo "Building..."
npm run build

echo "Deploying to Vercel..."
DEPLOYMENT_URL=$(vercel deploy)

echo "Deployment created:"
echo "$DEPLOYMENT_URL"

echo "Pointing $DOMAIN to deployment..."
vercel alias set "$DEPLOYMENT_URL" "$DOMAIN"

echo "Done!"
echo "https://$DOMAIN"