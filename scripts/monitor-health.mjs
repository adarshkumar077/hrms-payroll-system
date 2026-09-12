#!/usr/bin/env node
/**
 * Health monitor — run via cron every 5 minutes on VPS.
 * Usage: node scripts/monitor-health.mjs [baseUrl]
 * Exit 1 on failure (triggers alerting if wired to cron mail/webhook).
 */
const base = (process.argv[2] || process.env.PUBLIC_APP_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

async function check(path, expectOk = true) {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
  const ms = Math.round(performance.now() - t0);
  if (expectOk && !res.ok) throw new Error(`${path} → HTTP ${res.status} (${ms}ms)`);
  return { path, ms, status: res.status };
}

async function main() {
  const ts = new Date().toISOString();
  try {
    const health = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    if (health.status !== 'ok' && health.db === 'error') {
      throw new Error(`API degraded: db=${health.db} redis=${health.redis}`);
    }
    await check('/nginx-health');
    await check('/');
    console.log(`[${ts}] OK — api=${health.status} uptime=${health.uptimeSec}s rss=${health.memoryMb?.rss}MB`);
  } catch (e) {
    console.error(`[${ts}] ALERT — ${e.message}`);
    process.exit(1);
  }
}

main();
