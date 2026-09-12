import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, RoleCode, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../security/security.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  isProtectedSuperAdmin,
  PROTECTED_SUPER_ADMIN_MSG,
} from '../auth/protected-super-admin';
import {
  ChangeUserRoleDto,
  CreateManagedUserDto,
  ResetUserPasswordDto,
  UpdateManagedUserDto,
} from './dto/admin.dto';

import { parseUserAgent } from '../common/ua.util';
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly security: SecurityService,
  ) {}

  private assertSuperAdmin(actor: AuthUser) {
    if (!actor.roles.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenException('Super Admin only');
    }
  }

  async listLoginSessions(
    actor: AuthUser,
    opts: { filter?: string; userId?: string },
  ) {
    this.assertSuperAdmin(actor);
    const where: Record<string, unknown> = { companyId: actor.companyId };
    if (opts.userId) where.userId = opts.userId;

    const now = new Date();
    if (opts.filter === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      where.loginAt = { gte: start };
    } else if (opts.filter === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      where.loginAt = { gte: start };
    } else if (opts.filter === 'month') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      where.loginAt = { gte: start };
    }

    const sessions = await this.prisma.loginSession.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            loginId: true,
            displayName: true,
            employeeId: true,
            userRoles: { include: { role: true } },
            employee: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { loginAt: 'desc' },
      take: 500,
    });

    return sessions.map((s) => {
      const durationMs =
        s.logoutAt && s.loginAt
          ? s.logoutAt.getTime() - s.loginAt.getTime()
          : s.isOnline
            ? now.getTime() - s.loginAt.getTime()
            : null;
      const parsed = parseUserAgent(s.userAgent);
      return {
        id: s.id,
        userId: s.userId,
        userName: s.user.displayName ?? s.user.loginId,
        loginId: s.user.loginId,
        employeeId: s.user.employee?.employeeCode ?? null,
        roles: s.user.userRoles.map((ur) => ur.role.code),
        loginAt: s.loginAt,
        logoutAt: s.logoutAt,
        durationMinutes: durationMs != null ? Math.round(durationMs / 60_000) : null,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        device: s.device ?? parsed.device,
        browser: s.browser ?? parsed.browser,
        status: s.isOnline ? 'Online' : 'Offline',
        isOnline: s.isOnline,
      };
    });
  }

  async listUsers(actor: AuthUser) {
    if (!actor.roles.includes(RoleCode.SUPER_ADMIN) && !actor.roles.includes(RoleCode.ADMIN)) {
      throw new ForbiddenException();
    }
    const users = await this.prisma.user.findMany({
      where: { companyId: actor.companyId },
      include: {
        userRoles: { include: { role: true } },
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, isActive: true } },
      },
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
      employeeId: u.employeeId,
      employee: u.employee,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      protected: isProtectedSuperAdmin(u),
    }));
  }

  async createUser(actor: AuthUser, dto: CreateManagedUserDto) {
    this.assertSuperAdmin(actor);
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    await this.security.validatePassword(actor.companyId, dto.password);

    const role = await this.prisma.role.findFirst({
      where: { companyId: actor.companyId, code: dto.role },
    });
    if (!role) throw new BadRequestException('Role not found');

    const taken = await this.prisma.user.findFirst({
      where: {
        companyId: actor.companyId,
        OR: [{ loginId: dto.loginId }, { email: dto.email }],
      },
    });
    if (taken) throw new BadRequestException('Login ID or email already in use');

    if (dto.employeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, companyId: actor.companyId },
      });
      if (!emp) throw new BadRequestException('Employee not found');
      const linked = await this.prisma.user.findFirst({
        where: { companyId: actor.companyId, employeeId: dto.employeeId },
      });
      if (linked) throw new BadRequestException('Employee already has a login');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        companyId: actor.companyId,
        loginId: dto.loginId.trim(),
        email: dto.email.trim(),
        mobile: dto.mobile?.trim(),
        passwordHash,
        displayName: dto.displayName.trim(),
        status: UserStatus.ACTIVE,
        employeeId: dto.employeeId,
        userRoles: { create: [{ roleId: role.id }] },
      },
      include: { userRoles: { include: { role: true } }, employee: true },
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: 'user_created', loginId: user.loginId, role: dto.role },
    });

    return {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      displayName: user.displayName,
      roles: user.userRoles.map((ur) => ur.role.code),
    };
  }

  async updateUser(actor: AuthUser, userId: string, dto: UpdateManagedUserDto) {
    this.assertSuperAdmin(actor);
    const user = await this.getUserOrThrow(actor, userId);
    if (isProtectedSuperAdmin(user) && actor.id !== userId) {
      throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    }

    if (dto.email && dto.email !== user.email) {
      const taken = await this.prisma.user.findFirst({
        where: { companyId: actor.companyId, email: dto.email, NOT: { id: userId } },
      });
      if (taken) throw new BadRequestException('Email already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email?.trim(),
        displayName: dto.displayName?.trim(),
        mobile: dto.mobile?.trim(),
        employeeId: dto.employeeId,
      },
      include: { userRoles: { include: { role: true } }, employee: true },
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'user_updated' },
    });

    return updated;
  }

  async activateUser(actor: AuthUser, userId: string) {
    this.assertSuperAdmin(actor);
    await this.getUserOrThrow(actor, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE, lockedAt: null, failedLoginAttempts: 0 },
    });
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'user_activated' },
    });
    return { id: userId, status: UserStatus.ACTIVE };
  }

  async deactivateUser(actor: AuthUser, userId: string) {
    this.assertSuperAdmin(actor);
    const user = await this.getUserOrThrow(actor, userId);
    if (isProtectedSuperAdmin(user)) throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    if (actor.id === userId) throw new BadRequestException('Cannot deactivate yourself');

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.loginSession.updateMany({
      where: { userId, isOnline: true },
      data: { isOnline: false, logoutAt: new Date() },
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
      metadata: { event: 'user_deactivated' },
    });
    return { id: userId, status: UserStatus.INACTIVE };
  }

  async resetPassword(actor: AuthUser, userId: string, dto: ResetUserPasswordDto) {
    this.assertSuperAdmin(actor);
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    const user = await this.getUserOrThrow(actor, userId);
    if (isProtectedSuperAdmin(user) && actor.id !== userId) {
      throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    }
    await this.security.validatePassword(actor.companyId, dto.password);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.password, 12), forcePasswordChange: true },
    });
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PASSWORD_RESET,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'admin_password_reset' },
    });
    return { message: 'Password reset' };
  }

  async changeRole(actor: AuthUser, userId: string, dto: ChangeUserRoleDto) {
    this.assertSuperAdmin(actor);
    const user = await this.getUserOrThrow(actor, userId);
    if (isProtectedSuperAdmin(user)) throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);

    const role = await this.prisma.role.findFirst({
      where: { companyId: actor.companyId, code: dto.role },
    });
    if (!role) throw new BadRequestException('Role not found');

    await this.prisma.userRole.deleteMany({ where: { userId } });
    await this.prisma.userRole.create({ data: { userId, roleId: role.id } });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'role_changed', role: dto.role },
    });
    return { id: userId, role: dto.role };
  }

  async permanentDeleteUser(actor: AuthUser, userId: string) {
    this.assertSuperAdmin(actor);
    const user = await this.getUserOrThrow(actor, userId);
    if (isProtectedSuperAdmin(user)) throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    if (actor.id === userId) throw new BadRequestException('Cannot delete yourself');

    const employeeId = user.employeeId;

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.loginSession.deleteMany({ where: { userId } });
      await tx.otpChallenge.deleteMany({ where: { userId } });
      await tx.userModuleAccess.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });

      if (employeeId) {
        await tx.crmTaskComment.deleteMany({
          where: { authorEmployeeId: employeeId },
        });
        await tx.crmTask.deleteMany({
          where: {
            OR: [{ assignedToEmployeeId: employeeId }, { assignedByEmployeeId: employeeId }],
          },
        });
        await tx.crmActivityLog.deleteMany({ where: { actorEmployeeId: employeeId } });
        await tx.crmNote.deleteMany({ where: { authorEmployeeId: employeeId } });
        await tx.crmFollowUp.deleteMany({ where: { ownerEmployeeId: employeeId } });
        await tx.crmLead.updateMany({
          where: { ownerEmployeeId: employeeId },
          data: { ownerEmployeeId: null },
        });
        await tx.crmDeal.updateMany({
          where: { ownerEmployeeId: employeeId },
          data: { ownerEmployeeId: null },
        });
        await tx.crmCustomer.updateMany({
          where: { ownerEmployeeId: employeeId },
          data: { ownerEmployeeId: null },
        });
      }

      await tx.user.delete({ where: { id: userId } });

      if (employeeId) {
        await tx.employee.delete({ where: { id: employeeId } }).catch(() => undefined);
      }
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: userId,
      metadata: { event: 'user_permanently_deleted', employeeId },
    });

    return { ok: true };
  }

  private async getUserOrThrow(actor: AuthUser, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId: actor.companyId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async listPermissions(actor: AuthUser) {
    if (!actor.roles.includes(RoleCode.SUPER_ADMIN) && !actor.roles.includes(RoleCode.ADMIN)) {
      throw new ForbiddenException();
    }
    await this.ensurePermissionMatrix(actor.companyId);
    return this.prisma.rolePermission.findMany({
      where: { companyId: actor.companyId },
      orderBy: [{ moduleKey: 'asc' }, { roleCode: 'asc' }],
    });
  }

  async upsertPermission(actor: AuthUser, body: { roleCode: RoleCode; moduleKey: string; access: string }) {
    this.assertSuperAdmin(actor);
    await this.ensurePermissionMatrix(actor.companyId);
    const row = await this.prisma.rolePermission.upsert({
      where: {
        companyId_roleCode_moduleKey: {
          companyId: actor.companyId,
          roleCode: body.roleCode,
          moduleKey: body.moduleKey,
        },
      },
      create: { companyId: actor.companyId, ...body },
      update: { access: body.access },
    });
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'RolePermission',
      entityId: row.id,
      metadata: body,
    });
    return row;
  }

  async listDevices(actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.prisma.userDevice.findMany({
      where: { companyId: actor.companyId },
      include: { user: { select: { loginId: true, displayName: true } } },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });
  }

  async forceLogout(actor: AuthUser, sessionId: string) {
    this.assertSuperAdmin(actor);
    const session = await this.prisma.loginSession.findFirst({
      where: { id: sessionId, companyId: actor.companyId },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.prisma.loginSession.update({
      where: { id: sessionId },
      data: { isOnline: false, logoutAt: new Date() },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.OTHER,
      entityType: 'LoginSession',
      entityId: sessionId,
      metadata: { event: 'force_logout' },
    });
    return { ok: true };
  }

  async listLoginLogs(actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.prisma.loginLog.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async ensurePermissionMatrix(companyId: string) {
    const { DEFAULT_ROLE_MATRIX } = await import('../studio/studio.service');
    for (const [moduleKey, roles] of Object.entries(DEFAULT_ROLE_MATRIX)) {
      for (const [roleCode, access] of Object.entries(roles)) {
        await this.prisma.rolePermission.upsert({
          where: {
            companyId_roleCode_moduleKey: {
              companyId,
              roleCode: roleCode as RoleCode,
              moduleKey,
            },
          },
          create: {
            companyId,
            roleCode: roleCode as RoleCode,
            moduleKey,
            access,
          },
          update: {},
        });
      }
    }
  }
}
