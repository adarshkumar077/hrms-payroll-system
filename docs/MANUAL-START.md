# Manual start (minimum steps)

Work from: `C:\Users\Aadarsh\Projects\eitf-hrms`

## 2 terminals only

**Terminal 1 — database (keep open)**

```bash
npm run db:up
```

Wait until you see `Embedded Postgres is running`.

**Terminal 2 — app + public tunnel (keep open)**

```bash
npm run start:localhost
```

This starts API (`:3001`), web (`:3000`), and Cloudflare quick tunnel. Copy the printed `https://….trycloudflare.com` link (also saved in `.public-url.txt`).

## Open these URLs

- Local: http://localhost:3000
- LAN: http://192.168.1.69:3000
- Public: the new trycloudflare URL from Terminal 2
- API check: http://localhost:3001/api/v1/health

## Login

- `superadmin` / `Super@123`
- `admin` / `Admin@123`
- `hr001` / `HR@123`
- `emp001` / `Emp@123`

## Stop

1. Ctrl+C in Terminal 2
2. Ctrl+C in Terminal 1

## Notes

- Do not close either terminal while using the app.
- Each tunnel restart gets a **new** public hostname; old links stop working.
- First web load can take ~30–60s while Next compiles.
- For phone/tablet HTTPS details see [PUBLIC-HTTPS-TESTING.md](./PUBLIC-HTTPS-TESTING.md).
