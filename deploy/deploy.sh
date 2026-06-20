#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/bid-muasamcong}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

mkdir -p data
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save

echo "Deploy xong: $(git rev-parse --short HEAD)"
