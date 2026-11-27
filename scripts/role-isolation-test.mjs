#!/usr/bin/env node
/**
 * Four-role access-control and employee data-isolation test against a running stack.
 *
 *   RBAC_TEST_ALLOW_WRITES=1 SA_LOGIN=SA001 SA_PASS=… node scripts/role-isolation-test.mjs http://127.0.0.1:18080
 *
 * WRITES TEST DATA: creates an Admin, an HR user and two employees (codes RBT-…, emails @rbac.test).
 * Run it ONLY on a test stack, never on production. Re-running reuses the same records.
 */
import { randomBytes } from 'node:crypto';

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base || process.env.RBAC_TEST_ALLOW_WRITES !== '1') {
  console.error('Usage: RBAC_TEST_ALLOW_WRITES=1 SA_LOGIN=… SA_PASS=… node scripts/role-isolation-test.mjs <test-stack-url>');
  console.error('This creates test users/employees. Never run it against production.');
  process.exit(2);
}
const api = `${base}/api/v1`;
const pw = () => `Rt${randomBytes(9).toString('hex')}9Z`;
let failures = 0;
const results = [];

async function call(token, method, path, body) {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}
async function login(id, password) {
  const r = await call(null, 'POST', '/auth/login', { identifier: id, password });
  if (r.status !== 201) throw new Error(`login ${id}: ${r.status} ${JSON.stringify(r.json)?.slice(0, 120)}`);
  return r.json;
}
/** Logs in; if a password change is forced, sets a new random one. Returns a usable token. */
async function session(id, password) {
  let s = await login(id, password);
  if (s.forcePasswordChange) {
    const next = pw();
    const c = await call(s.accessToken, 'POST', '/auth/password/change', { currentPassword: password, newPassword: next, confirmPassword: next });
    if (c.status !== 201) throw new Error(`password change ${id}: ${c.status} ${JSON.stringify(c.json)}`);
    s = await login(id, next);
  }
  return s;
}
function expect(role, label, actual, allowed) {
  const ok = allowed ? actual >= 200 && actual < 300 : actual === 403 || actual === 404;
  results.push({ role, label, expected: allowed ? '2xx' : '403/404', actual, ok });
  if (!ok) failures++;
}

const sa = await session(process.env.SA_LOGIN, process.env.SA_PASS);
const SA = sa.accessToken;

