#!/usr/bin/env bash
# Production deploy helper (Git Bash / WSL / Linux / macOS)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building & starting production stack"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo "==> Waiting for health..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PUBLIC_PORT:-8080}/api/v1/health" >/dev/null 2>&1; then
    echo "Healthy."
    break
  fi
  sleep 3
done

curl -fsS "http://127.0.0.1:${PUBLIC_PORT:-8080}/api/v1/health" || true
echo ""
echo "Local production URL: http://127.0.0.1:${PUBLIC_PORT:-8080}"
echo "Expose publicly with: npx localtunnel --port ${PUBLIC_PORT:-8080}"
