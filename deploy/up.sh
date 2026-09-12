#!/usr/bin/env bash
# Production deploy — VPS / cloud server
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.production.example"
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

PROFILES=()
if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  PROFILES+=(--profile tunnel)
  echo "==> Cloudflare Tunnel token detected — enabling tunnel profile"
fi
if [[ "${ENABLE_SSL:-}" == "true" ]]; then
  PROFILES+=(--profile ssl)
fi

echo "==> Building & starting production stack"
docker compose --env-file "$ENV_FILE" "${PROFILES[@]}" up -d --build

echo "==> Running startup verification"
bash scripts/startup-verify.sh "$ENV_FILE"

PORT="${PUBLIC_HTTP_PORT:-8080}"
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Stack is up."
if [[ -n "${PUBLIC_APP_URL:-}" ]]; then
  echo "  Public URL: ${PUBLIC_APP_URL}"
elif [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "  Public URL: (configure hostname in Cloudflare Zero Trust dashboard)"
else
  echo "  Local check: http://127.0.0.1:${PORT}"
fi
echo "  Health:      ${PUBLIC_APP_URL:-http://127.0.0.1:${PORT}}/api/v1/health"
echo "  Login:       superadmin / Super@123  (change after first login)"
echo "════════════════════════════════════════════════════════"
