#!/usr/bin/env bash
# Post-deploy startup verification — run after docker compose up
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env.production}"
source /dev/null 2>&1 || true
PORT="${PUBLIC_HTTP_PORT:-8080}"
BASE="${PUBLIC_APP_URL:-http://127.0.0.1:${PORT}}"

echo "==> Container status"
docker compose --env-file "$ENV_FILE" ps

echo "==> Waiting for health (max 3 min)..."
for i in $(seq 1 36); do
  if curl -fsS "${BASE%/}/api/v1/health" >/dev/null 2>&1; then
    echo "API healthy."
    break
  fi
  sleep 5
done

echo "==> Health response"
curl -fsS "${BASE%/}/api/v1/health" | head -c 500
echo ""

echo "==> Web home"
curl -fsS -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" "${BASE%/}/"

echo "==> Disk volumes"
docker volume ls | grep eitf || true

echo "==> Startup verification complete"
