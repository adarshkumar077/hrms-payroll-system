import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MailService, isDeliverableEmail, maskEmail } from './mail.service';
import { otpEmail } from './otp-email.template';

const cfg = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as any;
const ENV = { SMTP_HOST: 'smtp.example.com', SMTP_FROM_EMAIL: 'hrms@example.com', SMTP_FROM_NAME: 'EITF HRMS' };

function stub(behaviour: (n: number) => Promise<unknown>) {
  const calls: any[] = [];
  return {
    calls,
    transport: {
      sendMail: async (m: any) => { calls.push(m); return behaviour(calls.length); },
      verify: async () => true,
    } as any,
  };
}

describe('MailService', () => {
  test('is configured only with host + valid From address', () => {
    assert.equal(new MailService(cfg({})).isConfigured(), false);
    assert.equal(new MailService(cfg({ SMTP_HOST: 'h' })).isConfigured(), false);
    assert.equal(new MailService(cfg({ SMTP_FROM_EMAIL: 'a@b.co' })).isConfigured(), false);
    assert.equal(new MailService(cfg(ENV)).isConfigured(), true);
  });

  test('sends with the configured From header', async () => {
    const s = stub(async () => ({ messageId: '<m1@x>' }));
    const mail = MailService.withTransport(cfg(ENV), s.transport);
    const r = await mail.send({ to: 'emp@example.com', subject: 'S', text: 'T', category: 'test' });
    assert.deepEqual(r, { ok: true, messageId: '<m1@x>', attempts: 1 });
    assert.deepEqual(s.calls[0].from, { name: 'EITF HRMS', address: 'hrms@example.com' });
  });

  test('retries transient failures (max 3 attempts) then succeeds', async () => {
    const s = stub(async (n) => { if (n < 3) throw Object.assign(new Error('x'), { code: 'ECONNECTION' }); return { messageId: 'ok' }; });
    const r = await MailService.withTransport(cfg(ENV), s.transport).send({ to: 'a@b.co', subject: 's', text: 't', category: 'otp' });
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 3);
  });

  test('does not retry permanent failures (bad login / rejected recipient) and counts them', async () => {
    const s = stub(async () => { throw Object.assign(new Error('auth'), { code: 'EAUTH', responseCode: 535 }); });
    const mail = MailService.withTransport(cfg(ENV), s.transport);
    const r = await mail.send({ to: 'a@b.co', subject: 's', text: 't', category: 'otp' });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 1);
    assert.equal(s.calls.length, 1);
    assert.equal(mail.stats().failuresLast15m, 1);
    assert.match(r.error!, /EAUTH/);
  });

  test('gives up after 3 transient failures', async () => {
    const s = stub(async () => { throw Object.assign(new Error('t'), { code: 'ETIMEDOUT' }); });
    const r = await MailService.withTransport(cfg(ENV), s.transport).send({ to: 'a@b.co', subject: 's', text: 't', category: 'otp' });
    assert.deepEqual([r.ok, r.attempts, s.calls.length], [false, 3, 3]);
  });

  test('refuses invalid recipients and enforces the per-minute cap', async () => {
    const s = stub(async () => ({ messageId: 'x' }));
    const mail = MailService.withTransport(cfg({ ...ENV, MAIL_MAX_PER_MINUTE: '2' }), s.transport);
    assert.equal((await mail.send({ to: 'not-an-email', subject: 's', text: 't', category: 'x' })).error, 'invalid_recipient');
    await mail.send({ to: 'a@b.co', subject: 's', text: 't', category: 'x' });
    await mail.send({ to: 'a@b.co', subject: 's', text: 't', category: 'x' });
    assert.equal((await mail.send({ to: 'a@b.co', subject: 's', text: 't', category: 'x' })).error, 'rate_limited');
  });

  test('without SMTP settings nothing is sent', async () => {
    const r = await MailService.withTransport(cfg({}), null).send({ to: 'a@b.co', subject: 's', text: 't', category: 'x' });
    assert.deepEqual(r, { ok: false, error: 'smtp_not_configured', attempts: 0 });
  });
});

describe('email helpers', () => {
  test('maskEmail hides the local part', () => {
    assert.equal(maskEmail('ravi.kumar@example.test'), 'r***@example.test');
    assert.equal(maskEmail(null), '***');
  });
  test('isDeliverableEmail', () => {
    assert.equal(isDeliverableEmail('a.b@company.co.in'), true);
    for (const bad of ['', 'a@b', 'a b@c.com', 'a@b.c', '<x>@y.com', null]) assert.equal(isDeliverableEmail(bad as any), false);
  });
});

describe('OTP email template', () => {
  const t = otpEmail({ code: '482913', expiresInMinutes: 5, employeeName: '<b>Asha</b>', supportContact: 'hr@example.test' });
  test('contains the code, expiry, security warning and support contact', () => {
    for (const part of ['482913', '5 minutes', 'never share', 'hr@example.test', 'Enhancing IT Infrastructure']) {
      assert.ok(t.html.includes(part), `html missing ${part}`);
      assert.ok(t.text.toLowerCase().includes(part.toLowerCase()), `text missing ${part}`);
    }
  });
  test('escapes names in HTML', () => {
    assert.ok(!t.html.includes('<b>Asha</b>'));
    assert.ok(t.html.includes('&lt;b&gt;Asha&lt;/b&gt;'));
  });
});
