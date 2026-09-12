#!/usr/bin/env node
/**
 * Soak test — continuous load for stability / memory-leak detection.
 * Usage:
 *   node scripts/soak-test.mjs [baseUrl] [minutes] [intervalSec]
 *   node scripts/soak-test.mjs https://hrms.yourdomain.com 60 30
 *
 * Run on VPS for 15–25 day validation via cron/systemd timer (see docs).
 */
const base = (process.argv[2] || process.env.PUBLIC_APP_URL || 'http://localhost:8080').replace(/\/$/, '');
const durationMin = Number(process.argv[3] || 60);
const intervalSec = Number(process.argv[4] || 30);
const loginId = process.env.LOAD_TEST_USER || 'superadmin';
const password = process.env.LOAD_TEST_PASS || 'Super@123';

const endAt = Date.now() + durationMin * 60_000;
let cycle = 0;
let errors = 0;
let totalMs = 0;
let requests = 0;

async function login() {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: loginId, password }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return (await res.json()).accessToken;
}

async function probe(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const urls = [
    `${base}/api/v1/health`,
    `${base}/api/v1/dashboard/hr`,
    `${base}/api/v1/employees?take=20`,
    `${base}/api/v1/crm/leads`,
    `${base}/`,
  ];
  for (const url of urls) {
    const t0 = performance.now();
    const res = await fetch(url, url.includes('/api/') ? { headers } : {});
    const ms = performance.now() - t0;
    totalMs += ms;
    requests++;
    if (!res.ok) {
      errors++;
      console.error(`[${new Date().toISOString()}] FAIL ${url} → ${res.status}`);
    }
  }
}

async function main() {
  console.log(`Soak test: ${base} | ${durationMin} min | every ${intervalSec}s`);
  let token = await login();

  while (Date.now() < endAt) {
    cycle++;
    try {
      await probe(token);
    } catch (e) {
      errors++;
      console.error(`[cycle ${cycle}]`, e.message);
      try { token = await login(); } catch { /* retry next cycle */ }
    }
    if (cycle % 10 === 0) {
      const avg = requests ? Math.round(totalMs / requests) : 0;
      const health = await fetch(`${base}/api/v1/health`).then((r) => r.json()).catch(() => ({}));
      console.log(`[cycle ${cycle}] errors=${errors} avg=${avg}ms mem=${health.memoryMb?.rss ?? '?'}MB uptime=${health.uptimeSec ?? '?'}s`);
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }

  const avg = requests ? Math.round(totalMs / requests) : 0;
  console.log(`\nSoak complete: cycles=${cycle} requests=${requests} errors=${errors} avg=${avg}ms`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
