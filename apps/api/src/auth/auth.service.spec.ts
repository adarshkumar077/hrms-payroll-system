import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as bcrypt from 'bcrypt';
import { generate, generateSecret } from 'otplib';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * AuthService.loginPassword with a stateful in-memory Prisma stub (Nest DI is bypassed because
 * tsx does not emit decorator metadata).
 */

type U = Record<string, any>;
const PASSWORD = 'Correct#Horse1';
let hash: string;

function makeHarness(settings: Record<string, unknown> = {}) {
  const users: U[] = [];
  const employees: U[] = [];
  const audits: any[] = [];
  const tokens: any[] = [];
  const prisma = {
    company: { findFirst: async () => ({ id: 'c1', isActive: true }) },
    companySetting: {
      findUnique: async ({ where }: any) => {
        const key = where.companyId_key.key;
        return key in settings ? { value: settings[key] } : null;
      },
    },
    user: {
      findFirst: async ({ where }: any) => {
        const u = users.find(
          (x) =>
            x.companyId === where.companyId &&
            (where.loginId ? x.loginId?.toLowerCase() === where.loginId.equals.toLowerCase() : true) &&
            (where.email ? x.email?.toLowerCase() === where.email.equals.toLowerCase() : true) &&
            (where.employeeId ? x.employeeId === where.employeeId : true),
        );
        return u ?? null;
      },
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    employee: {
      findFirst: async ({ where }: any) =>
        employees.find((e) => e.id === where.id && e.isActive === where.isActive) ?? null,
    },
    refreshToken: { create: async ({ data }: any) => tokens.push(data) },
    loginSession: { create: async () => ({}) },
  };
  const audit = { log: async (p: any) => audits.push(p) };
  const jwt = { signAsync: async (payload: any) => `jwt.${payload.sub}` };
  const config = { get: (k: string, d?: unknown) => (k === 'JWT_ACCESS_SECRET' ? 's' : d) };
  const security = {
    getSettingNumber: async (_c: string, k: string, d: number) => (k in settings ? Number(settings[k]) : d),
    getSettingBool: async (_c: string, k: string, d: boolean) => (k in settings ? Boolean(settings[k]) : d),
  };
  const svc = new AuthService(prisma as any, jwt as any, config as any, audit as any, security as any);
  return { svc, users, employees, audits, tokens };
}

function baseUser(over: U = {}): U {
  return {
    id: 'u1',
    companyId: 'c1',
    loginId: 'EMP001',
    email: 'emp@example.test',
    mobile: null,
    displayName: 'Emp One',
    passwordHash: hash,
    status: 'ACTIVE',
    employeeId: null,
    failedLoginAttempts: 0,
    lockedAt: null,
    totpEnabled: false,
    totpSecret: null,
    forcePasswordChange: false,
    userRoles: [{ role: { code: 'EMPLOYEE' } }],
    moduleAccess: [{ moduleKey: 'attendance', canAccess: true }],
    ...over,
  };
}

describe('AuthService.loginPassword', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(async () => {
    hash ??= await bcrypt.hash(PASSWORD, 4);
    h = makeHarness();
  });

  test('login success issues tokens, resets counters and audits LOGIN', async () => {
    h.users.push(baseUser({ failedLoginAttempts: 2 }));
    const res = await h.svc.loginPassword({ identifier: 'emp001', password: PASSWORD } as any);
    assert.equal(res.accessToken, 'jwt.u1');
    assert.ok(res.refreshToken);
    assert.deepEqual(res.user.roles, ['EMPLOYEE']);
    assert.deepEqual(res.user.moduleAccess, ['attendance']);
    assert.equal(h.users[0].failedLoginAttempts, 0);
    assert.equal(h.tokens.length, 1);
    assert.ok(h.audits.some((a) => a.action === 'LOGIN'));
  });

  test('login also works by email, case-insensitively', async () => {
    h.users.push(baseUser());
    const res = await h.svc.loginPassword({ email: 'EMP@example.test', password: PASSWORD } as any);
    assert.equal(res.user.id, 'u1');
  });

  test('missing identifier is a 400', async () => {
    await assert.rejects(h.svc.loginPassword({ password: PASSWORD } as any), BadRequestException);
  });

  test('wrong password: generic 401, failed attempt counted and audited', async () => {
    h.users.push(baseUser());
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: 'nope' } as any),
      (e: any) => e instanceof UnauthorizedException && /Invalid User ID/.test(e.message),
    );
    assert.equal(h.users[0].failedLoginAttempts, 1);
    assert.ok(h.audits.some((a) => a.action === 'LOGIN_FAILED'));
    assert.equal(h.tokens.length, 0);
  });

  test('unknown user gets the same generic 401 as a wrong password', async () => {
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'ghost', password: PASSWORD } as any),
      (e: any) => e instanceof UnauthorizedException && /Invalid User ID/.test(e.message),
    );
  });

  test('user without a password hash cannot log in', async () => {
    h.users.push(baseUser({ passwordHash: null }));
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
      UnauthorizedException,
    );
  });

  test('inactive user account is rejected even with the right password', async () => {
    h.users.push(baseUser({ status: 'INACTIVE' }));
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
      (e: any) => e instanceof ForbiddenException && /inactive/.test(e.message),
    );
    assert.equal(h.tokens.length, 0);
  });

  test('user linked to an inactive employee profile is rejected', async () => {
    h.users.push(baseUser({ employeeId: 'e1' }));
    h.employees.push({ id: 'e1', isActive: false });
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
      (e: any) => e instanceof UnauthorizedException && /Employee profile is inactive/.test(e.message),
    );
  });

  test('user linked to an active employee profile can log in', async () => {
    h.users.push(baseUser({ employeeId: 'e1' }));
    h.employees.push({ id: 'e1', isActive: true });
    const res = await h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any);
    assert.equal(res.user.employeeId, 'e1');
  });

  test('lockout: configured number of failures locks the account, then even the right password is refused', async () => {
    h = makeHarness({ 'security.max_failed_logins': 3 });
    h.users.push(baseUser());
    for (let i = 0; i < 3; i++) {
      await assert.rejects(h.svc.loginPassword({ identifier: 'EMP001', password: 'bad' } as any), UnauthorizedException);
    }
    assert.equal(h.users[0].status, 'LOCKED');
    assert.ok(h.users[0].lockedAt instanceof Date);
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
      (e: any) => e instanceof ForbiddenException && /locked/i.test(e.message),
    );
    assert.equal(h.tokens.length, 0);
  });

  test('lockout defaults to 5 failures', async () => {
    h.users.push(baseUser());
    for (let i = 0; i < 4; i++) {
      await assert.rejects(h.svc.loginPassword({ identifier: 'EMP001', password: 'bad' } as any), UnauthorizedException);
    }
    assert.equal(h.users[0].status, 'ACTIVE');
    await assert.rejects(h.svc.loginPassword({ identifier: 'EMP001', password: 'bad' } as any), UnauthorizedException);
    assert.equal(h.users[0].status, 'LOCKED');
  });

  test('lock auto-expires after the cool-down and the user can log in again', async () => {
    h.users.push(
      baseUser({
        status: 'LOCKED',
        failedLoginAttempts: 5,
        lockedAt: new Date(Date.now() - 31 * 60_000),
      }),
    );
    const res = await h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any);
    assert.equal(res.user.id, 'u1');
    assert.equal(h.users[0].status, 'ACTIVE');
    assert.equal(h.users[0].lockedAt, null);
  });

  test('lock inside the cool-down window is still refused', async () => {
    h.users.push(baseUser({ status: 'LOCKED', lockedAt: new Date(Date.now() - 60_000) }));
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
      ForbiddenException,
    );
  });

  test('LOCKED without a timestamp needs HR to unlock', async () => {
    h.users.push(baseUser({ status: 'LOCKED', lockedAt: null }));
    await assert.rejects(
      h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
      (e: any) => e instanceof ForbiddenException && /Contact HR/.test(e.message),
    );
  });

  describe('2FA', () => {
    test('2FA user without a code is refused (no session issued)', async () => {
      h.users.push(baseUser({ totpEnabled: true, totpSecret: generateSecret() }));
      await assert.rejects(
        h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any),
        (e: any) => e instanceof UnauthorizedException && /2FA/.test(e.message),
      );
      assert.equal(h.tokens.length, 0);
    });

    test('2FA user with a wrong code is refused', async () => {
      const secret = generateSecret();
      h.users.push(baseUser({ totpEnabled: true, totpSecret: secret }));
      const good = await generate({ secret });
      const bad = good === '000000' ? '111111' : '000000';
      await assert.rejects(
        h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD, totpCode: bad } as any),
        UnauthorizedException,
      );
    });

    test('2FA user with a valid code gets a session', async () => {
      const secret = generateSecret();
      h.users.push(baseUser({ totpEnabled: true, totpSecret: secret }));
      const code = await generate({ secret });
      const res = await h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD, totpCode: code } as any);
      assert.equal(res.user.totpEnabled, true);
      assert.equal(h.tokens.length, 1);
    });

    test('2FA is not checked when the password is wrong (generic error, not a 2FA hint)', async () => {
      h.users.push(baseUser({ totpEnabled: true, totpSecret: generateSecret() }));
      await assert.rejects(
        h.svc.loginPassword({ identifier: 'EMP001', password: 'bad' } as any),
        (e: any) => /Invalid User ID/.test(e.message),
      );
    });

    test('admins are flagged mustEnable2fa when policy requires it and 2FA is off', async () => {
      h = makeHarness({ 'security.require_2fa_for_admins': true });
      h.users.push(baseUser({ userRoles: [{ role: { code: 'HR' } }] }));
      const res = await h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any);
      assert.equal(res.mustEnable2fa, true);
    });

    test('plain employees are never flagged mustEnable2fa', async () => {
      h = makeHarness({ 'security.require_2fa_for_admins': true });
      h.users.push(baseUser());
      const res = await h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD } as any);
      assert.equal(res.mustEnable2fa, false);
    });

    test(
      'repeated wrong TOTP codes count towards lockout',
      { todo: 'bug: auth.service.ts verifyTotpIfNeeded (line ~361) never calls registerFailedLogin, so a correct password + wrong 2FA code can be retried without lockout (only the route throttle limits it)' },
      async () => {
        const secret = generateSecret();
        h = makeHarness({ 'security.max_failed_logins': 3 });
        h.users.push(baseUser({ totpEnabled: true, totpSecret: secret }));
        const good = await generate({ secret });
        const bad = good === '000000' ? '111111' : '000000';
        for (let i = 0; i < 3; i++) {
          await assert.rejects(
            h.svc.loginPassword({ identifier: 'EMP001', password: PASSWORD, totpCode: bad } as any),
          );
        }
        assert.equal(h.users[0].status, 'LOCKED');
      },
    );
  });
});
