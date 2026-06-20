#!/usr/bin/env bash
# Chạy lần đầu trên VPS Hainamtech (Ubuntu)
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/bid-muasamcong}"
REPO_URL="${1:?Thiếu URL git, vd: https://github.com/hainamtech/bid-muasamcong.git}"

sudo mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
mkdir -p data

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

pm2 start ecosystem.config.cjs || pm2 reload ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "App: http://127.0.0.1:3001"
echo "Tiếp theo: cấu hình Nginx (deploy/nginx-bid.conf) + certbot SSL"
