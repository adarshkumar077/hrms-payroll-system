#!/usr/bin/env node
/**
 * Final launch smoke test — run against production HTTPS URL before go-live.
 * Usage: node scripts/smoke-test.mjs https://hrms.yourdomain.com
 */
const base = (process.argv[2] || process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
if (!base || base.includes('localhost') || base.includes('192.168')) {
  console.error('Provide production HTTPS URL: node scripts/smoke-test.mjs https://hrms.yourdomain.com');
  process.exit(1);
}

const user = process.env.LOAD_TEST_USER || 'superadmin';
const pass = process.env.LOAD_TEST_PASS || 'Super@123';

const checks = [];

async function ok(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    checks.push({ name, pass: false, error: e.message });
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

async function main() {
  console.log(`\n=== Production Smoke Test ===\n${base}\n`);

  let token = '';
  await ok('HTTPS health', async () => {
    const r = await fetch(`${base}/api/v1/health`);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (j.db !== 'ok') throw new Error('db not ok');
  });

  await ok('Web home', async () => {
    const r = await fetch(`${base}/`);
    if (!r.ok) throw new Error(String(r.status));
  });

  await ok('Login', async () => {
    const r = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: user, password: pass }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    token = j.accessToken;
    if (!token) throw new Error('no token');
  });

  const h = { Authorization: `Bearer ${token}` };
  const routes = [
    ['Dashboard HR', '/dashboard/hr'],
    ['Employees', '/employees?take=10'],
    ['CRM leads', '/crm/leads'],
    ['CRM tasks', '/crm/tasks'],
    ['Payroll runs', '/payroll/runs'],
    ['Leave balances', '/me/leave/balances'],
    ['Attendance summary', '/me/attendance/summary'],
  ];

  for (const [name, path] of routes) {
    await ok(name, async () => {
      const r = await fetch(`${base}/api/v1${path}`, { headers: h });
      if (!r.ok) throw new Error(String(r.status));
    });
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
