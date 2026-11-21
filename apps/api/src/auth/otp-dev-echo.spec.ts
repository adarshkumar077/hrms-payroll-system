import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from './auth.service';

/**
 * requestOtp returns the code to the client ONLY for local development:
 * OTP_SHOW_IN_UI=true + non-production NODE_ENV + console SMS provider. Any other combination
 * must not include it.
 */
function svcWith(env: Record<string, string | undefined>) {
  const prisma = {
    company: { findFirst: async () => ({ id: 'c1', isActive: true }) },
    user: { findFirst: async () => ({ id: 'u1', companyId: 'c1', mobile: '9876543210' }) },
    otpChallenge: { create: async () => ({}) },
  };
  const config = { get: (k: string) => env[k] };
  return new AuthService(prisma as any, {} as any, config as any, {} as any, {} as any);
}

const DEV = { OTP_SHOW_IN_UI: 'true', NODE_ENV: 'development', SMS_PROVIDER: 'console' };

describe('requestOtp dev code echo', () => {
  test('returns a 6-digit devCode when explicitly enabled in development', async () => {
    const res: any = await svcWith(DEV).requestOtp({ mobile: '9876543210' } as any);
    assert.match(res.devCode, /^\d{6}$/);
  });

  for (const [name, env] of [
    ['flag unset', { ...DEV, OTP_SHOW_IN_UI: undefined }],
    ['flag not exactly "true"', { ...DEV, OTP_SHOW_IN_UI: '1' }],
    ['production', { ...DEV, NODE_ENV: 'production' }],
    ['real SMS provider configured', { ...DEV, SMS_PROVIDER: 'msg91' }],
  ] as const) {
    test(`never returns devCode when ${name}`, async () => {
      const res: any = await svcWith(env).requestOtp({ mobile: '9876543210' } as any);
      assert.equal('devCode' in res, false);
    });
  }

  test('never returns devCode for an unknown mobile (no enumeration)', async () => {
    const svc = svcWith(DEV);
    (svc as any).prisma.user.findFirst = async () => null;
    const res: any = await svc.requestOtp({ mobile: '0000000000' } as any);
    assert.equal('devCode' in res, false);
  });
});
