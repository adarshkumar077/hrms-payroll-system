import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, RoleCode, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../security/security.service';
import {
  LoginPasswordDto,
  RequestOtpDto,
  VerifyOtpDto,
  SetupSuperAdminDto,
  CreateAdminUserDto,
} from './dto/auth.dto';
import { AuthUser } from './decorators/current-user.decorator';
import {
  isProtectedSuperAdmin,
  PROTECTED_SUPER_ADMIN_MSG,
} from './protected-super-admin';
import { parseUserAgent } from '../common/ua.util';

const INVALID_LOGIN = 'Invalid User ID/Email or Password.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => SecurityService))
    private readonly security: SecurityService,
  ) {}

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async resolveCompanyId(companyId?: string) {
    if (companyId) {
      const c = await this.prisma.company.findFirst({
        where: { id: companyId, isActive: true },
      });
      if (!c) throw new BadRequestException('Invalid company');
      return c.id;
    }
    const first = await this.prisma.company.findFirst({ where: { isActive: true } });
    if (!first) throw new BadRequestException('No active company configured');
    return first.id;
  }

  private async getSettingNumber(companyId: string, key: string, fallback: number) {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    if (row == null) return fallback;
    const n = Number(row.value as number);
    return Number.isFinite(n) ? n : fallback;
  }

  async requestOtp(dto: RequestOtpDto) {
    const companyId = await this.resolveCompanyId(dto.companyId);
    const user = await this.prisma.user.findFirst({
      where: { companyId, mobile: dto.mobile, status: { not: UserStatus.INACTIVE } },
    });
    if (!user) {
      // Do not reveal whether mobile exists
      return { message: 'If the mobile is registered, an OTP has been sent.', expiresIn: 300 };
    }

    const length = Number(this.config.get('OTP_LENGTH') ?? 6);
    const ttl = Number(this.config.get('OTP_TTL_SECONDS') ?? 300);
    const code = String(randomInt(0, 10 ** length)).padStart(length, '0');

    await this.prisma.otpChallenge.create({
      data: {
        companyId,
        userId: user.id,
        mobile: dto.mobile,
        codeHash: this.hash(code),
        purpose: 'login',
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });

    // Never log OTP codes — security requirement
    const provider = this.config.get('SMS_PROVIDER') ?? 'console';
    if (provider === 'console' && this.config.get('NODE_ENV') !== 'production') {
      this.logger.debug(`OTP sent to mobile ending ${dto.mobile.slice(-4)} (dev only)`);
    }

    return { message: 'If the mobile is registered, an OTP has been sent.', expiresIn: ttl };
  }

  async verifyOtp(dto: VerifyOtpDto, meta?: { ip?: string; ua?: string }) {
    const companyId = await this.resolveCompanyId(dto.companyId);
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        companyId,
        mobile: dto.mobile,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.codeHash !== this.hash(dto.code)) {
      if (challenge) {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
      }
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.findFirst({
      where: { id: challenge.userId!, companyId },
      include: { userRoles: { include: { role: true } }, moduleAccess: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    await this.ensureNotLocked(user);
    await this.verifyTotpIfNeeded(user, dto.totpCode);

    return this.issueSession(user, meta);
  }

  private async getNextLoginId(companyId: string, role: 'SA' | 'HR') {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        loginId: { startsWith: role },
      },
      select: { loginId: true },
      orderBy: { loginId: 'desc' },
    });
    let next = 1;
    for (const user of users) {
      const match = user.loginId?.match(new RegExp(`^${role}(\\d+)$`, 'i'));
      if (match) next = Math.max(next, Number.parseInt(match[1], 10) + 1);
    }
    return `${role}${String(next).padStart(3, '0')}`;
  }

  async loginPassword(dto: LoginPasswordDto, meta?: { ip?: string; ua?: string }) {
    const identifier = dto.identifier?.trim() || dto.email?.trim();
    if (!identifier) {
      throw new BadRequestException('Provide a User ID or email address');
    }
    const companyId = await this.resolveCompanyId(dto.companyId);
    const user = await this.findUserForLogin(companyId, identifier);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    const roles = user.userRoles.map((ur) => ur.role.code as RoleCode);
    // Any linked employee profile must be active to sign in (not only EMP role).
    if (user.employeeId) {
      const linkedEmployee = await this.prisma.employee.findFirst({
        where: { companyId, id: user.employeeId, isActive: true },
        select: { id: true },
      });
      if (!linkedEmployee) {
        throw new UnauthorizedException(
          'Employee profile is inactive. Contact HR or Super Admin.',
        );
      }
    }

    try {
      await this.ensureNotLocked(user);
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.registerFailedLogin(user);
      await this.audit.log({
        companyId,
        actorId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entityType: 'User',
        entityId: user.id,
        ipAddress: meta?.ip,
        userAgent: meta?.ua,
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    await this.verifyTotpIfNeeded(user, dto.totpCode);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedAt: null },
    });

    return this.issueSession(user, meta);
  }

  private async findUserForLogin(companyId: string, identifier: string) {
    const include = { userRoles: { include: { role: true } }, moduleAccess: true } as const;
    const value = identifier.trim();
    if (!value) return null;

    const byLoginId = await this.prisma.user.findFirst({
      where: { companyId, loginId: { equals: value, mode: 'insensitive' } },
      include,
    });
    if (byLoginId) return byLoginId;

    const byEmail = await this.prisma.user.findFirst({
      where: { companyId, email: { equals: value, mode: 'insensitive' } },
      include,
    });
    if (byEmail) return byEmail;

    // Resolve via employee profile (code / work email / personal email)
    const employee = await this.prisma.employee.findFirst({
      where: {
        companyId,
        OR: [
          { employeeCode: { equals: value, mode: 'insensitive' } },
          { email: { equals: value, mode: 'insensitive' } },
          { workEmail: { equals: value, mode: 'insensitive' } },
          { personalEmail: { equals: value, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (employee) {
      const byEmployee = await this.prisma.user.findFirst({
        where: { companyId, employeeId: employee.id },
        include,
      });
      if (byEmployee) return byEmployee;
    }

    const digits = value.replace(/\D/g, '');
    if (digits.length >= 10) {
      const byMobile = await this.prisma.user.findFirst({
        where: {
          companyId,
          OR: [
            { mobile: value },
            { mobile: digits },
            { mobile: { endsWith: digits.slice(-10) } },
          ],
        },
        include,
      });
      if (byMobile) return byMobile;

      const empByMobile = await this.prisma.employee.findFirst({
        where: {
          companyId,
          OR: [
            { mobile: value },
            { mobile: digits },
            { mobile: { endsWith: digits.slice(-10) } },
          ],
        },
        select: { id: true },
      });
      if (empByMobile) {
        return this.prisma.user.findFirst({
          where: { companyId, employeeId: empByMobile.id },
          include,
        });
      }
    }

    return null;
  }

  private async ensureNotLocked(user: User, _employeeLogin = false) {
    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException(
        'This account is inactive. Contact HR or Super Admin for help.',
      );
    }

    const isLocked = user.status === UserStatus.LOCKED || Boolean(user.lockedAt);
    if (!isLocked) return;

    const lockMinutes = await this.getSettingNumber(
      user.companyId,
      'security.lockout_minutes',
      30,
    );

    // If we have a lock timestamp, honour the configured cool-down then auto-unlock.
    if (user.lockedAt) {
      const unlockAt = user.lockedAt.getTime() + lockMinutes * 60_000;
      if (Date.now() < unlockAt) {
        const minsLeft = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
        throw new ForbiddenException(
          `Account locked after too many failed attempts. Try again in about ${minsLeft} minute(s), or ask HR to unlock.`,
        );
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lockedAt: null, failedLoginAttempts: 0, status: UserStatus.ACTIVE },
      });
      user.lockedAt = null;
      user.failedLoginAttempts = 0;
      user.status = UserStatus.ACTIVE;
      return;
    }

    // LOCKED without lockedAt — requires HR unlock
    throw new ForbiddenException(
      'Account is locked. Contact HR or Super Admin to unlock.',
    );
  }

  private async registerFailedLogin(user: User) {
    const max = await this.getSettingNumber(user.companyId, 'security.max_failed_logins', 5);
    const attempts = user.failedLoginAttempts + 1;
    const data: Partial<User> & { failedLoginAttempts: number; lockedAt?: Date; status?: UserStatus } = {
      failedLoginAttempts: attempts,
    };
    if (attempts >= max) {
      data.lockedAt = new Date();
      data.status = UserStatus.LOCKED;
    }
    await this.prisma.user.update({ where: { id: user.id }, data });
  }

  private async verifyTotpIfNeeded(
    user: User & { totpEnabled: boolean; totpSecret: string | null },
    totpCode?: string,
  ) {
    if (!user.totpEnabled || !user.totpSecret) return;
    if (!totpCode || !authenticator.check(totpCode, user.totpSecret)) {
      throw new UnauthorizedException('Invalid 2FA code');
    }
  }

  private async issueSession(
    user: User & {
      userRoles: { role: { code: string } }[];
      moduleAccess: { moduleKey: string; canAccess: boolean }[];
    },
    meta?: { ip?: string; ua?: string },
  ) {
    const roles = user.userRoles.map((ur) => ur.role.code);
    const sessionMinutes = await this.security.getSettingNumber(
      user.companyId,
      'security.session_timeout_minutes',
      480,
    );
    const accessSeconds = Math.max(5, sessionMinutes) * 60;

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, companyId: user.companyId, roles },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: accessSeconds,
      },
    );

    const refreshRaw = `${user.id}.${randomInt(1e9)}.${Date.now()}`;
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', '7d');
    const refreshDays = refreshTtl.endsWith('d') ? Number(refreshTtl.replace('d', '')) : 7;

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshRaw),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
        ipAddress: meta?.ip,
        userAgent: meta?.ua,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    try {
      await this.audit.log({
        companyId: user.companyId,
        actorId: user.id,
        action: AuditAction.LOGIN,
        entityType: 'User',
        entityId: user.id,
        ipAddress: meta?.ip,
        userAgent: meta?.ua,
      });
    } catch (auditErr) {
      this.logger.error(
        `Login audit failed for user ${user.id}`,
        auditErr instanceof Error ? auditErr.stack : auditErr,
      );
    }

    const parsed = parseUserAgent(meta?.ua);
    try {
      await this.prisma.loginSession.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          ipAddress: meta?.ip,
          userAgent: meta?.ua,
          device: parsed.device,
          browser: parsed.browser,
          isOnline: true,
        },
      });
    } catch (sessionErr) {
      this.logger.error(
        `Login session record failed for user ${user.id}`,
        sessionErr instanceof Error ? sessionErr.stack : sessionErr,
      );
    }

    const mustEnable2fa =
      roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r)) &&
      !user.totpEnabled &&
      (await this.security.getSettingBool(user.companyId, 'security.require_2fa_for_admins', false));

    return {
      accessToken,
      refreshToken: refreshRaw,
      forcePasswordChange: user.forcePasswordChange,
      mustEnable2fa,
      expiresInMinutes: Math.max(5, sessionMinutes),
      user: {
        id: user.id,
        companyId: user.companyId,
        loginId: user.loginId,
        email: user.email,
        mobile: user.mobile,
        displayName: user.displayName,
        roles,
        employeeId: user.employeeId,
        moduleAccess: user.moduleAccess.filter((m) => m.canAccess).map((m) => m.moduleKey),
        totpEnabled: user.totpEnabled,
        forcePasswordChange: user.forcePasswordChange,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: {
        user: {
          include: { userRoles: { include: { role: true } }, moduleAccess: true },
        },
      },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(stored.user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.hash(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.prisma.loginSession.updateMany({
      where: { userId, isOnline: true },
      data: { isOnline: false, logoutAt: new Date() },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
    if (user) {
      await this.audit.log({
        companyId: user.companyId,
        actorId: userId,
        action: AuditAction.LOGOUT,
        entityType: 'User',
        entityId: userId,
      });
    }
    return { message: 'Logged out' };
  }

  async me(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      include: { userRoles: { include: { role: true } }, moduleAccess: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      companyId: user.companyId,
      loginId: user.loginId,
      email: user.email,
      mobile: user.mobile,
      displayName: user.displayName,
      roles: user.userRoles.map((ur) => ur.role.code),
      employeeId: user.employeeId,
      moduleAccess: user.moduleAccess.filter((m) => m.canAccess).map((m) => m.moduleKey),
      totpEnabled: user.totpEnabled,
      forcePasswordChange: user.forcePasswordChange,
    };
  }

  async setup2faStart(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, totpEnabled: false },
    });
    const otpauth = authenticator.keyuri(user.email ?? user.mobile ?? user.id, 'EITF HRMS', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    return { secret, otpauth, qrDataUrl };
  }

  async setup2faConfirm(userId: string, companyId: string, totpCode: string) {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
    if (!user.totpSecret || !authenticator.check(totpCode, user.totpSecret)) {
      throw new BadRequestException('Invalid TOTP code');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true },
    });
    await this.audit.log({
      companyId,
      actorId: userId,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: '2fa_enabled' },
    });
    return { totpEnabled: true };
  }

  async changePassword(
    userId: string,
    companyId: string,
    current: string,
    next: string,
    confirmPassword?: string,
  ) {
    if (confirmPassword !== undefined && confirmPassword !== next) {
      throw new BadRequestException('Passwords do not match.');
    }
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
    if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.security.validatePassword(companyId, next);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(next, 12),
        forcePasswordChange: false,
        status: UserStatus.ACTIVE,
      },
    });
    await this.audit.log({
      companyId,
      actorId: userId,
      action: AuditAction.PASSWORD_RESET,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'self_password_change' },
    });
    return { message: 'Password updated' };
  }

  async changeUsername(
    userId: string,
    companyId: string,
    username: string,
    currentPassword: string,
  ) {
    const nextLoginId = username.trim();
    if (nextLoginId.length < 5) {
      throw new BadRequestException('User ID must be at least 5 characters.');
    }

    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
    if (isProtectedSuperAdmin(user)) {
      throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    }
    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (user.loginId === nextLoginId) {
      return { message: 'User ID unchanged', username: user.loginId };
    }

    const taken = await this.prisma.user.findFirst({
      where: { companyId, loginId: nextLoginId, NOT: { id: userId } },
    });
    if (taken) throw new BadRequestException('User ID already in use');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { loginId: nextLoginId },
    });

    await this.audit.log({
      companyId,
      actorId: userId,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'self_login_id_change', from: user.loginId, to: nextLoginId },
    });

    return { message: 'User ID updated', username: updated.loginId };
  }

  async getSetupStatus(companyId?: string) {
    const resolvedCompanyId = await this.resolveCompanyId(companyId);
    const superAdminCount = await this.prisma.user.count({
      where: {
        companyId: resolvedCompanyId,
        status: { not: UserStatus.INACTIVE },
        userRoles: { some: { role: { code: RoleCode.SUPER_ADMIN } } },
      },
    });
    return { needsSetup: superAdminCount === 0 };
  }

  async setupSuperAdmin(dto: SetupSuperAdminDto, meta?: { ip?: string; ua?: string }) {
    const companyId = await this.resolveCompanyId(dto.companyId);
    const status = await this.getSetupStatus(companyId);
    if (!status.needsSetup) {
      throw new ForbiddenException('System is already configured.');
    }
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }
    await this.security.validatePassword(companyId, dto.password);

    const email = dto.email.trim();
    const role = await this.prisma.role.findFirst({
      where: { companyId, code: RoleCode.SUPER_ADMIN },
    });
    if (!role) {
      throw new BadRequestException('Super Admin role missing. Run database seed first.');
    }

    const taken = await this.prisma.user.findFirst({ where: { companyId, email } });
    if (taken) throw new BadRequestException('Email already in use');

    const loginId = await this.getNextLoginId(companyId, 'SA');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        companyId,
        loginId,
        email,
        mobile: dto.mobile.trim(),
        passwordHash,
        displayName: dto.displayName?.trim() || 'Super Admin',
        status: UserStatus.ACTIVE,
        forcePasswordChange: true,
        userRoles: { create: [{ roleId: role.id }] },
      },
      include: { userRoles: { include: { role: true } }, moduleAccess: true },
    });

    await this.audit.log({
      companyId,
      actorId: user.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: 'initial_super_admin_setup' },
      ipAddress: meta?.ip,
      userAgent: meta?.ua,
    });

    return this.issueSession(user, meta);
  }

  private assertSuperAdmin(actor: AuthUser) {
    if (!actor.roles.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin can manage admin accounts.');
    }
  }

  async listAdminUsers(actor: AuthUser) {
    this.assertSuperAdmin(actor);
    const users = await this.prisma.user.findMany({
      where: {
        companyId: actor.companyId,
        employeeId: null,
        userRoles: {
          some: { role: { code: { in: [RoleCode.SUPER_ADMIN, RoleCode.HR] } } },
        },
      },
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      loginId: u.loginId,
      email: u.email,
      mobile: u.mobile,
      displayName: u.displayName,
      status: u.status,
      roles: u.userRoles.map((ur) => ur.role.code),
      roleLabels: u.userRoles.map((ur) => ur.role.name),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  async createAdminUser(actor: AuthUser, dto: CreateAdminUserDto) {
    this.assertSuperAdmin(actor);
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }
    await this.security.validatePassword(actor.companyId, dto.password);

    const email = dto.email.trim();
    const taken = await this.prisma.user.findFirst({
      where: { companyId: actor.companyId, email },
    });
    if (taken) throw new BadRequestException('Email already in use');

    const role = await this.prisma.role.findFirst({
      where: { companyId: actor.companyId, code: RoleCode.HR },
    });
    if (!role) throw new BadRequestException('HR role missing');

    const loginId = await this.getNextLoginId(actor.companyId, 'HR');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        companyId: actor.companyId,
        loginId,
        email,
        mobile: dto.mobile.trim(),
        passwordHash,
        displayName: dto.displayName.trim(),
        status: UserStatus.ACTIVE,
        forcePasswordChange: false,
        userRoles: { create: [{ roleId: role.id }] },
      },
      include: { userRoles: { include: { role: true } } },
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: 'hr_account_created', email, loginId },
    });

    return {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      displayName: user.displayName,
      roles: user.userRoles.map((ur) => ur.role.code),
    };
  }

  async deactivateAdminUser(actor: AuthUser, userId: string) {
    this.assertSuperAdmin(actor);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId: actor.companyId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new BadRequestException('User not found');

    if (isProtectedSuperAdmin(user)) {
      throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    }

    if (actor.id === userId) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    const roles = user.userRoles.map((ur) => ur.role.code);
    if (roles.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenException('Super Admin accounts cannot be deactivated through this action.');
    }
    if (!roles.includes(RoleCode.HR)) {
      throw new BadRequestException('Only HR admin accounts can be deactivated here.');
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE, lockedAt: new Date() },
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'hr_account_deactivated' },
    });

    return { id: userId, status: UserStatus.INACTIVE };
  }
}
