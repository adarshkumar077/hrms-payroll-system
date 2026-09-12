#!/usr/bin/env bash
# One-shot VPS production install — Ubuntu 22.04/24.04
# Run as root or sudo user on your cloud VPS
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/eitf-hrms}"
REPO_URL="${REPO_URL:-}"  # set to your git URL or scp project manually

echo "==> Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "${SUDO_USER:-$USER}" 2>/dev/null || true
fi

echo "==> Preparing app directory: $APP_DIR"
mkdir -p "$APP_DIR"
if [[ -n "$REPO_URL" ]]; then
  git clone "$REPO_URL" "$APP_DIR" || (cd "$APP_DIR" && git pull)
fi
cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  cp .env.production.example .env.production
  echo ""
  echo "IMPORTANT: Edit $APP_DIR/.env.production before continuing:"
  echo "  POSTGRES_PASSWORD, JWT_* secrets, PUBLIC_APP_URL, CORS_ORIGINS, CLOUDFLARE_TUNNEL_TOKEN"
  echo ""
  exit 1
fi

chmod +x deploy/up.sh scripts/*.sh 2>/dev/null || true

echo "==> Starting production stack..."
./deploy/up.sh

echo "==> Enabling auto-start on reboot..."
cp deploy/systemd/eitf-hrms.service /etc/systemd/system/
sed -i "s|/opt/eitf-hrms|$APP_DIR|g" /etc/systemd/system/eitf-hrms.service
systemctl daemon-reload
systemctl enable eitf-hrms

echo ""
echo "════════════════════════════════════════════════════════"
echo "  VPS deploy complete."
echo "  Configure Cloudflare Tunnel hostname → http://nginx:80"
echo "  Then set PUBLIC_APP_URL=https://your-domain in .env.production"
echo "  Smoke test: node scripts/smoke-test.mjs https://your-domain"
echo "════════════════════════════════════════════════════════"
