import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FailedLoginLimiter } from './failed-login-limiter';

test('blocks an IP after N failures, ignores other IPs, and recovers after the window', () => {
  let t = 1_000_000;
  const l = new FailedLoginLimiter(3, 60_000, () => t);
  for (let i = 0; i < 3; i++) {
    l.assertAllowed('1.1.1.1');
    l.recordFailure('1.1.1.1');
  }
  assert.throws(() => l.assertAllowed('1.1.1.1'), (e: any) => e.getStatus() === 429);
  l.assertAllowed('2.2.2.2'); // another network is unaffected
  t += 61_000;
  l.assertAllowed('1.1.1.1'); // window passed
});

test('successful logins are never counted (busy office behind one IP)', () => {
  const l = new FailedLoginLimiter(3);
  for (let i = 0; i < 500; i++) l.assertAllowed('9.9.9.9');
});