// --- fixtures (idempotent) ---
async function ensureManaged(loginId, role, email, mobile) {
  const password = pw();
  const r = await call(SA, 'POST', '/admin/users', { loginId, email, mobile, displayName: `RBAC ${role}`, role, password, confirmPassword: password });
  if (r.status === 201) return { loginId, password };
  // Exists already: reset its password through the admin API.
  const list = await call(SA, 'GET', '/admin/users');
  const u = (Array.isArray(list.json) ? list.json : list.json?.items ?? []).find((x) => x.loginId === loginId);
  if (!u) throw new Error(`cannot create or find ${loginId}: ${r.status} ${JSON.stringify(r.json)}`);
  const rp = await call(SA, 'POST', `/admin/users/${u.id}/reset-password`, { password, confirmPassword: password });
  if (rp.status >= 300) throw new Error(`reset ${loginId}: ${rp.status} ${JSON.stringify(rp.json)}`);
  return { loginId, password: rp.json?.password ?? rp.json?.temporaryPassword ?? password };
}
async function ensureEmployee(code, email, mobile) {
  const password = pw();
  let r = await call(SA, 'POST', '/employees', {
    employeeCode: code, firstName: 'RBAC', lastName: code, email, mobile, department: 'QA', designation: 'Tester',
    createLogin: true, username: code.toLowerCase(), password, confirmPassword: password,
  });
  let id = r.json?.id ?? r.json?.employee?.id;
  if (r.status !== 201) {
    const list = await call(SA, 'GET', `/employees?search=${code}&pageSize=5`);
    const e = (list.json?.items ?? []).find((x) => x.employeeCode === code);
    if (!e) throw new Error(`cannot create or find ${code}: ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
    id = e.id;
    r = await call(SA, 'POST', `/employees/${id}/credentials/reset`, { username: code.toLowerCase(), password });
    if (r.status >= 300) throw new Error(`reset ${code}: ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
  }
  return { id, loginId: code.toLowerCase(), password };
}

const admin = await ensureManaged('RBT-ADM', 'ADMIN', 'admin@rbac.test', '9000000101');
const hr = await ensureManaged('RBT-HR', 'HR', 'hr@rbac.test', '9000000102');
const empA = await ensureEmployee('RBT-E1', 'e1@rbac.test', '9000000103');
const empB = await ensureEmployee('RBT-E2', 'e2@rbac.test', '9000000104');

const tokens = {
  SUPER_ADMIN: SA,
  ADMIN: (await session(admin.loginId, admin.password)).accessToken,
  HR: (await session(hr.loginId, hr.password)).accessToken,
  EMPLOYEE: (await session(empA.loginId, empA.password)).accessToken,
};

// --- matrix: [label, method, path, body, roles allowed] ---
const matrix = [
  ['list all employees', 'GET', '/employees?pageSize=5', null, ['SUPER_ADMIN', 'ADMIN', 'HR']],
  ["read another employee's record", 'GET', `/employees/${empB.id}`, null, ['SUPER_ADMIN', 'ADMIN', 'HR']],
  ["edit another employee's mobile/email", 'PUT', `/employees/${empB.id}`, { email: 'e2@rbac.test' }, ['SUPER_ADMIN', 'HR']],
  ['edit own profile (self-service)', 'PUT', '/me/profile', { personalEmail: 'x@rbac.test' }, []],
  ['own profile', 'GET', '/me/profile', null, ['EMPLOYEE']],
  ['own payslips', 'GET', '/me/payslips', null, ['EMPLOYEE']],
  ['own attendance summary', 'GET', '/me/attendance/summary', null, ['EMPLOYEE']],
  ['own leave balances', 'GET', '/me/leave/balances', null, ['EMPLOYEE']],
  ['payroll runs (Super Admin only)', 'GET', '/payroll/runs', null, ['SUPER_ADMIN']],
  ['audit log', 'GET', '/security/audit', null, ['SUPER_ADMIN']],
  ['backups', 'GET', '/security/backups', null, ['SUPER_ADMIN']],
  ['manage admin users (list)', 'GET', '/auth/admin-users', null, ['SUPER_ADMIN']],
  ['create users', 'POST', '/admin/users', { loginId: 'RBT-X' }, ['SUPER_ADMIN']],
  ['employee import history', 'GET', '/employee-import/jobs', null, ['SUPER_ADMIN', 'ADMIN', 'HR']],
  ['employee import COMMIT', 'POST', '/employee-import/commit', {}, ['SUPER_ADMIN']],
  ['system health', 'GET', '/admin/system-health', null, ['SUPER_ADMIN']],
  ['email status / test', 'GET', '/admin/email/status', null, ['SUPER_ADMIN']],
];
for (const [label, method, path, body, allowed] of matrix) {
  for (const [role, token] of Object.entries(tokens)) {
    const r = await call(token, method, path, body);
    // "allowed" means not blocked by permissions; a 400 from validation still proves access was granted.
    const status = allowed.includes(role) && r.status === 400 ? 200 : r.status;
    expect(role, label, status, allowed.includes(role));
  }
}

// --- isolation: employee A must not see B's data through any self-service or id route ---
const iso = [
  ['B via /employees/:id', `/employees/${empB.id}`],
  ['B payslips via query', `/me/payslips?employeeId=${empB.id}`],
  ['B attendance via query', `/me/attendance/summary?employeeId=${empB.id}`],
  ['B onboarding record', `/onboarding/${empB.id}`],
];
for (const [label, path] of iso) {
  const r = await call(tokens.EMPLOYEE, 'GET', path);
  const leaked = r.status < 300 && JSON.stringify(r.json ?? '').includes('RBT-E2');
  results.push({ role: 'EMPLOYEE(A)', label: `isolation: ${label}`, expected: 'no B data', actual: leaked ? 'LEAKED' : r.status, ok: !leaked });
  if (leaked) failures++;
}
const own = await call(tokens.EMPLOYEE, 'GET', '/me/profile');
const ownOk = own.status === 200 && JSON.stringify(own.json).includes('RBT-E1') && !JSON.stringify(own.json).includes('RBT-E2');
results.push({ role: 'EMPLOYEE(A)', label: 'own profile shows only A', expected: 'A only', actual: own.status, ok: ownOk });
if (!ownOk) failures++;

// --- unauthenticated ---
for (const path of ['/employees', '/me/profile', '/payroll/runs', '/security/audit']) {
  const r = await call(null, 'GET', path);
  results.push({ role: 'ANONYMOUS', label: path, expected: '401', actual: r.status, ok: r.status === 401 });
  if (r.status !== 401) failures++;
}

const w = (s, n) => String(s).padEnd(n);
console.log(`\n${w('ROLE', 13)}${w('CHECK', 42)}${w('EXPECTED', 11)}${w('ACTUAL', 8)}RESULT`);
for (const r of results) console.log(`${w(r.role, 13)}${w(r.label, 42)}${w(r.expected, 11)}${w(r.actual, 8)}${r.ok ? 'PASS' : 'FAIL'}`);
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
