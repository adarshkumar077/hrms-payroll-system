import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpService, isOtpEligible } from './otp/otp.service';
import { MailService } from '../mail/mail.service';

/**
 * An OTP is never returned to the client in any environment. Without configured email (SMTP),
 * mobile OTP login reports itself unavailable instead of pretending to send.
 */
function authWith(otp?: OtpService) {
  const prisma = { company: { findFirst: async () => ({ id: 'c1', isActive: true }) } };
  return new AuthService(prisma as any, {} as any, { get: () => undefined } as any, {} as any, {} as any, otp);
}

describe('mobile OTP availability', () => {
  test('requestOtp is unavailable (503) when no OTP service / email is configured', async () => {
    await assert.rejects(() => authWith().requestOtp({ mobile: '9876543210' } as any), ServiceUnavailableException);
  });

  for (const env of [
    {},
    { EMAIL_PROVIDER: 'console', OTP_SHOW_IN_UI: 'true', NODE_ENV: 'development' },
    { SMTP_HOST: 'smtp.example.com' }, // host set but no From address
    { SMTP_FROM_EMAIL: 'hrms@example.com' }, // From set but no host
  ]) {
    test(`OTP disabled and never echoed for ${JSON.stringify(env)}`, async () => {
      const config = { get: (k: string) => (env as any)[k] ?? (k === 'JWT_ACCESS_SECRET' ? 'x'.repeat(40) : undefined) } as any;
      const mail = new MailService(config);
      const otp = new OtpService({} as any, config, mail, {} as any);
      assert.equal(otp.isEnabled(), false);
      const status = otp.status();
      assert.equal(status.enabled, false);
      assert.match(String(status.configurationError), /not configured/);
      assert.ok(!JSON.stringify(status).includes('x'.repeat(40)), 'no secret values in status');
      await assert.rejects(() => otp.request('c1', '9876543210', '1.2.3.4'), ServiceUnavailableException);
    });
  }
});

describe('isOtpEligible (employee accounts only)', () => {
  const base = {
    status: 'ACTIVE',
    employeeId: 'e1',
    employee: { isActive: true },
    userRoles: [{ role: { code: 'EMPLOYEE' } }],
  };
  test('active employee account is eligible', () => assert.equal(isOtpEligible(base), true));
  test('pending password change is eligible', () =>
    assert.equal(isOtpEligible({ ...base, status: 'PENDING_PASSWORD_CHANGE' }), true));
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'HR']) {
    test(`${role} is never eligible (keeps password login)`, () => {
      assert.equal(isOtpEligible({ ...base, userRoles: [{ role: { code: role } }] }), false);
      assert.equal(
        isOtpEligible({ ...base, userRoles: [{ role: { code: 'EMPLOYEE' } }, { role: { code: role } }] }),
        false,
      );
    });
  }
  test('inactive user is not eligible', () => assert.equal(isOtpEligible({ ...base, status: 'INACTIVE' }), false));
  test('locked user is not eligible', () => assert.equal(isOtpEligible({ ...base, status: 'LOCKED' }), false));
  test('inactive employee record is not eligible', () =>
    assert.equal(isOtpEligible({ ...base, employee: { isActive: false } }), false));
  test('account with no linked employee is not eligible', () =>
    assert.equal(isOtpEligible({ ...base, employeeId: null, employee: null }), false));
  test('null user is not eligible', () => assert.equal(isOtpEligible(null), false));
  for (const status of ['RESIGNED', 'TERMINATED', 'INACTIVE']) {
    test(`employment status ${status} is not eligible even if isActive was left true`, () =>
      assert.equal(isOtpEligible({ ...base, employee: { isActive: true, status } }), false));
  }
  test('PROBATION / NOTICE employees are eligible', () => {
    assert.equal(isOtpEligible({ ...base, employee: { isActive: true, status: 'PROBATION' } }), true);
    assert.equal(isOtpEligible({ ...base, employee: { isActive: true, status: 'NOTICE' } }), true);
  });
  test('timed lockout: refused while running, allowed once expired', () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const locked = { ...base, status: 'LOCKED' };
    assert.equal(isOtpEligible({ ...locked, lockedAt: new Date('2026-11-26T09:50:00Z') }, 30, now), false);
    assert.equal(isOtpEligible({ ...locked, lockedAt: new Date('2026-11-26T09:00:00Z') }, 30, now), true);
    assert.equal(isOtpEligible({ ...locked, lockedAt: null }, 30, now), false, 'HR lock (no timestamp) stays locked');
    assert.equal(isOtpEligible({ ...locked, lockedAt: new Date('2026-11-26T09:00:00Z') }), false);
  });
});

describe('OTP data retention', () => {
  test('purge deletes only rows older than 7 days', async () => {
    let where: any;
    const prisma = { otpChallenge: { deleteMany: async (args: any) => ((where = args.where), { count: 3 }) } };
    const otp = new OtpService(prisma as any, { get: () => undefined } as any, {} as any, {} as any);
    const before = Date.now();
    assert.equal(await otp.purgeOldChallenges(), 3);
    const cutoff = where.createdAt.lt.getTime();
    assert.ok(Math.abs(before - 7 * 86_400_000 - cutoff) < 5_000);
  });
});
