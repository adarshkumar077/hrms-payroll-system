#!/usr/bin/env bash
# First-time Let's Encrypt certificate (run on VPS with domain pointing to server)
# Usage: ./deploy/certbot/init-letsencrypt.sh hrms.yourdomain.com your@email.com
set -euo pipefail

DOMAIN="${1:?Usage: init-letsencrypt.sh DOMAIN EMAIL}"
EMAIL="${2:?Usage: init-letsencrypt.sh DOMAIN EMAIL}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SSL_TEMPLATE="deploy/nginx/conf.d/eitf-hrms-ssl.conf.template"
SSL_ACTIVE="deploy/nginx/conf.d/eitf-hrms-ssl.conf"

echo "==> Requesting certificate for ${DOMAIN}"
docker compose --env-file .env.production run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "${DOMAIN}" \
  --email "${EMAIL}" --agree-tos --no-eff-email

sed "s/YOUR_DOMAIN/${DOMAIN}/g" "${SSL_TEMPLATE}" > "${SSL_ACTIVE}"
echo "include /etc/nginx/conf.d/eitf-hrms-ssl.conf;" >> deploy/nginx/conf.d/eitf-hrms.conf

docker compose --env-file .env.production --profile ssl up -d nginx certbot
echo "==> HTTPS enabled for https://${DOMAIN}"
