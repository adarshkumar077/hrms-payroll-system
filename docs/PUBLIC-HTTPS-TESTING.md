# Public HTTPS access (any phone / tablet / PC)

The HRMS is **Next.js** (`apps/web`, `0.0.0.0:3000`) + **NestJS** (`apps/api`, `0.0.0.0:3001`). The browser calls **same-origin** `/api/v1`, which Next rewrites to the API. One Cloudflare URL covers UI, API, uploads, and CORS.

## Start (public link)

From `C:\Users\Aadarsh\Projects\eitf-hrms`:

```bash
npm run db:up
npm run start:localhost
```

In a **second** terminal (keep both open):

```bash
npm run start:public
```

Copy the printed `https://….trycloudflare.com` URL. Open it on Android, iPhone, Windows, macOS, or tablet. Login: `superadmin` / `Super@123`.

The URL is also saved in `.public-url.txt` (gitignored). Quick tunnels get a **new hostname each start**.

## Stop

```bash
npm run stop:public
```

Then Ctrl+C in the `start:localhost` terminal.

## Restart

```bash
npm run stop:public
npm run start:public
```

Use the **new** URL after restart.

## Notes

- Camera + GPS are allowed for attendance selfie check-in.
- Do not set `NEXT_PUBLIC_API_URL` to `http://localhost:3001` or phones will fail.
- Permanent company domain: Cloudflare Zero Trust tunnel token + `npm run docker:up:tunnel` (see `docs/PRODUCTION-DEPLOYMENT.md`).
