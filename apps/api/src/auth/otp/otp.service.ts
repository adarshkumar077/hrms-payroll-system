import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AuditAction, Prisma, UserStatus } from '@prisma/client';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SmsService } from '../../sms/sms.service';
import { maskMobile, normalizeIndianMobile } from './mobile.util';

/** Policy (fixed by the security requirements, not configurable downwards by env). */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const OTP_MAX_PER_MOBILE_PER_HOUR = 5;
export const OTP_MAX_PER_MOBILE_PER_DAY = 10;
export const OTP_MAX_PER_IP_PER_HOUR = 30;

export const OTP_SENT_MESSAGE =
  'If this mobile number is registered for employee login, an OTP has been sent.';
export const OTP_INVALID_MESSAGE = 'Invalid or expired OTP.';
export const OTP_EXPIRED_MESSAGE = 'This OTP has expired. Please request a new OTP.';
export const OTP_NONE_MESSAGE = 'No active OTP for this number. Please request a new OTP.';
export const OTP_TOO_MANY_ATTEMPTS_MESSAGE = 'Too many incorrect attempts. Please request a new OTP.';
export const otpIncorrectMessage = (remaining: number) =>
  remaining > 0
    ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    : 'Incorrect OTP. Please request a new OTP.';
export const OTP_UNAVAILABLE_MESSAGE =
  'Mobile OTP login is not configured on this server: no SMS provider is set up. ' +
  'Please sign in with your password, or ask your administrator to configure SMS (see docs/SMS-OTP-LOGIN.md).';

const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];

/** Employment statuses that end self-service access even if `isActive` was left true. */
const ENDED_EMPLOYMENT = ['INACTIVE', 'TERMINATED', 'RESIGNED'];
/** Retention for OTP rows (they hold mobile numbers and IPs); the daily limit needs only 24 h. */
export const OTP_RETENTION_DAYS = 7;

type EligibilityInput = {
  status: UserStatus | string;
  lockedAt?: Date | null;
  employeeId: string | null;
  userRoles: { role: { code: string } | null }[];
  employee?: { isActive: boolean; status?: string | null } | null;
};

/**
 * OTP login is for employee self-service accounts only. Super Admin / Admin / HR keep their
 * password (+2FA) login unchanged, so possession of a phone never bypasses an admin password.
 *
 * `lockoutMinutes`: a LOCKED account whose timed lockout has already expired is eligible (the
 * login step then auto-unlocks it, exactly like password login). Without it, LOCKED is refused.
 */
export function isOtpEligible(
  user: EligibilityInput | null | undefined,
  lockoutMinutes?: number,
  now: Date = new Date(),
): boolean {
  if (!user) return false;
  const roles = user.userRoles.map((ur) => ur.role?.code).filter(Boolean) as string[];
  if (!roles.includes('EMPLOYEE')) return false;
  if (roles.some((r) => PRIVILEGED_ROLES.includes(r))) return false;
  if (!user.employeeId || !user.employee?.isActive) return false;
  if (user.employee.status && ENDED_EMPLOYMENT.includes(user.employee.status)) return false;
  if (user.status === UserStatus.ACTIVE || user.status === UserStatus.PENDING_PASSWORD_CHANGE) return true;
  if (user.status === UserStatus.LOCKED && user.lockedAt && lockoutMinutes !== undefined) {
    return now.getTime() >= user.lockedAt.getTime() + lockoutMinutes * 60_000;
  }
  return false;
}

