# Manual start (minimum steps)

Work from: `C:\Users\Aadarsh\Projects\eitf-hrms`

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

## Open these URLs (GPS attendance)

Browsers only show the **native Location permission popup** on a secure page:

- Local: https://localhost:3000
- **LAN phones:** https://192.168.1.69:3000 — accept the certificate warning once
- Public: URL in `.public-url.txt`
- API: http://localhost:3001/api/v1/health

Plain `http://192.168.1.69:3000` cannot trigger Geolocation in Chrome/Safari.

## Login

- `admin@eitf.in` / `Admin@123` (Super Admin only)

## Stop

1. Ctrl+C in Terminal 2  
2. Ctrl+C in Terminal 1  
