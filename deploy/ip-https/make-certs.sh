#!/usr/bin/env bash
# Create a private company Certificate Authority (once) and an HTTPS certificate for the server IP.
#
# Usage (from the repo root):
#   bash deploy/ip-https/make-certs.sh <SERVER_IP> [extra-hostname ...]
#   e.g. bash deploy/ip-https/make-certs.sh 192.168.1.50 hrms.office.local
#
# Writes:
#   deploy/certs/server.crt, server.key    used by nginx (docker-compose.ip-https.yml)
#   deploy/certs/eitf-hrms-ca.crt          install this on every authorized PC / phone (public, safe to share)
#   deploy/certs/ca-private/ca.key         CA PRIVATE KEY — copy it OFF the server to safe offline storage,
#                                          then delete it here. Anyone holding it can impersonate any site
#                                          to devices that trust this CA. Needed again only to renew.
# Re-running reuses an existing CA (so devices keep trusting it) and issues a fresh server certificate.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <SERVER_IP> [extra-hostname ...]" >&2
  exit 1
fi
IP="$1"; shift
if ! [[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Not an IPv4 address: $IP" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/deploy/certs"
CA_DIR="$OUT/ca-private"
mkdir -p "$OUT" "$CA_DIR"
chmod 700 "$CA_DIR" 2>/dev/null || true
umask 077
# Git Bash on Windows: keep "/O=..." certificate subjects intact (no effect on Linux).
export MSYS2_ARG_CONV_EXCL="/O="

if [[ ! -f "$CA_DIR/ca.key" ]]; then
  if [[ -f "$OUT/eitf-hrms-ca.crt" ]]; then
    echo "eitf-hrms-ca.crt exists but ca-private/ca.key does not (moved offline?)." >&2
    echo "Copy ca.key back into $CA_DIR to issue a new server certificate." >&2
    exit 1
  fi
  echo "==> Creating company CA (valid 10 years)"
  openssl genrsa -out "$CA_DIR/ca.key" 4096 2>/dev/null
  openssl req -x509 -new -key "$CA_DIR/ca.key" -sha256 -days 3650 \
    -subj "/O=EITF HRMS/CN=EITF HRMS Internal CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$OUT/eitf-hrms-ca.crt"
else
  echo "==> Reusing existing company CA"
fi

SAN="IP:$IP"
for h in "$@"; do SAN="$SAN,DNS:$h"; done

# Temp files next to the CA (not /tmp: Windows openssl.exe cannot resolve MSYS /tmp paths).
EXT="$CA_DIR/server.ext"
CSR="$CA_DIR/server.csr"
trap 'rm -f "$EXT" "$CSR"' EXIT
cat >"$EXT" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
EOF

echo "==> Issuing server certificate for $SAN (valid 825 days)"
openssl genrsa -out "$OUT/server.key" 2048 2>/dev/null
openssl req -new -key "$OUT/server.key" -subj "/O=EITF HRMS/CN=$IP" -out "$CSR"
openssl x509 -req -in "$CSR" -CA "$OUT/eitf-hrms-ca.crt" -CAkey "$CA_DIR/ca.key" -CAcreateserial \
  -CAserial "$CA_DIR/ca.srl" -out "$OUT/server.crt" -days 825 -sha256 -extfile "$EXT"

chmod 644 "$OUT/server.crt" "$OUT/eitf-hrms-ca.crt"
chmod 640 "$OUT/server.key" 2>/dev/null || true   # nginx master reads it as root
openssl verify -CAfile "$OUT/eitf-hrms-ca.crt" "$OUT/server.crt"

cat <<EOF

Done.
  nginx certificate : deploy/certs/server.crt + server.key
  Install on devices: deploy/certs/eitf-hrms-ca.crt  ("Trusted Root Certification Authorities")
  NEXT STEP         : copy deploy/certs/ca-private/ca.key to offline storage, then delete it here.
  Renew before      : $(openssl x509 -in "$OUT/server.crt" -noout -enddate | cut -d= -f2)
EOF
