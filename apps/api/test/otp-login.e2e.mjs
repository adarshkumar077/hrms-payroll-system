/**
 * End-to-end tests: Mobile OTP login + employee data isolation.
 *
 * Runs the REAL compiled API (dist/main.js) against a SEPARATE throw-away database
 * (eitf_hrms_test on the embedded Postgres) — the development database is never touched.
 * The only stand-in is a local SMTP receiver (a minimal mail server inside this test), so the
 * real MailService / nodemailer path is exercised end to end and the test reads the OTP from the
 * email that actually arrived. Real-provider delivery is verified separately (docs/EMAIL_OTP_SETUP.md).
 *
 * Usage (from apps/api, embedded Postgres running, after `npm run build`):
 *   node --test test/otp-login.e2e.mjs
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');
const bcrypt = require('bcrypt');

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = 'eitf_hrms_test';
const PG = { host: '127.0.0.1', port: 5435, user: 'eitf', password: 'eitf_dev_password' };
const TEST_DB_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${TEST_DB}?schema=public`;
const API_PORT = 3101;
const MOCK_PORT = 39091;
const BASE = `http://127.0.0.1:${API_PORT}/api/v1`;
const PASSWORD = 'Str0ng#TestPass1';

let prisma;
let api;
let apiLogs = '';
let mock;
const smsInbox = new Map(); // national mobile -> [{ otp, at }] (filled from received emails)
const sentCodes = [];
const emailToMobile = new Map(); // registered employee email -> national mobile
const receivedEmails = []; // { to, subject }
const ids = {};

// ── helpers ──────────────────────────────────────────────────────────────────
let ipSeq = 10;
const freshIp = () => `203.0.113.${ipSeq++}`;

async function call(method, url, { body, token, ip = freshIp() } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, text };
}

const smsCount = (m) => (smsInbox.get(m) ?? []).length;
async function waitForSms(m, previous, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const list = smsInbox.get(m) ?? [];
    if (list.length > previous) return list[list.length - 1].otp;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
async function requestAndReadOtp(mobile, ip = freshIp()) {
  const before = smsCount(mobile);
  const r = await call('POST', '/auth/otp/request', { body: { mobile }, ip });
  assert.equal(r.status, 201, `request failed: ${r.text}`);
  const otp = await waitForSms(mobile, before);
  assert.ok(otp, 'OTP email was not delivered to the test mail server');
  return otp;
}
const wrongCode = (otp) => String((Number(otp) + 1) % 1_000_000).padStart(6, '0');
async function passwordLogin(identifier) {
  return call('POST', '/auth/login', { body: { identifier, password: PASSWORD } });
}

// ── setup ────────────────────────────────────────────────────────────────────
async function recreateTestDb() {
  if (TEST_DB !== 'eitf_hrms_test') throw new Error('refusing: not the test database');
  const c = new pg.Client({ ...PG, database: 'postgres' });
  await c.connect();
  await c.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [TEST_DB]);
  await c.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await c.query(`CREATE DATABASE ${TEST_DB} WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  await c.end();
  const env = { ...process.env, DATABASE_URL: TEST_DB_URL, BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '' };
  execSync('npx prisma migrate deploy', { cwd: API_DIR, env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: API_DIR, env, stdio: 'pipe' });
}

async function seedFixtures() {
  process.env.DATABASE_URL = TEST_DB_URL;
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const company = await prisma.company.findFirstOrThrow({ where: { isActive: true } });
  const companyId = company.id;
  ids.companyId = companyId;
  const role = async (code) => (await prisma.role.findFirstOrThrow({ where: { companyId, code } })).id;
  const roleIds = { EMPLOYEE: await role('EMPLOYEE'), HR: await role('HR'), SUPER_ADMIN: await role('SUPER_ADMIN') };
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Every test employee has a registered email (needed for email OTP) unless email === null.
  const employee = (code, mobile, isActive = true, email = `${code.toLowerCase()}@emp.test`) => {
    if (email && mobile) emailToMobile.set(email, mobile.replace(/\D/g, '').slice(-10));
    return prisma.employee.create({ data: { companyId, employeeCode: code, firstName: code, mobile, email, isActive } });
  };
  const user = (loginId, { employeeId = null, mobile = null, roles = ['EMPLOYEE'], status = 'ACTIVE' } = {}) =>
    prisma.user.create({
      data: {
        companyId,
        loginId,
        email: `${loginId.toLowerCase()}@test.local`,
        mobile,
        passwordHash,
        displayName: loginId,
        status,
        employeeId,
        userRoles: { create: roles.map((r) => ({ roleId: roleIds[r] })) },
      },
    });

  const A = await employee('EMPA', '9876500001');
  const B = await employee('EMPB', '9876500002');
  const C = await employee('EMPC', '9876500003', false); // inactive employee record
  const D = await employee('EMPD', '9876500004'); // no login account (unlinked)
  const E = await employee('EMPE', '9876500005'); // login account INACTIVE
  const F = await employee('EMPF', '9876500008'); // users.mobile empty: resolved via employee.mobile
  const G1 = await employee('EMPG1', '9876500009'); // number shared with another account
  const G2 = await employee('EMPG2', null);
  const H = await employee('EMPH', '9876500010'); // employee who is also HR

  await user('EMPA', { employeeId: A.id, mobile: '9876500001' });
  await user('EMPB', { employeeId: B.id, mobile: '+91 9876500002' });
  await user('EMPC', { employeeId: C.id, mobile: '9876500003' });
  await user('EMPE', { employeeId: E.id, mobile: '9876500005', status: 'INACTIVE' });
  await user('EMPF', { employeeId: F.id, mobile: null });
  await user('EMPG1', { employeeId: G1.id, mobile: null });
  await user('EMPG2', { employeeId: G2.id, mobile: '9876500009' });
  await user('EMPH', { employeeId: H.id, mobile: '9876500010', roles: ['EMPLOYEE', 'HR'] });
  await user('HRTEST', { mobile: '9876500006', roles: ['HR'] });
  await user('SATEST', { mobile: '9876500007', roles: ['SUPER_ADMIN'] });

  // Review fixes
  const K = await employee('EMPK', '9876500011'); // HR changed number; login account still has the old one
  await user('EMPK', { employeeId: K.id, mobile: '9876500012' });
  const L = await employee('EMPL', '+91 98765-00013'); // saved in a non-standard format (e.g. import)
  await user('EMPL', { employeeId: L.id, mobile: null });
  const M = await prisma.employee.create({
    data: { companyId, employeeCode: 'EMPM', firstName: 'EMPM', mobile: '9876500014', email: 'empm@emp.test', isActive: true, status: 'RESIGNED' },
  });
  // Active employee with a login but NO registered email: must contact HR, never gets an OTP.
  const Q = await employee('EMPQ', '9876500017', true, null);
  await user('EMPQ', { employeeId: Q.id, mobile: '9876500017' });
  await user('EMPM', { employeeId: M.id, mobile: '9876500014' });
  const N = await employee('EMPN', '9876500015'); // timed lockout already expired
  const userN = await user('EMPN', { employeeId: N.id, mobile: '9876500015', status: 'LOCKED' });
  await prisma.user.update({ where: { id: userN.id }, data: { lockedAt: new Date(Date.now() - 2 * 3600_000), failedLoginAttempts: 5 } });
  const O = await employee('EMPO', '9876500016'); // locked just now
  const userO = await user('EMPO', { employeeId: O.id, mobile: '9876500016', status: 'LOCKED' });
  await prisma.user.update({ where: { id: userO.id }, data: { lockedAt: new Date(), failedLoginAttempts: 5 } });
  Object.assign(ids, { A: A.id, B: B.id, D: D.id, userN: userN.id });

  // Records belonging to employee B, used for the isolation checks.
  const leaveType = await prisma.leaveType.upsert({
    where: { companyId_code: { companyId, code: 'TST' } },
    update: {},
    create: { companyId, code: 'TST', name: 'Test leave' },
  });
  ids.leaveB = (
    await prisma.leaveApplication.create({
      data: { companyId, employeeId: B.id, leaveTypeId: leaveType.id, fromDate: new Date(), toDate: new Date(), days: 1 },
    })
  ).id;
  ids.resignationB = (
    await prisma.resignation.create({ data: { companyId, employeeId: B.id, lastWorkingDay: new Date() } })
  ).id;
  const wf = await prisma.approvalWorkflow.create({
    data: { companyId, type: 'LEAVE', name: 'Test WF', steps: { create: [{ stepOrder: 1, approverRole: 'HR' }] } },
  });
  ids.approvalB = (
    await prisma.approvalInstance.create({
      data: { companyId, workflowId: wf.id, type: 'LEAVE', entityType: 'LeaveApplication', entityId: ids.leaveB, requesterId: B.id, currentStepOrder: 1 },
    })
  ).id;
  // A workflow whose current step is approved by the EMPLOYEE role: an approver must still see it.
  const wfEmp = await prisma.approvalWorkflow.create({
    data: { companyId, type: 'EXPENSE', name: 'Peer WF', steps: { create: [{ stepOrder: 1, approverRole: 'EMPLOYEE' }] } },
  });
  ids.approvalPeer = (
    await prisma.approvalInstance.create({
      data: { companyId, workflowId: wfEmp.id, type: 'EXPENSE', entityType: 'Expense', entityId: 'x', requesterId: B.id, currentStepOrder: 1 },
    })
  ).id;
  const run = await prisma.payrollRun.create({ data: { companyId, year: 2026, month: 10 } });
  ids.payslipB = (
    await prisma.payrollLine.create({
      data: {
        payrollRunId: run.id,
        companyId,
        employeeId: B.id,
        earningsJson: {},
        deductionsJson: {},
        grossEarnings: 99999,
        totalDeductions: 0,
        netPay: 99999,
      },
    })
  ).id;
  const docType = await prisma.documentType.upsert({
    where: { companyId_code: { companyId, code: 'PAN' } },
    update: {},
    create: { companyId, code: 'PAN', name: 'PAN' },
  });
  ids.docB = (
    await prisma.employeeDocument.create({
      data: { companyId, employeeId: B.id, documentTypeId: docType.id, fileName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 1, storageKey: 'none' },
    })
  ).id;
}

/** Minimal SMTP receiver: EHLO/MAIL/RCPT/DATA/QUIT, records recipient + subject of each message. */
function startMockSmtp() {
  return new Promise((resolve) => {
    mock = net.createServer((sock) => {
      let buf = '';
      let inData = false;
      let rcpt = [];
      let data = '';
      sock.write('220 test-smtp ready\r\n');
      sock.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              const subject = (data.match(/^Subject: (.*)$/m) ?? [])[1] ?? '';
              const code = (subject.match(/(\d{6})\s*$/) ?? [])[1];
              for (const to of rcpt) {
                receivedEmails.push({ to, subject });
                const mobile = emailToMobile.get(to.toLowerCase());
                if (code) {
                  sentCodes.push(code);
                  const key = mobile ?? `email:${to}`;
                  const list = smsInbox.get(key) ?? [];
                  list.push({ otp: code, at: Date.now() });
                  smsInbox.set(key, list);
                }
              }
              rcpt = [];
              data = '';
              sock.write('250 OK queued\r\n');
            } else {
              data += line + '\n';
            }
            continue;
          }
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test-smtp\r\n250 8BITMIME\r\n');
          else if (cmd === 'MAIL') sock.write('250 OK\r\n');
          else if (cmd === 'RCPT') { rcpt.push((line.match(/<([^>]+)>/) ?? [])[1] ?? ''); sock.write('250 OK\r\n'); }
          else if (cmd === 'DATA') { inData = true; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
          else if (cmd === 'QUIT') { sock.write('221 Bye\r\n'); sock.end(); }
          else sock.write('250 OK\r\n');
        }
      });
      sock.on('error', () => undefined);
    });
    mock.listen(MOCK_PORT, '127.0.0.1', resolve);
  });
}
const totalEmails = () => receivedEmails.length;

