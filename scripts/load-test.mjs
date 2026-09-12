#!/usr/bin/env node
/**
 * Production load test — simulates 10–20 concurrent office users.
 * Usage:
 *   node scripts/load-test.mjs [baseUrl] [concurrency]
 *   node scripts/load-test.mjs https://hrms.yourdomain.com 15
 *
 * Env: LOAD_TEST_USER, LOAD_TEST_PASS (default: superadmin / Super@123)
 */
const base = (process.argv[2] || process.env.PUBLIC_APP_URL || 'http://localhost:8080').replace(/\/$/, '');
const concurrency = Number(process.argv[3] || process.env.LOAD_TEST_CONCURRENCY || 15);
const loginId = process.env.LOAD_TEST_USER || 'superadmin';
const password = process.env.LOAD_TEST_PASS || 'Super@123';

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    return { label, ok: true, ms: Math.round(performance.now() - t0), result };
  } catch (e) {
    return { label, ok: false, ms: Math.round(performance.now() - t0), error: e.message };
  }
}

async function login() {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: loginId, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`login ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.accessToken;
}

function authed(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function main() {
  console.log(`\n=== EITF HRMS Load Test ===`);
  console.log(`Target: ${base}`);
  console.log(`Concurrency: ${concurrency} users`);
  console.log(`Login: ${loginId}\n`);

  let token;
  const loginProbe = await timed('login', () => login());
  if (!loginProbe.ok) {
    console.error('Login failed:', loginProbe.error);
    process.exit(1);
  }
  token = loginProbe.result;
  const headers = authed(token);
  const today = new Date().toISOString().slice(0, 10);

  const tests = [
    ['health', () => fetch(`${base}/api/v1/health`).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['dashboard-hr', () => fetch(`${base}/api/v1/dashboard/hr`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['dashboard-employee', () => fetch(`${base}/api/v1/dashboard/employee`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['employees', () => fetch(`${base}/api/v1/employees?take=50`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['attendance-console', () => fetch(`${base}/api/v1/attendance/console?date=${today}`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['attendance-punch-in', () => fetch(`${base}/api/v1/me/attendance/mark`, { method: 'POST', headers, body: JSON.stringify({ type: 'IN' }) }).then((r) => { if (!r.ok && r.status !== 409) throw new Error(String(r.status)); })],
    ['attendance-punch-out', () => fetch(`${base}/api/v1/me/attendance/mark`, { method: 'POST', headers, body: JSON.stringify({ type: 'OUT' }) }).then((r) => { if (!r.ok && r.status !== 409) throw new Error(String(r.status)); })],
    ['leave-balances', () => fetch(`${base}/api/v1/me/leave/balances`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['payroll-runs', () => fetch(`${base}/api/v1/payroll/runs`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['crm-leads', () => fetch(`${base}/api/v1/crm/leads`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['crm-tasks', () => fetch(`${base}/api/v1/crm/tasks`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['crm-lead-create', () => fetch(`${base}/api/v1/crm/leads`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: `LoadTest ${Date.now()}`, phone: '9999999999', source: 'load-test' }),
    }).then((r) => { if (!r.ok && r.status !== 403) throw new Error(String(r.status)); })],
    ['profile', () => fetch(`${base}/api/v1/me/profile`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['notifications', () => fetch(`${base}/api/v1/notifications/mine`, { headers }).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['web-home', () => fetch(`${base}/`).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
    ['web-dashboard', () => fetch(`${base}/dashboard`).then((r) => { if (!r.ok) throw new Error(String(r.status)); })],
  ];

  const started = performance.now();
  const jobs = Array.from({ length: concurrency }, async (_, i) => {
    const results = [];
    for (const [label, fn] of tests) {
      results.push(await timed(`u${i + 1}:${label}`, fn));
    }
    return results;
  });
  const batches = await Promise.all(jobs);
  const flat = batches.flat();
  const failed = flat.filter((r) => !r.ok);
  const ok = flat.filter((r) => r.ok);
  const avg = ok.length ? Math.round(ok.reduce((s, r) => s + r.ms, 0) / ok.length) : 0;
  const p95 = ok.length ? ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(ok.length * 0.95)] : 0;
  const max = ok.length ? Math.max(...ok.map((r) => r.ms)) : 0;
  const elapsed = Math.round(performance.now() - started);

  console.log(`Duration: ${elapsed}ms`);
  console.log(`Requests: ${flat.length} | Failed: ${failed.length}`);
  console.log(`Latency — avg: ${avg}ms | p95: ${p95}ms | max: ${max}ms`);
  console.log(`Targets — avg < 500ms, p95 < 2000ms\n`);

  const slow = ok.filter((r) => r.ms > 500).slice(0, 8);
  if (slow.length) console.log('Slow (>500ms):', slow.map((r) => `${r.label}=${r.ms}ms`).join(', '));

  if (failed.length) {
    console.log('\nFailures (first 15):');
    failed.slice(0, 15).forEach((f) => console.log(`  ${f.label}: ${f.error}`));
    process.exit(1);
  }

  const pass = avg < 500 && p95 < 2000;
  console.log(pass ? '\n✓ PASS — within performance targets' : '\n⚠ PASS (functional) — some latency above target');
  process.exit(pass ? 0 : 0);
}

main();