/** Last 10 digits of a stored number, whatever format it was saved in. */
function nationalDigits(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const d = stored.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

export class OtpRateLimitException extends HttpException {
  constructor(message: string, retryAfterSeconds: number) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message, retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

type VerifyOutcome =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: 'none' | 'expired' | 'mismatch' | 'too_many';
      userId?: string | null;
      remaining?: number;
    };

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  isEnabled(): boolean {
    return this.sms.isOtpDeliveryEnabled() && this.hashKey() !== null;
  }

  status() {
    const enabled = this.isEnabled();
    return {
      enabled,
      codeLength: OTP_LENGTH,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      // Names no setting values: safe to show on the public login page.
      ...(enabled ? {} : { configurationError: OTP_UNAVAILABLE_MESSAGE }),
    };
  }

  // ── Hashing ────────────────────────────────────────────────────────────────

  /**
   * HMAC key for OTP hashes. Prefer a dedicated OTP_HASH_SECRET; otherwise derive a separate key
   * from JWT_ACCESS_SECRET (never the JWT key itself). Null = no secret configured → OTP disabled.
   */
  private hashKey(): Buffer | null {
    const dedicated = (this.config.get<string>('OTP_HASH_SECRET') ?? '').trim();
    if (dedicated.length >= 32) return Buffer.from(dedicated, 'utf8');
    const jwt = (this.config.get<string>('JWT_ACCESS_SECRET') ?? '').trim();
    if (jwt.length >= 32) return createHmac('sha256', jwt).update('eitf-otp-hash-key-v1').digest();
    return null;
  }

  /** The hash binds the code to its challenge id, so equal codes never produce equal hashes. */
  private hashCode(challengeId: string, code: string): string {
    const key = this.hashKey();
    if (!key) throw new ServiceUnavailableException(OTP_UNAVAILABLE_MESSAGE);
    return createHmac('sha256', key).update(`${challengeId}:${code}`).digest('hex');
  }

  private static sameHash(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }

  private static generateCode(): string {
    return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
  }

  /** Serialises request/verify for one mobile number (cooldown + single-use are race-free). */
  private async lockMobile(tx: Prisma.TransactionClient, companyId: string, mobile: string) {
    const key = `otp:${companyId}:${mobile}`;
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
  }

  private assertEnabled() {
    if (!this.isEnabled()) throw new ServiceUnavailableException(OTP_UNAVAILABLE_MESSAGE);
  }

  // ── Account resolution ─────────────────────────────────────────────────────

  async lockoutMinutes(companyId: string): Promise<number> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'security.lockout_minutes' } },
    });
    const n = Number(row?.value as number);
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  /**
   * Finds the single employee login account for a mobile number.
   *
   * - Numbers match on their last 10 digits, whatever format they were saved in.
   * - The employee record's mobile (maintained by HR) is authoritative: a login account's own
   *   `users.mobile` only counts when its linked employee has no mobile on file. So when HR
   *   changes an employee's number, the old number stops working immediately.
   * - A number that maps to more than one account is refused (logged for HR), never guessed.
   * - Never creates or changes accounts.
   */
  async findEligibleUserId(companyId: string, mobile: string): Promise<string | null> {
    const [empRows, userRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM employees
        WHERE company_id = ${companyId} AND mobile IS NOT NULL
          AND right(regexp_replace(mobile, '[^0-9]', '', 'g'), 10) = ${mobile}`,
      this.prisma.$queryRaw<{ id: string; employee_id: string | null }[]>`
        SELECT id, employee_id FROM users
        WHERE company_id = ${companyId} AND mobile IS NOT NULL
          AND right(regexp_replace(mobile, '[^0-9]', '', 'g'), 10) = ${mobile}`,
    ]);

    const byEmployee = empRows.length
      ? await this.prisma.user.findMany({
          where: { companyId, employeeId: { in: empRows.map((e) => e.id) } },
          select: { id: true },
        })
      : [];

    // users.mobile only counts when the linked employee has no number of its own on file.
    const linkedIds = userRows.map((u) => u.employee_id).filter((x): x is string => Boolean(x));
    const linkedEmployees = linkedIds.length
      ? await this.prisma.employee.findMany({
          where: { companyId, id: { in: linkedIds } },
          select: { id: true, mobile: true },
        })
      : [];
    const employeeMobile = new Map(linkedEmployees.map((e) => [e.id, nationalDigits(e.mobile)]));
    const byUserMobile = userRows.filter((u) => {
      if (!u.employee_id) return true; // unlinked accounts still count towards ambiguity
      const own = employeeMobile.get(u.employee_id);
      return own === null || own === undefined || own === mobile;
    });

    const ids = [...new Set([...byEmployee.map((u) => u.id), ...byUserMobile.map((u) => u.id)])];
    if (ids.length === 0) return null;
    if (ids.length > 1) {
      this.logger.warn(
        `OTP login refused: mobile ${maskMobile(mobile)} is linked to ${ids.length} accounts. HR should fix the duplicate.`,
      );
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: ids[0], companyId },
      select: {
        id: true,
        status: true,
        lockedAt: true,
        employeeId: true,
        userRoles: { select: { role: { select: { code: true } } } },
        employee: { select: { isActive: true, status: true } },
      },
    });
    const lockout = user?.status === UserStatus.LOCKED ? await this.lockoutMinutes(companyId) : undefined;
    return isOtpEligible(user, lockout) ? user!.id : null;
  }

  /** Daily purge of old OTP rows (mobile numbers and IPs are personal data). */
  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async purgeOldChallenges() {
    const cutoff = new Date(Date.now() - OTP_RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count) this.logger.log(`Purged ${count} OTP challenge(s) older than ${OTP_RETENTION_DAYS} days`);
    return count;
  }

  // ── Request ────────────────────────────────────────────────────────────────

  async request(companyId: string, rawMobile: string, ip?: string | null) {
    this.assertEnabled();
    const mobile = normalizeIndianMobile(rawMobile);
    if (!mobile) throw new BadRequestException('Enter a valid 10-digit Indian mobile number.');

    if (ip) {
      const ipCount = await this.prisma.otpChallenge.count({
        where: { requestIp: ip, createdAt: { gte: new Date(Date.now() - 3600_000) } },
      });
      if (ipCount >= OTP_MAX_PER_IP_PER_HOUR) {
        throw new OtpRateLimitException('Too many OTP requests from this network. Try again later.', 3600);
      }
    }

    // Resolved for every number, registered or not, so timing and responses stay uniform.
    const userId = await this.findEligibleUserId(companyId, mobile);
    const id = randomUUID();
    const code = OtpService.generateCode();
    const codeHash = this.hashCode(id, code);

    await this.prisma.$transaction(async (tx) => {
      await this.lockMobile(tx, companyId, mobile);
      const now = Date.now();

      const last = await tx.otpChallenge.findFirst({
        where: { companyId, mobile },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (last) {
        const waitMs = last.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - now;
        if (waitMs > 0) {
          const secs = Math.ceil(waitMs / 1000);
          throw new OtpRateLimitException(`Please wait ${secs} seconds before requesting a new OTP.`, secs);
        }
      }

      const [hourCount, dayCount] = await Promise.all([
        tx.otpChallenge.count({ where: { companyId, mobile, createdAt: { gte: new Date(now - 3600_000) } } }),
        tx.otpChallenge.count({ where: { companyId, mobile, createdAt: { gte: new Date(now - 86_400_000) } } }),
      ]);
      if (hourCount >= OTP_MAX_PER_MOBILE_PER_HOUR || dayCount >= OTP_MAX_PER_MOBILE_PER_DAY) {
        throw new OtpRateLimitException(
          'Too many OTP requests for this number. Try again later.',
          dayCount >= OTP_MAX_PER_MOBILE_PER_DAY ? 86_400 : 3600,
        );
      }

      // A new OTP supersedes any older unused one.
      await tx.otpChallenge.updateMany({
        where: { companyId, mobile, consumedAt: null },
        data: { consumedAt: new Date(now) },
      });

      await tx.otpChallenge.create({
        data: {
          id,
          companyId,
          userId,
          mobile,
          codeHash,
          purpose: 'login',
          expiresAt: new Date(now + OTP_TTL_SECONDS * 1000),
          requestIp: ip ?? null,
          smsStatus: userId ? 'queued' : 'not_sent',
        },
      });
    });

    // Delivery is not awaited: the response time must not reveal whether the number is registered.
    if (userId) {
      void this.deliver(id, mobile, code).catch((err) =>
        this.logger.error(`OTP delivery bookkeeping failed for ${maskMobile(mobile)}: ${String(err)}`),
      );
    }

    return {
      message: OTP_SENT_MESSAGE,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  /** Exposed for tests; sends the SMS and records the outcome (never the code). */
  async deliver(challengeId: string, mobile: string, code: string) {
    const result = await this.sms.sendOtp(mobile, code);
    await this.prisma.otpChallenge.update({
      where: { id: challengeId },
      data: {
        smsStatus: result.ok ? 'sent' : 'failed',
        providerMessageId: result.providerMessageId ?? null,
      },
    });
    if (!result.ok) {
      this.logger.error(`OTP SMS delivery failed for ${maskMobile(mobile)} via ${this.sms.providerName}: ${result.error}`);
    }
    return result;
  }

  // ── Verify ─────────────────────────────────────────────────────────────────

  /** Returns the user id on success. Every failure is a generic 401. */
  async verify(
    companyId: string,
    rawMobile: string,
    rawCode: string,
    meta?: { ip?: string; ua?: string },
  ): Promise<string> {
    this.assertEnabled();
    const mobile = normalizeIndianMobile(rawMobile);
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!mobile || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
      throw new UnauthorizedException(OTP_INVALID_MESSAGE);
    }

    const outcome: VerifyOutcome = await this.prisma.$transaction(async (tx) => {
      await this.lockMobile(tx, companyId, mobile);
      const now = new Date();
      const ch = await tx.otpChallenge.findFirst({
        where: { companyId, mobile, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!ch) return { ok: false, reason: 'none' };
      if (ch.expiresAt <= now) {
        await tx.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: now } });
        return { ok: false, reason: 'expired', userId: ch.userId };
      }

      if (ch.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        await tx.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: now } });
        return { ok: false, reason: 'too_many', userId: ch.userId };
      }

      const attempts = ch.attempts + 1;
      const matches = OtpService.sameHash(ch.codeHash, this.hashCode(ch.id, code));
      if (!matches) {
        const exhausted = attempts >= OTP_MAX_VERIFY_ATTEMPTS;
        await tx.otpChallenge.update({
          where: { id: ch.id },
          data: { attempts, consumedAt: exhausted ? now : null },
        });
        return {
          ok: false,
          reason: exhausted ? 'too_many' : 'mismatch',
          userId: ch.userId,
          remaining: OTP_MAX_VERIFY_ATTEMPTS - attempts,
        };
      }

      // Single use: consumed inside the same locked transaction that checked it.
      await tx.otpChallenge.update({ where: { id: ch.id }, data: { attempts, consumedAt: now } });
      if (!ch.userId) return { ok: false, reason: 'mismatch', remaining: 0 };
      return { ok: true, userId: ch.userId };
    });

    if (outcome.ok) return outcome.userId;

    if (outcome.userId) {
      await this.audit
        .log({
          companyId,
          actorId: outcome.userId,
          action: AuditAction.LOGIN_FAILED,
          entityType: 'User',
          entityId: outcome.userId,
          ipAddress: meta?.ip,
          userAgent: meta?.ua,
          metadata: { method: 'mobile_otp', reason: outcome.reason },
        })
        .catch(() => undefined);
    }
    // Registered and unregistered numbers both have challenges, so these specific messages do
    // not reveal whether a number belongs to an employee.
    const message =
      outcome.reason === 'too_many'
        ? OTP_TOO_MANY_ATTEMPTS_MESSAGE
        : outcome.reason === 'expired'
          ? OTP_EXPIRED_MESSAGE
          : outcome.reason === 'none'
            ? OTP_NONE_MESSAGE
            : otpIncorrectMessage(outcome.remaining ?? 0);
    throw new UnauthorizedException(message);
  }
}