async function startApi() {
  api = spawn(process.execPath, ['dist/main.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: TEST_DB_URL,
      API_PORT: String(API_PORT),
      COOKIE_SECURE: 'false',
      // Pin strict per-IP limits so the rate-limit cases below exercise them.
      OTP_REQUEST_LIMIT_PER_MINUTE: '5',
      OTP_MAX_PER_IP_PER_HOUR: '30',
      REDIS_URL: '',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(MOCK_PORT),
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false', // the local test receiver has no TLS; production requires it
      SMTP_FROM_EMAIL: 'hrms-otp@test.local',
      SMTP_FROM_NAME: 'EITF HRMS (test)',
      SUPPORT_CONTACT: 'hr@test.local',
      OTP_HASH_SECRET: randomBytes(32).toString('hex'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout.on('data', (d) => (apiLogs += d));
  api.stderr.on('data', (d) => (apiLogs += d));
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API did not start:\n${apiLogs.slice(-2000)}`);
}

before(async () => {
  await recreateTestDb();
  await seedFixtures();
  await startMockSmtp();
  await startApi();
});

after(async () => {
  api?.kill();
  mock?.close();
  await prisma?.$disconnect();
});

// ── OTP tests ────────────────────────────────────────────────────────────────
describe('OTP generation and email delivery', () => {
  test('status reports OTP login enabled with the fixed policy', async () => {
    const r = await call('GET', '/auth/otp/status');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { enabled: true, codeLength: 6, expiresInSeconds: 300, resendAfterSeconds: 30 });
  });

  test('request emails a 6-digit OTP to the registered address and never returns it', async () => {
    const before = smsCount('9876500001');
    const r = await call('POST', '/auth/otp/request', { body: { mobile: '+91 98765 00001' } });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body).sort(), ['expiresInSeconds', 'message', 'resendAfterSeconds']);
    assert.match(r.body.message, /email address registered with HR/);
    const otp = await waitForSms('9876500001', before);
    assert.match(otp, /^\d{6}$/);
    assert.ok(!r.text.includes(otp), 'OTP leaked in the response');
    const mail = receivedEmails.at(-1);
    assert.equal(mail.to, 'empa@emp.test', 'sent to the employee record email');
    assert.match(mail.subject, /EITF HRMS login code/);
  });

  test('OTP is stored only as a keyed hash bound to the challenge', async () => {
    const rows = await prisma.otpChallenge.findMany({ where: { mobile: '9876500001' }, orderBy: { createdAt: 'desc' } });
    const last = rows[0];
    const otp = smsInbox.get('9876500001').at(-1).otp;
    assert.equal(last.smsStatus, 'sent');
    assert.notEqual(last.codeHash, otp);
    assert.notEqual(last.codeHash, createHash('sha256').update(otp).digest('hex'), 'unkeyed SHA-256 must not be used');
    assert.match(last.codeHash, /^[0-9a-f]{64}$/);
  });
});

describe('verification', () => {
  test('wrong OTP is rejected; correct OTP logs the employee in', async () => {
    const mobile = '9876500002';
    const otp = await requestAndReadOtp(mobile);
    const bad = await call('POST', '/auth/otp/verify', { body: { mobile, code: wrongCode(otp) } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.message, 'Incorrect OTP. 4 attempts remaining.');
    const ok = await call('POST', '/auth/otp/verify', { body: { mobile, code: otp } });
    assert.equal(ok.status, 201, ok.text);
    assert.ok(ok.body.accessToken);
    assert.equal(ok.body.user.employeeId, ids.B);
    assert.deepEqual(ok.body.user.roles, ['EMPLOYEE']);
  });

  test('an OTP works only once', async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    const otp = await requestAndReadOtp('9876500001');
    const first = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } });
    assert.equal(first.status, 201);
    const again = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } });
    assert.equal(again.status, 401);
  });

  test('two simultaneous verifications of one OTP: exactly one succeeds', async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    const otp = await requestAndReadOtp('9876500001');
    const results = await Promise.all(
      [1, 2, 3].map(() => call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } })),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
  });

  test('an expired OTP is rejected', async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    const otp = await requestAndReadOtp('9876500001');
    await prisma.otpChallenge.updateMany({
      where: { mobile: '9876500001', consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } });
    assert.equal(r.status, 401);
    assert.equal(r.body.message, 'This OTP has expired. Please request a new OTP.');
    const again = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } });
    assert.equal(again.body.message, 'No active OTP for this number. Please request a new OTP.');
  });

  test('unregistered numbers get the same incorrect-OTP wording (no enumeration)', async () => {
    const mobile = '9123499999';
    const req = await call('POST', '/auth/otp/request', { body: { mobile } });
    assert.equal(req.status, 201);
    const r = await call('POST', '/auth/otp/verify', { body: { mobile, code: '000000' } });
    assert.equal(r.status, 401);
    assert.match(r.body.message, /^Incorrect OTP\. \d attempts remaining\.$/);
  });

  test('a new OTP replaces the previous one', async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    const first = await requestAndReadOtp('9876500001');
    await prisma.otpChallenge.updateMany({ where: { mobile: '9876500001' }, data: { createdAt: new Date(Date.now() - 31_000) } });
    const second = await requestAndReadOtp('9876500001');
    if (first !== second) {
      const old = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: first } });
      assert.equal(old.status, 401);
    }
    const ok = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: second } });
    assert.equal(ok.status, 201);
  });

  test('5 wrong attempts invalidate the OTP (even the correct code then fails)', async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    const otp = await requestAndReadOtp('9876500001');
    const msgs = [];
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: wrongCode(otp) } });
      assert.equal(r.status, 401);
      msgs.push(r.body.message);
    }
    assert.match(msgs[4], /Too many incorrect attempts/);
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } });
    assert.equal(r.status, 401);
  });
});

describe('resend cooldown and rate limits', () => {
  test('resend within 30 seconds is refused', async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    await requestAndReadOtp('9876500001');
    const r = await call('POST', '/auth/otp/request', { body: { mobile: '9876500001' } });
    assert.equal(r.status, 429);
    assert.match(r.body.message, /wait \d+ seconds/);
  });

  test('cooldown applies identically to unregistered numbers (no enumeration)', async () => {
    const first = await call('POST', '/auth/otp/request', { body: { mobile: '9123400000' } });
    const second = await call('POST', '/auth/otp/request', { body: { mobile: '9123400000' } });
    assert.equal(first.status, 201);
    assert.equal(second.status, 429);
  });

  test('per-mobile limit: max 5 OTPs per hour', async () => {
    const mobile = '9876500001';
    await prisma.otpChallenge.deleteMany({ where: { mobile } });
    const old = new Date(Date.now() - 10 * 60_000);
    for (let i = 0; i < 5; i++) {
      await prisma.otpChallenge.create({
        data: { companyId: ids.companyId, mobile, codeHash: 'x', expiresAt: old, createdAt: old, consumedAt: old },
      });
    }
    const r = await call('POST', '/auth/otp/request', { body: { mobile } });
    assert.equal(r.status, 429);
    assert.match(r.body.message, /Too many OTP requests for this number/);
    await prisma.otpChallenge.deleteMany({ where: { mobile } });
  });

  test('per-IP limit: max 30 OTP requests per hour', async () => {
    const ip = '198.51.100.77';
    const old = new Date(Date.now() - 5 * 60_000);
    for (let i = 0; i < 30; i++) {
      await prisma.otpChallenge.create({
        data: { companyId: ids.companyId, mobile: `90000000${String(i).padStart(2, '0')}`, codeHash: 'x', expiresAt: old, createdAt: old, requestIp: ip },
      });
    }
    const r = await call('POST', '/auth/otp/request', { body: { mobile: '9876500001' }, ip });
    assert.equal(r.status, 429);
    assert.match(r.body.message, /from this network/);
  });

  test('per-IP burst limit: more than 5 requests a minute are throttled', async () => {
    const ip = '198.51.100.88';
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const r = await call('POST', '/auth/otp/request', { body: { mobile: `91111111${String(i).padStart(2, '0')}` }, ip });
      statuses.push(r.status);
    }
    assert.ok(statuses.slice(0, 5).every((s) => s === 201), statuses.join(','));
    assert.ok(statuses.slice(5).every((s) => s === 429), statuses.join(','));
  });
});

describe('accounts that must not receive an OTP (same public response, no email sent, no account created)', () => {
  const cases = [
    ['active employee with no registered email (must contact HR)', '9876500017'],
    ['unregistered number', '9123456789'],
    ['inactive employee record', '9876500003'],
    ['employee without a login account', '9876500004'],
    ['inactive login account', '9876500005'],
    ['number shared by two accounts', '9876500009'],
    ['HR account', '9876500006'],
    ['Super Admin account', '9876500007'],
    ['employee who also has the HR role', '9876500010'],
  ];
  for (const [name, mobile] of cases) {
    test(name, async () => {
      const usersBefore = await prisma.user.count();
      const before = totalEmails();
      const r = await call('POST', '/auth/otp/request', { body: { mobile } });
      assert.equal(r.status, 201);
      assert.equal(r.body.message, 'If this mobile number is registered for employee login, an OTP has been sent to the email address registered with HR.');
      await new Promise((res) => setTimeout(res, 400));
      assert.equal(totalEmails(), before, 'no email may be sent');
      assert.equal(await prisma.user.count(), usersBefore, 'no account may be created');
      const v = await call('POST', '/auth/otp/verify', { body: { mobile, code: '123456' } });
      assert.equal(v.status, 401);
    });
  }

  test('employee marked RESIGNED (isActive still true) gets no OTP', async () => {
    const before = totalEmails();
    const r = await call('POST', '/auth/otp/request', { body: { mobile: '9876500014' } });
    assert.equal(r.status, 201);
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(totalEmails(), before);
  });

  test('old number left on the login account stops working once HR changes the employee mobile', async () => {
    const before = totalEmails();
    await call('POST', '/auth/otp/request', { body: { mobile: '9876500012' } });
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(totalEmails(), before, 'old number must not trigger an OTP email');
    const otp = await requestAndReadOtp('9876500011');
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500011', code: otp } });
    assert.equal(r.status, 201);
  });

  test('number saved in a non-standard format ("+91 98765-00013") still matches', async () => {
    const otp = await requestAndReadOtp('9876500013');
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '09876500013', code: otp } });
    assert.equal(r.status, 201, r.text);
  });

  test('account locked just now gets no OTP', async () => {
    const before = totalEmails();
    await call('POST', '/auth/otp/request', { body: { mobile: '9876500016' } });
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(totalEmails(), before);
  });

  test('account whose timed lockout has expired can log in and is unlocked (same as password login)', async () => {
    const otp = await requestAndReadOtp('9876500015');
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500015', code: otp } });
    assert.equal(r.status, 201, r.text);
    const u = await prisma.user.findUnique({ where: { id: ids.userN } });
    assert.equal(u.status, 'ACTIVE');
    assert.equal(u.lockedAt, null);
  });

  test('OTP logins are labelled in the audit log', async () => {
    const row = await prisma.auditLog.findFirst({
      where: { actorId: ids.userN, action: 'LOGIN' },
      orderBy: { createdAt: 'desc' },
    });
    assert.deepEqual(row.metadata, { method: 'mobile_otp' });
  });

  test('number stored only on the employee record still works (HR-managed source of truth)', async () => {
    const otp = await requestAndReadOtp('9876500008');
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500008', code: otp } });
    assert.equal(r.status, 201);
  });

  test('employee deactivated after requesting cannot complete login', async () => {
    const mobile = '9876500002';
    await prisma.otpChallenge.deleteMany({ where: { mobile } });
    const otp = await requestAndReadOtp(mobile);
    await prisma.employee.update({ where: { id: ids.B }, data: { isActive: false } });
    const r = await call('POST', '/auth/otp/verify', { body: { mobile, code: otp } });
    await prisma.employee.update({ where: { id: ids.B }, data: { isActive: true } });
    assert.equal(r.status, 401);
  });
});

describe('existing password logins are unchanged', () => {
  for (const loginId of ['SATEST', 'HRTEST', 'EMPA']) {
    test(`${loginId} can still sign in with User ID + password`, async () => {
      const r = await passwordLogin(loginId);
      assert.equal(r.status, 201, r.text);
      assert.ok(r.body.accessToken);
    });
  }
  test('wrong password is still rejected', async () => {
    const r = await call('POST', '/auth/login', { body: { identifier: 'HRTEST', password: 'wrong-password' } });
    assert.equal(r.status, 401);
  });
});

// ── Employee data isolation ─────────────────────────────────────────────────
describe('employee data isolation (logged in via OTP as employee A)', () => {
  let tokenA;
  let tokenHr;
  before(async () => {
    await prisma.otpChallenge.deleteMany({ where: { mobile: '9876500001' } });
    const otp = await requestAndReadOtp('9876500001');
    const r = await call('POST', '/auth/otp/verify', { body: { mobile: '9876500001', code: otp } });
    assert.equal(r.status, 201);
    tokenA = r.body.accessToken;
    tokenHr = (await passwordLogin('HRTEST')).body.accessToken;
  });

  for (const url of [
    '/me',
    '/me/profile',
    '/dashboard/employee',
    '/me/attendance',
    '/me/attendance/summary',
    '/me/salary',
    '/me/payslips',
    '/payroll/my-payslips',
    '/me/leave/balances',
    '/me/leave/applications',
  ]) {
    test(`own data: GET ${url} → 200`, async () => {
      const r = await call('GET', url, { token: tokenA });
      // A test employee with no salary structure gets the app's normal "not set up" answer.
      const notSetUp = r.status === 404 && /No active salary structure/.test(r.text);
      assert.ok(r.status === 200 || notSetUp, `${r.status} ${r.text.slice(0, 300)}`);
      assert.ok(!r.text.includes(ids.B), `${url} returned another employee's id`);
    });
  }

  test('own profile is employee A', async () => {
    const r = await call('GET', '/me/profile', { token: tokenA });
    assert.equal(r.body.id ?? r.body.employee?.id, ids.A);
  });

  const forbidden = () => [
    ['GET', `/employees/${ids.B}`],
    ['GET', `/employees/${ids.B}/payroll-config`],
    ['GET', `/employees/${ids.B}/payroll-history`],
    ['GET', `/employees/${ids.B}/salary-tracker`],
    ['GET', `/salary/structures/${ids.B}`],
    ['GET', `/esd/${ids.B}`],
    ['GET', `/attendance/records/${ids.B}/2026-10-01`],
    ['GET', `/onboarding/${ids.B}`],
    ['GET', `/exit/${ids.resignationB}`],
    ['GET', `/exit/${ids.resignationB}/fnf`],
    ['GET', `/approvals/${ids.approvalB}`],
    ['GET', `/payroll/my-payslips/${ids.payslipB}`],
    ['GET', `/documents/${ids.docB}/download`],
    ['PUT', `/me/leave/applications/${ids.leaveB}/withdraw`],
    ['POST', '/export/payroll'],
    ['POST', '/export/employees'],
    ['GET', '/employees'],
  ];
  test('cannot reach employee B or company-wide data by changing IDs', async () => {
    const leaks = [];
    for (const [method, url] of forbidden()) {
      const r = await call(method, url, { token: tokenA, body: method === 'GET' ? undefined : {} });
      if (![403, 404].includes(r.status)) leaks.push(`${method} ${url} → ${r.status}`);
    }
    assert.deepEqual(leaks, []);
  });

  test('query-string employeeId is ignored for employees (attendance sheet, goals, summary)', async () => {
    const sheet = await call('GET', `/attendance/sheet?employeeId=${ids.B}`, { token: tokenA });
    assert.equal(sheet.status, 200);
    assert.ok(!sheet.text.includes(ids.B));
    const goals = await call('GET', `/performance/goals?employeeId=${ids.B}`, { token: tokenA });
    assert.equal(goals.status, 403);
    const summary = await call('GET', `/performance/${ids.B}/summary`, { token: tokenA });
    assert.ok(!summary.text.includes(ids.B));
  });

  test('an employee who is the approver of the current step can still open that approval', async () => {
    const r = await call('GET', `/approvals/${ids.approvalPeer}`, { token: tokenA });
    assert.equal(r.status, 200, r.text.slice(0, 200));
  });

  test('password-login audit entries are unchanged (no method label)', async () => {
    await passwordLogin('SATEST');
    const sa = await prisma.user.findFirst({ where: { loginId: 'SATEST' } });
    const row = await prisma.auditLog.findFirst({ where: { actorId: sa.id, action: 'LOGIN' }, orderBy: { createdAt: 'desc' } });
    assert.equal(row.metadata, null);
  });

  test('HR can still view the same records (no regression)', async () => {
    for (const url of [`/exit/${ids.resignationB}`, `/approvals/${ids.approvalB}`, `/employees/${ids.B}/payroll-config`]) {
      const r = await call('GET', url, { token: tokenHr });
      assert.equal(r.status, 200, `${url}: ${r.text.slice(0, 200)}`);
    }
  });
});

// ── Secrets hygiene ─────────────────────────────────────────────────────────
describe('no OTP or personal data in logs', () => {
  test('API logs contain none of the delivered OTPs', () => {
    assert.ok(sentCodes.length > 5, 'expected several OTPs to have been sent');
    for (const code of sentCodes) {
      assert.ok(!apiLogs.includes(code), `OTP ${code.slice(0, 2)}**** found in API logs`);
    }
  });
  test('API logs contain no full employee email address (only masked)', () => {
    for (const email of emailToMobile.keys()) {
      assert.ok(!apiLogs.includes(email), `full email ${email.slice(0, 2)}*** found in API logs`);
    }
  });
});
