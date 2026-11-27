import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Per-IP limit on FAILED password logins (password spraying / brute force).
 *
 * Successful logins are not counted, so a whole office signing in from one public IP is never
 * blocked, while an attacker guessing from that IP is stopped after `limit` failures within
 * `windowMs`. Per-account lockout still applies separately. In-memory: one API instance.
 */
export class FailedLoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    readonly limit = Number(process.env.AUTH_FAILED_LOGIN_LIMIT) > 0 ? Number(process.env.AUTH_FAILED_LOGIN_LIMIT) : 10,
    readonly windowMs = 10 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(ip: string) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(ip) ?? []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(ip, list);
    else this.failures.delete(ip);
    return list;
  }

  /** Throws 429 when this IP has too many recent failures. */
  assertAllowed(ip: string) {
    if (this.recent(ip).length >= this.limit) {
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed sign-in attempts from this network. Try again in a few minutes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(ip: string) {
    const list = this.recent(ip);
    list.push(this.now());
    this.failures.set(ip, list);
    if (this.failures.size > 50_000) this.failures.delete(this.failures.keys().next().value as string);
  }
}
