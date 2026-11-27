import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { ReportsService } from '../reports/reports.service';

/** Integrations must never report a fake success (no "stub: true" OK responses). */
function prismaStub(counts: { employee?: number; user?: number } = {}) {
  const logs: unknown[] = [];
  return {
    logs,
    employee: { count: async () => counts.employee ?? 0 },
    user: { count: async () => counts.user ?? 0 },
    integrationEventLog: { create: async (a: unknown) => (logs.push(a), a) },
    integrationConfig: { findUnique: async () => ({ isEnabled: true }) },
    notificationDispatchLog: { create: async (a: unknown) => (logs.push(a), a) },
    notification: { create: async (a: unknown) => a },
  };
}
const mail = (configured: boolean, sent: unknown[] = []) => ({
  isConfigured: () => configured,
  send: async (m: unknown) => (sent.push(m), { ok: true, attempts: 1 }),
  verifyConnection: async () => ({ ok: configured, error: configured ? undefined : 'smtp_not_configured' }),
});
const user = { id: 'u1', companyId: 'c1', roles: ['SUPER_ADMIN'] } as any;

test('SMS and WhatsApp refuse instead of pretending to send', async () => {
  const svc = new IntegrationsService(prismaStub() as any, {} as any, {} as any, mail(true) as any);
  await assert.rejects(svc.sendSms('c1', '9876543210', 'hi'), ServiceUnavailableException);
  await assert.rejects(svc.sendWhatsApp('c1', '9876543210', 'hi'), ServiceUnavailableException);
});

test('HR email: real send, only to addresses registered in the company', async () => {
  const sent: any[] = [];
  const stranger = new IntegrationsService(prismaStub() as any, {} as any, {} as any, mail(true, sent) as any);
  await assert.rejects(stranger.sendEmail('c1', 'outsider@evil.example', 'Hi', 'Body'), BadRequestException);
  assert.equal(sent.length, 0);

  const known = new IntegrationsService(prismaStub({ employee: 1 }) as any, {} as any, {} as any, mail(true, sent) as any);
  const r = await known.sendEmail('c1', 'Staff@Company.Example', 'Hi', 'Body');
  assert.equal(r.status, 'SENT');
  assert.equal(sent[0].to, 'staff@company.example');

  const off = new IntegrationsService(prismaStub({ employee: 1 }) as any, {} as any, {} as any, mail(false) as any);
  await assert.rejects(off.sendEmail('c1', 'staff@company.example', 'Hi', 'Body'), ServiceUnavailableException);
});

test('connection test reports the truth (no fake latency, no fake OK)', async () => {
  const svc = new IntegrationsService(prismaStub() as any, {} as any, {} as any, mail(false) as any);
  const email = await svc.testConnection(user, IntegrationProvider.EMAIL);
  assert.equal(email.ok, false);
  const other = await svc.testConnection(user, IntegrationProvider.SMS);
  assert.equal(other.ok, false);
  assert.ok(!('latencyMs' in other));
  const refresh = await svc.refresh(user, IntegrationProvider.SMS);
  assert.equal(refresh.ok, false);
});

test('report email: refuses without SMTP; with SMTP sends a CSV attachment to the requester only', async () => {
  const off = new ReportsService(prismaStub() as any, mail(false) as any);
  await assert.rejects(off.exportEmail('c1', 'u1', 'Headcount', [{ a: 1 }], 'me@company.example'), ServiceUnavailableException);

  const sent: any[] = [];
  const p = prismaStub();
  const on = new ReportsService(p as any, mail(true, sent) as any);
  const r = await on.exportEmail('c1', 'u1', 'Headcount', [{ code: 'E1', name: 'X' }], 'me@company.example');
  assert.equal(sent[0].to, 'me@company.example');
  assert.match(sent[0].attachments[0].filename, /Headcount\.csv$/);
  assert.equal(r.sentTo, 'm***@company.example');
  // The delivery log keeps counts only, never the report contents.
  assert.ok(!JSON.stringify(p.logs).includes('E1'));
});
