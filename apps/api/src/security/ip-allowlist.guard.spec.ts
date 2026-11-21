import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IpAllowlistGuard } from './ip-allowlist.guard';
import { SecurityService } from './security.service';

function run(req: any) {
  const security = Object.create(SecurityService.prototype) as SecurityService;
  (security as any).getIpAllowlist = async () => ['203.0.113.5'];
  const reflector = { getAllAndOverride: () => false } as any;
  const guard = new IpAllowlistGuard(reflector, security);
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
  return guard.canActivate(ctx);
}

test('spoofed X-Forwarded-For does not grant access', async () => {
  await assert.rejects(
    run({ ip: '198.51.100.9', headers: { 'x-forwarded-for': '203.0.113.5' }, user: { companyId: 'c' } }),
  );
});

test('req.ip on allowlist is allowed', async () => {
  assert.equal(await run({ ip: '203.0.113.5', headers: {}, user: { companyId: 'c' } }), true);
});
