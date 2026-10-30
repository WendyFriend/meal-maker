#!/bin/bash

set -e

DOMAIN="meal-maker-dev.vercel.app"
# DOMAIN="dev.meal-maker.me"

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