import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MonitoringService } from './monitoring.service';

function harness(env: Record<string, string | undefined>, opts: { failedLogins?: number; mailConfigured?: boolean; mailFailures?: number } = {}) {
  const sent: any[] = [];
  const audits: any[] = [];
  const prisma = {
    $queryRaw: async () => [{ '?column?': 1 }],
    auditLog: { count: async () => opts.failedLogins ?? 0 },
    company: { findFirst: async () => ({ id: 'c1' }) },
  };
  const mail = {
    isConfigured: () => opts.mailConfigured ?? true,
    stats: () => ({ configured: opts.mailConfigured ?? true, failuresLast15m: opts.mailFailures ?? 0, failuresLastHour: opts.mailFailures ?? 0, lastFailure: null, lastSuccessAt: null }),
    send: async (m: any) => { sent.push(m); return { ok: true, attempts: 1 }; },
  };
  const audit = { log: async (a: any) => { audits.push(a); } };
  const config = { get: (k: string) => env[k] };
  const svc = new MonitoringService(prisma as any, config as any, mail as any, audit as any);
  return { svc, sent, audits };
}

function statusFile(content: object) {
  const dir = mkdtempSync(join(tmpdir(), 'eitf-mon-'));
  const f = join(dir, 'last_status.json');
  writeFileSync(f, JSON.stringify(content));
  return f;
}
const goodBackup = (hoursAgo: number, extra: object = {}) => ({
  ok: true,
  finishedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  encrypted: true,
  database: { ok: true, bytes: 1000 },
  uploads: { state: 'ok', files: 3 },
  offsite: { state: 'ok' },
  ...extra,
});
const check = (checks: any[], key: string) => checks.find((c) => c.key === key);

describe('MonitoringService backup checks', () => {
  test('recent, encrypted, off-site backup is OK', async () => {
    const { svc } = harness({ BACKUP_STATUS_FILE: statusFile(goodBackup(2)) });
    assert.equal(check(await svc.runChecks(), 'backup').status, 'ok');
  });
  test('backup older than 26 h is critical', async () => {
    const { svc } = harness({ BACKUP_STATUS_FILE: statusFile(goodBackup(30)) });
    assert.equal(check(await svc.runChecks(), 'backup').status, 'critical');
  });
  test('failed run is critical', async () => {
    const { svc } = harness({ BACKUP_STATUS_FILE: statusFile(goodBackup(1, { ok: false, offsite: { state: 'failed' } })) });
    assert.equal(check(await svc.runChecks(), 'backup').status, 'critical');
  });
  test('missing status file (no backup ever completed) is critical', async () => {
    const { svc } = harness({ BACKUP_STATUS_FILE: join(tmpdir(), 'does-not-exist', 'last_status.json') });
    assert.equal(check(await svc.runChecks(), 'backup').status, 'critical');
  });
  test('local-only / unencrypted backup is a warning', async () => {
    const { svc } = harness({ BACKUP_STATUS_FILE: statusFile(goodBackup(1, { encrypted: false, offsite: { state: 'not_configured' } })) });
    assert.equal(check(await svc.runChecks(), 'backup').status, 'warn');
  });
});

describe('MonitoringService other checks', () => {
  test('email failures and failed-login spikes are critical', async () => {
    const { svc } = harness({}, { mailFailures: 4, failedLogins: 60 });
    const checks = await svc.runChecks();
    assert.equal(check(checks, 'email').status, 'critical');
    assert.equal(check(checks, 'failed_logins').status, 'critical');
    assert.equal(check(checks, 'database').status, 'ok');
  });
});

describe('MonitoringService alerts', () => {
  test('emails every ALERT_EMAILS address once, then not again within 6 h', async () => {
    const { svc, sent, audits } = harness({
      BACKUP_STATUS_FILE: statusFile(goodBackup(40)),
      ALERT_EMAILS: 'it@eitf.in, owner@eitf.in, not-an-email',
    });
    const first = await svc.monitor();
    assert.ok(first.alerted.includes('backup'));
    assert.deepEqual(sent.map((m) => m.to).sort(), ['it@eitf.in', 'owner@eitf.in']);
    assert.match(sent[0].text, /Backups/);
    assert.equal(audits.length, 1);
    const second = await svc.monitor();
    assert.deepEqual(second.alerted, []);
    assert.equal(sent.length, 2, 'no repeat alert within 6 hours');
  });
});
