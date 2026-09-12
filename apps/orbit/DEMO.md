# Orbit — Demo Script & Go-Live Checklist (2026-07-12)

Full styled version: claude.ai artifact "Orbit — Demo Script & Deployment Checklist". Every step below was executed and verified in this build (400 vitest + 10 Playwright green).

## The 20-minute demo (four acts)

**Setup:** `npm run dev` → :3000. Logins: `ceo@demo.orbit` / `orbit123` (full), `sales@demo.orbit` / `orbit123` (restricted). `npm run db:reset` for a clean tenant (destructive).

**Opening line:** "Most CRMs make you fit their software. Orbit fits itself to you — watch it configure itself for your business in five minutes, then run your sales, money, and payroll in one place."

### Act 1 — The company that configures itself (5 min) · THE MOAT
1. Studio → Industry Templates → "✨ Describe your business instead" → answer the 4 questions in the prospect's own words → Propose.
2. Review the AI's diff (picklists/fields/renames drafted from their answers). Say: *nothing is written until you apply; every change is logged.*
3. Apply → sidebar renames instantly (live-proven: real-estate answers → "Bookings"/"Clients"). Show /studio change log with the `ai` badge.
4. Hand them the wheel: rename a module, add a field (/studio/fields), reorder the record page (/studio/layouts).
- AI offline? Interview degrades to closest industry pack — same beat via /studio/templates.

### Act 2 — Sell: lead to deal in 90 seconds (5 min)
5. "+ New Lead" (their custom field is already on the form) → returns AI-scored + dedupe-checked (create twice to show the duplicate warning).
6. Open the lead: inline-edit fields, add a timeline note, AI follow-up drafter (never auto-sends).
7. **Convert** → Account + Contact + Deal created transactionally, lead locks. *"Elsewhere at this price, converted is just a label."*
8. Account 360 (contacts/deals/tickets/invoices/receivables one screen) → advance the deal on the board (probability auto-updates).

### Act 3 — Money: quote-to-cash with GST built in (6 min)
9. Create invoice → Finalize → IRN fields + GSTR-1 rail update + **the double-entry journal posts itself** (/finance/ledger).
10. "Collect online (Razorpay)" (live: verified webhook settles it; never the browser) + record a manual UPI payment (atomic receipt no.).
11. /finance/reports (trial balance ✓ / P&L / balance sheet from the journals just created) → /payroll run (PF/ESI/PT/TDS per statute) → /dashboard (every number, one screen).

### Act 4 — Control (4 min) · THE TRUST CLOSE
12. Log in as sales (incognito): nav shrinks to 5 modules; /payroll by URL → "No access"; payslip net pay masked by role.
13. Studio change log + admin event log + DPDP export. Close: *"SangamCRM tells Tally what you sold. Orbit is where the money actually lives."*

## Go-live checklist

**Phase 0 — Repo/CI (30 min):** create GitHub repo → `git remote add origin <url>` → push `studio/s0-foundations` + `master` → CI (vitest + schema-sync + Playwright) runs on push → PR + merge to master when green.

**Phase 1 — Host + DB (half day):** Node-capable host (₹400–800/mo VPS — Hostinger/Contabo/DO — or Railway/Render). Docker path: `docker compose --profile postgres up -d` (DEPLOY.md). Bare path: Node 20 + `npm run build` + pm2 + Postgres (Neon/Supabase free tiers fine). **Run Postgres end-to-end once** (`db:postgres:push` + seed + click through). Domain + HTTPS (needed for the Razorpay webhook + OAuth).

**Phase 2 — Env (1 hr, from .env.*.example):**
- REQUIRED: `AUTH_SECRET` (app refuses prod boot without it), `DATABASE_URL` (postgres), `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` for payments (register `https://<host>/api/webhooks/razorpay` for payment.captured; Test Mode first).
- RECOMMENDED: LLM keys (else AI degrades to heuristics), `SMTP_*` (else reset/invite links show on-screen), `MARKETPLACE_WEBHOOK_KEY` (⚠️ webhook tenant resolution is findFirst — single-tenant until fixed), `CRON_SECRET` + a 5-min cron on `/api/cron`.
- OPTIONAL: `OCR_MODEL`, `IRP_*` (sandbox first), `GOOGLE_CLIENT_*`, `.env.telephony.example` (click-to-call + call status tracking via Exotel), `.env.whatsapp.example` (WhatsApp messaging + delivery status), see connector README for Tally ledger export/import (Wave D).

**Phase 3 — Ops (2 hrs):** nightly `pg_dump` off-box + test one restore · `data/uploads/` on a backed-up volume (local-disk = single instance only) · uptime check on `/api/health` · run `BASE_URL=https://<host> npx playwright test` once against prod · pilot tenants via /signup, never hand out the demo tenant · never `db:reset` prod.

**Pilot-scale known gaps (fine for 2–3 friendly SMBs):** single-tenant marketplace webhook; statutory maths not CA-audited (PT Maharashtra-only); rate-limiting only on login; single-instance uploads. See GAPS.md.

## Docker vs Bluehost shared (PHP-only) — the answer

**Docker is not required — a Node.js runtime is.** Orbit is a Next.js server app: a long-running Node process renders pages, runs server actions, holds DB connections, receives webhooks. PHP-only shared hosting executes PHP per-request under Apache and structurally **cannot run a Node process at all** — it's not slow, it's impossible. Docker is just packaging (one command, reproducible env); bare Node + pm2 on a VPS is equally supported.

The repo already litigated this twice — LARAVEL-REBUILD-PLAN.md's "honest recommendation" and BLUEHOST-HOSTING.md's "Path B — Cheap VPS" independently reached the same verdict (the knowledge graph flagged the convergence). The orbit-laravel/orbit-frontend track exists *because* of PHP-only hosting, but it is now ~11 waves behind (no Studio, convert, packs, AI onboarding, webhook). Porting months of work to save ₹200–500/month is the wrong trade.

| Option | ₹/mo | Runs today's Orbit? |
|---|---|---|
| Bluehost shared (PHP-only) | ~250 | ❌ only the stale Laravel track |
| **Cheap VPS + Docker or pm2** | 300–800 | ✅ everything — **recommended** |
| Railway/Render + managed PG | 400–900 | ✅ (uploads need a volume) |
| Vercel + Neon | 0–800 | ⚠️ after an S3 uploads driver |
