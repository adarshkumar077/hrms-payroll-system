# Manual start (minimum steps)

Work from the repo root.

## 2 terminals only

**Terminal 1 — database (keep open)**

```bash
npm run db:up
```

Wait until you see `Embedded Postgres is running`.

**Terminal 2 — app + tunnel (keep open)**

```bash
npm run start:localhost
```

Starts API (`:3001`), web **HTTPS** (`:3000`), and Cloudflare tunnel.

Prerequisites:

- `cloudflared` on your `PATH` (or a copy at `deploy/bin/`). Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
- HTTPS certificates in `apps/web/certificates/` (`localhost.pem`, `localhost-key.pem`). Create them with `mkcert`:

  ```bash
  mkcert -install
  mkdir -p apps/web/certificates && cd apps/web/certificates && mkcert localhost && cd ../../..
  ```

  Use `npm run start:localhost:http` to skip HTTPS (no camera or GPS).

## Open these URLs (GPS attendance)

Browsers only show the **native Location permission popup** on a secure page:

- Local: https://localhost:3000
- **LAN phones:** `https://<your-LAN-IP>:3000` — use your machine's LAN IP (printed when `start:localhost` starts); accept the certificate warning once
- Public: URL in `.public-url.txt`
- API: http://localhost:3001/api/v1/health

Plain `http://<your-LAN-IP>:3000` cannot trigger Geolocation in Chrome/Safari.

## Login

- Local development: `admin@eitf.in` / `Admin@123` (created by `npm run db:seed`, forced password change on first login). See the README for production bootstrap.

## Stop

1. Ctrl+C in Terminal 2  
2. Ctrl+C in Terminal 1  
