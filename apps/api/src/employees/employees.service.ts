import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AuditAction,
  EmploymentStatus,
  Prisma,
  ResignationStatus,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import {
  isProtectedSuperAdmin,
  PROTECTED_SUPER_ADMIN_MSG,
} from '../auth/protected-super-admin';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
  UpdateEmployeeStatusDto,
  UpdateMyProfileDto,
} from './dto/employee.dto';

const employeeInclude = {
  personal: true,
  employment: true,
  bank: true,
  government: true,
  familyMembers: true,
  emergencyContacts: true,
  statusHistory: { orderBy: { effectiveAt: 'desc' as const }, take: 20 },
  user: {
    select: {
      id: true,
      loginId: true,
      email: true,
      mobile: true,
      status: true,
      lockedAt: true,
      failedLoginAttempts: true,
    },
  },
  reportingTo: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
} satisfies Prisma.EmployeeInclude;

export const EMPLOYEE_CODE_EXISTS_MSG =
  'Employee Code already exists. Please enter a unique Employee Code.';

const PERSONAL_KEYS = [
  'nationality', 'religion', 'fatherName', 'motherName', 'spouseName',
  'addressLine1', 'addressLine2', 'city', 'state', 'country', 'pincode',
  'permanentLine1', 'permanentLine2', 'permanentCity', 'permanentState',
  'permanentCountry', 'permanentPincode',
] as const;

const EMPLOYMENT_KEYS = [
  'employmentType', 'workLocation', 'grade', 'band', 'costCenter', 'shiftCode',
  'noticePeriodDays', 'offerDate', 'contractEndAt', 'notes',
] as const;

const BANK_KEYS = [
  'accountHolder', 'bankName', 'accountNumber', 'ifsc', 'branch', 'accountType',
] as const;

const GOVERNMENT_KEYS = [
  'aadhaarNumber', 'panNumber', 'passportNumber', 'uan', 'pfNumber', 'esicNumber',
] as const;

function pickNested<T extends Record<string, unknown>>(
  source: T | undefined,
  keys: readonly string[],
): Partial<T> | undefined {
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source && source[key] !== undefined) out[key] = source[key];
  }
  return Object.keys(out).length ? (out as Partial<T>) : undefined;
}

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => LifecycleService))
    private readonly lifecycle: LifecycleService,
  ) {}

  private isHrOrCeo(user: AuthUser) {
    return user.roles.includes(RoleCode.CEO) || user.roles.includes(RoleCode.HR);
  }

  private isCeo(user: AuthUser) {
    return user.roles.includes(RoleCode.CEO);
  }

  private assertNotProtectedSuperAdmin(
    user: { loginId?: string | null; email?: string | null } | null | undefined,
  ) {
    if (user && isProtectedSuperAdmin(user)) {
      throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    }
  }

  private async getScoped(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: employeeInclude,
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async list(companyId: string, query: EmployeeQueryDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const where: Prisma.EmployeeWhereInput = { companyId };

    if (query.department) where.department = query.department;
    if (query.status) where.status = query.status;
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { employeeCode: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { designation: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: {
          user: { select: { id: true, status: true } },
          reportingTo: {
            select: { id: true, employeeCode: true, firstName: true, lastName: true },
          },
        },
        orderBy: [{ employeeCode: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, items };
  }

  async getById(companyId: string, id: string) {
    return this.getScoped(companyId, id);
  }

  async getMe(user: AuthUser) {
    if (!user.employeeId) {
      throw new ForbiddenException('No employee profile linked to this account');
    }
    return this.getScoped(user.companyId, user.employeeId);
  }

  async suggestNextCode(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, employeeCode: { startsWith: 'EITF', mode: 'insensitive' } },
      select: { employeeCode: true },
      orderBy: { employeeCode: 'desc' },
    });

    let next = 1;
    for (const row of employees) {
      const match = row.employeeCode.match(/^EITF(\d+)$/i);
      if (match) next = Math.max(next, Number.parseInt(match[1], 10) + 1);
    }

    return { employeeCode: `EITF${String(next).padStart(3, '0')}` };
  }

  async isEmployeeCodeAvailable(companyId: string, employeeCode: string, excludeId?: string) {
    const code = employeeCode.trim();
    if (!code) return { available: false, employeeCode: code };
    const existing = await this.prisma.employee.findFirst({
      where: {
        companyId,
        employeeCode: { equals: code, mode: 'insensitive' },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    return { available: !existing, employeeCode: code };
  }

  private async assertEmployeeCodeAvailable(
    companyId: string,
    employeeCode: string,
    excludeId?: string,
  ) {
    const { available } = await this.isEmployeeCodeAvailable(companyId, employeeCode, excludeId);
    if (!available) throw new BadRequestException(EMPLOYEE_CODE_EXISTS_MSG);
  }

  /** Ensure leave balance rows exist so employee dashboard/leave modules work on day one. */
  private async ensureDefaultLeaveBalances(companyId: string, employeeId: string) {
    const year = new Date().getFullYear();
    const defs = [
      { code: 'CL', name: 'Casual Leave', sortOrder: 1 },
      { code: 'SL', name: 'Sick Leave', sortOrder: 2 },
      { code: 'EL', name: 'Earned Leave', sortOrder: 3 },
      { code: 'CO', name: 'Comp Off', sortOrder: 4 },
      { code: 'OTHER', name: 'Other', sortOrder: 99 },
    ];
    for (const d of defs) {
      const leaveType = await this.prisma.leaveType.upsert({
        where: { companyId_code: { companyId, code: d.code } },
        create: {
          companyId,
          code: d.code,
          name: d.name,
          sortOrder: d.sortOrder,
          requiresApproval: true,
          isPaid: true,
        },
        update: {},
      });
      await this.prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId,
            leaveTypeId: leaveType.id,
            year,
          },
        },
        create: {
          companyId,
          employeeId,
          leaveTypeId: leaveType.id,
          year,
        },
        update: {},
      });
    }
  }

  private async assertLoginCredentialsAvailable(
    companyId: string,
    opts: { loginId: string; email: string; mobile?: string },
  ) {
    const loginId = opts.loginId.trim();
    const email = opts.email.trim();
    const mobile = opts.mobile?.trim();

    const conflict = await this.prisma.user.findFirst({
      where: {
        companyId,
        OR: [
          { loginId: { equals: loginId, mode: 'insensitive' } },
          { email: { equals: email, mode: 'insensitive' } },
          ...(mobile ? [{ mobile }] : []),
        ],
      },
      select: {
        loginId: true,
        email: true,
        mobile: true,
        employee: { select: { employeeCode: true, isActive: true } },
      },
    });

    if (!conflict) return;

    if (conflict.loginId?.toLowerCase() === loginId.toLowerCase()) {
      throw new BadRequestException(
        `Employee Code "${loginId}" is already used as a login ID. Choose a different Employee Code.`,
      );
    }
    if (conflict.email?.toLowerCase() === email.toLowerCase()) {
      throw new BadRequestException(
        `Email or username "${email}" is already registered. Use a different email or username.`,
      );
    }
    if (mobile && conflict.mobile === mobile) {
      const owner = conflict.employee?.employeeCode;
      throw new BadRequestException(
        owner
          ? `Mobile number "${mobile}" is already registered to ${owner}. Use a different mobile number.`
          : `Mobile number "${mobile}" is already registered. Use a different mobile number.`,
      );
    }
  }

  private async releaseInactiveUserContacts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mobile: null,
        email: user.email ? `archived.${user.id.slice(-8)}@inactive.local` : null,
      },
    });
  }

  private generatePassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  private resolveLoginUsername(dto: CreateEmployeeDto) {
    const username = dto.username?.trim();
    if (username) return username;
    if (dto.email?.trim()) return dto.email.trim();
    if (dto.workEmail?.trim()) return dto.workEmail.trim();
    return `${dto.employeeCode.toLowerCase()}@eitf.local`;
  }

  async create(actor: AuthUser, dto: CreateEmployeeDto) {
    if (!this.isHrOrCeo(actor)) {
      throw new ForbiddenException('Only Super Admin or HR can add employees');
    }

    const createLogin = dto.createLogin !== false;
    const plainPassword = dto.password ?? dto.temporaryPassword;
    const loginUsername = this.resolveLoginUsername(dto);
    if (loginUsername.length < 5) {
      throw new BadRequestException('Username must be at least 5 characters.');
    }
    if (createLogin) {
      if (!plainPassword || plainPassword.length < 5) {
        throw new BadRequestException('Password is required (minimum 5 characters)');
      }
      if (!dto.confirmPassword || dto.confirmPassword !== plainPassword) {
        throw new BadRequestException('Passwords do not match.');
      }
    }

    const exists = await this.prisma.employee.findFirst({
      where: {
        companyId: actor.companyId,
        employeeCode: { equals: dto.employeeCode.trim(), mode: 'insensitive' },
      },
    });
    if (exists) throw new BadRequestException(EMPLOYEE_CODE_EXISTS_MSG);

    if (createLogin) {
      await this.assertLoginCredentialsAvailable(actor.companyId, {
        loginId: dto.employeeCode,
        email: loginUsername,
        mobile: dto.mobile,
      });
    }

    const status = dto.status ?? EmploymentStatus.PROBATION;
    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          companyId: actor.companyId,
          employeeCode: dto.employeeCode,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          displayName: dto.displayName ?? `${dto.firstName} ${dto.lastName ?? ''}`.trim(),
          email: dto.email,
          mobile: dto.mobile,
          workEmail: dto.workEmail,
          personalEmail: dto.personalEmail,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          maritalStatus: dto.maritalStatus,
          bloodGroup: dto.bloodGroup,
          status,
          joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : new Date(),
          probationEndAt: dto.probationEndAt ? new Date(dto.probationEndAt) : undefined,
          department: dto.department,
          designation: dto.designation,
          reportingToId: dto.reportingToId,
          personal: dto.personal ? { create: dto.personal } : { create: {} },
          employment: dto.employment
            ? {
                create: {
                  ...dto.employment,
                  offerDate: dto.employment.offerDate
                    ? new Date(dto.employment.offerDate)
                    : undefined,
                  contractEndAt: dto.employment.contractEndAt
                    ? new Date(dto.employment.contractEndAt)
                    : undefined,
                },
              }
            : { create: {} },
          bank: dto.bank ? { create: dto.bank } : { create: {} },
          government: dto.government ? { create: dto.government } : { create: {} },
          familyMembers: dto.familyMembers?.length
            ? {
                create: dto.familyMembers.map((m) => ({
                  name: m.name,
                  relation: m.relation,
                  dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : undefined,
                  isDependent: m.isDependent ?? false,
                })),
              }
            : undefined,
          emergencyContacts: dto.emergencyContacts?.length
            ? {
                create: dto.emergencyContacts.map((c) => ({
                  name: c.name,
                  relation: c.relation,
                  phone: c.phone,
                  email: c.email,
                  address: c.address,
                  isPrimary: c.isPrimary ?? true,
                })),
              }
            : undefined,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: status,
              reason: 'Employee created',
              changedBy: actor.id,
            },
          },
        },
        include: employeeInclude,
      });

      if (createLogin && plainPassword) {
        const role = await tx.role.findUnique({
          where: {
            companyId_code: { companyId: actor.companyId, code: RoleCode.EMPLOYEE },
          },
        });
        if (!role) throw new BadRequestException('EMPLOYEE role missing — re-run seed');

        await tx.user.create({
          data: {
            companyId: actor.companyId,
            loginId: created.employeeCode,
            email: loginUsername,
            mobile: dto.mobile,
            passwordHash: await bcrypt.hash(plainPassword, 12),
            displayName: created.displayName ?? created.firstName,
            status: UserStatus.ACTIVE,
            forcePasswordChange: true,
            failedLoginAttempts: 0,
            lockedAt: null,
            employeeId: created.id,
            userRoles: { create: [{ roleId: role.id }] },
          },
        });

        const loginUser = await tx.user.findFirst({
          where: { employeeId: created.id, companyId: actor.companyId },
          include: { userRoles: { include: { role: true } } },
        });
        if (!loginUser?.passwordHash) {
          throw new BadRequestException('Failed to create employee login account.');
        }
        const hasEmployeeRole = loginUser.userRoles.some(
          (ur) => ur.role.code === RoleCode.EMPLOYEE,
        );
        if (!hasEmployeeRole) {
          throw new BadRequestException('Employee role was not assigned correctly.');
        }
      }

      return created;
    });

    try {
      await this.audit.log({
        companyId: actor.companyId,
        actorId: actor.id,
        action: AuditAction.CREATE,
        entityType: 'Employee',
        entityId: employee.id,
        metadata: { employeeCode: employee.employeeCode },
      });
    } catch (auditErr) {
      this.logger.error(
        `Audit log failed after employee create ${employee.employeeCode}`,
        auditErr instanceof Error ? auditErr.stack : auditErr,
      );
    }

    try {
      await this.lifecycle.startOnboarding(actor.companyId, employee.id, actor.id);
    } catch {
      // non-fatal — HR can start onboarding manually
    }

    try {
      await this.ensureDefaultLeaveBalances(actor.companyId, employee.id);
    } catch (leaveErr) {
      this.logger.error(
        `Leave balance init failed for ${employee.employeeCode}`,
        leaveErr instanceof Error ? leaveErr.stack : leaveErr,
      );
    }

    let saved;
    try {
      saved = await this.getScoped(actor.companyId, employee.id);
    } catch (loadErr) {
      this.logger.error(
        `Employee created but profile reload failed for ${employee.employeeCode}`,
        loadErr instanceof Error ? loadErr.stack : loadErr,
      );
      saved = employee;
    }
    if (!createLogin || !plainPassword) return saved;

    return {
      ...saved,
      loginCredentials: {
        employeeCode: saved.employeeCode,
        loginId: saved.employeeCode,
        username: loginUsername,
        email: loginUsername,
        password: plainPassword,
      },
    };
  }

  async update(actor: AuthUser, id: string, dto: UpdateEmployeeDto) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const current = await this.getScoped(actor.companyId, id);
    this.assertNotProtectedSuperAdmin(current.user);

    if (dto.employeeCode !== undefined) {
      const nextCode = dto.employeeCode.trim();
      if (!nextCode) throw new BadRequestException('Employee Code is required.');
      if (nextCode.toLowerCase() !== current.employeeCode.toLowerCase()) {
        await this.assertEmployeeCodeAvailable(actor.companyId, nextCode, id);
        const loginIdTaken = await this.prisma.user.findFirst({
          where: {
            companyId: actor.companyId,
            loginId: nextCode,
            NOT: current.user ? { id: current.user.id } : undefined,
          },
          select: { id: true },
        });
        if (loginIdTaken) {
          throw new BadRequestException('Employee Code is already used as another login ID.');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          employeeCode:
            dto.employeeCode !== undefined ? dto.employeeCode.trim() : undefined,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          displayName: dto.displayName,
          email: dto.email,
          mobile: dto.mobile,
          workEmail: dto.workEmail,
          personalEmail: dto.personalEmail,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          maritalStatus: dto.maritalStatus,
          bloodGroup: dto.bloodGroup,
          photoUrl: dto.photoUrl,
          joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
          probationEndAt: dto.probationEndAt ? new Date(dto.probationEndAt) : undefined,
          confirmationAt: dto.confirmationAt ? new Date(dto.confirmationAt) : undefined,
          department: dto.department,
          designation: dto.designation,
          reportingToId: dto.reportingToId === null ? null : dto.reportingToId,
        },
      });

      if (current.user && dto.employeeCode !== undefined) {
        await tx.user.update({
          where: { id: current.user.id },
          data: { loginId: dto.employeeCode.trim() },
        });
      }

      if (dto.personal) {
        const personal = pickNested(dto.personal as Record<string, unknown>, PERSONAL_KEYS);
        if (personal) {
          await tx.employeePersonal.upsert({
            where: { employeeId: id },
            create: { employeeId: id, ...personal },
            update: personal,
          });
        }
      }
      if (dto.employment) {
        const employment = pickNested(dto.employment as Record<string, unknown>, EMPLOYMENT_KEYS);
        if (employment) {
          const { offerDate, contractEndAt, ...rest } = employment as {
            offerDate?: string;
            contractEndAt?: string;
            [key: string]: unknown;
          };
          await tx.employeeEmployment.upsert({
            where: { employeeId: id },
            create: {
              employeeId: id,
              ...rest,
              offerDate: offerDate ? new Date(offerDate) : undefined,
              contractEndAt: contractEndAt ? new Date(contractEndAt) : undefined,
            },
            update: {
              ...rest,
              offerDate: offerDate ? new Date(offerDate) : undefined,
              contractEndAt: contractEndAt ? new Date(contractEndAt) : undefined,
            },
          });
        }
      }
      if (dto.bank) {
        const bank = pickNested(dto.bank as Record<string, unknown>, BANK_KEYS);
        if (bank) {
          await tx.employeeBank.upsert({
            where: { employeeId: id },
            create: { employeeId: id, ...bank },
            update: bank,
          });
        }
      }
      if (dto.government) {
        const government = pickNested(dto.government as Record<string, unknown>, GOVERNMENT_KEYS);
        if (government) {
          await tx.employeeGovernment.upsert({
            where: { employeeId: id },
            create: { employeeId: id, ...government },
            update: government,
          });
        }
      }
      if (dto.familyMembers) {
        await tx.employeeFamilyMember.deleteMany({ where: { employeeId: id } });
        if (dto.familyMembers.length) {
          await tx.employeeFamilyMember.createMany({
            data: dto.familyMembers.map((m) => ({
              employeeId: id,
              name: m.name,
              relation: m.relation,
              dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : undefined,
              isDependent: m.isDependent ?? false,
            })),
          });
        }
      }
      if (dto.emergencyContacts) {
        await tx.employeeEmergencyContact.deleteMany({ where: { employeeId: id } });
        if (dto.emergencyContacts.length) {
          await tx.employeeEmergencyContact.createMany({
            data: dto.emergencyContacts.map((c) => ({
              employeeId: id,
              name: c.name,
              relation: c.relation,
              phone: c.phone,
              email: c.email,
              address: c.address,
              isPrimary: c.isPrimary ?? true,
            })),
          });
        }
      }
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'Employee',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return this.getScoped(actor.companyId, id);
  }

  async updateMyProfile(_actor: AuthUser, _dto: UpdateMyProfileDto) {
    throw new ForbiddenException(
      'Employees cannot edit their profile. Contact HR or Super Admin to request changes.',
    );
  }

  async updateStatus(actor: AuthUser, id: string, dto: UpdateEmployeeStatusDto) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const current = await this.getScoped(actor.companyId, id);
    this.assertNotProtectedSuperAdmin(current.user);

    const inactiveStatuses: EmploymentStatus[] = [
      EmploymentStatus.INACTIVE,
      EmploymentStatus.TERMINATED,
      EmploymentStatus.RESIGNED,
    ];
    const exitStatuses: EmploymentStatus[] = [
      EmploymentStatus.TERMINATED,
      EmploymentStatus.RESIGNED,
    ];

    // Removing / deactivating from the active roster is CEO-only
    if (inactiveStatuses.includes(dto.status) && !this.isHrOrCeo(actor)) {
      throw new ForbiddenException('Only Super Admin or HR can remove or deactivate employees');
    }

    const isActive = dto.isActive ?? !inactiveStatuses.includes(dto.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          status: dto.status,
          isActive,
          exitAt: exitStatuses.includes(dto.status)
            ? new Date(dto.effectiveAt ?? Date.now())
            : current.exitAt,
        },
      });
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: id,
          fromStatus: current.status,
          toStatus: dto.status,
          reason: dto.reason,
          changedBy: actor.id,
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : new Date(),
        },
      });
      if (current.user) {
        await tx.user.update({
          where: { id: current.user.id },
          data: {
            status: isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE,
          },
        });
        if (!isActive) {
          await tx.refreshToken.updateMany({
            where: { userId: current.user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
    });

    if (!isActive && current.user) {
      await this.releaseInactiveUserContacts(current.user.id);
    }

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'Employee',
      entityId: id,
      metadata: { event: 'status_change', from: current.status, to: dto.status },
    });

    return this.getScoped(actor.companyId, id);
  }

  /**
   * Soft-remove employee from the active directory:
   * marks inactive/resigned, disables login, revokes sessions.
   */
  async remove(actor: AuthUser, id: string, reason?: string) {
    if (!this.isHrOrCeo(actor)) {
      throw new ForbiddenException('Only Super Admin or HR can remove employees');
    }
    const current = await this.getScoped(actor.companyId, id);
    if (current.user && isProtectedSuperAdmin(current.user)) {
      throw new ForbiddenException(PROTECTED_SUPER_ADMIN_MSG);
    }
    if (current.user?.id === actor.id || actor.employeeId === id) {
      throw new BadRequestException('You cannot remove your own employee record');
    }
    if (!current.isActive && current.status === EmploymentStatus.RESIGNED) {
      return current;
    }

    const toStatus =
      current.status === EmploymentStatus.TERMINATED
        ? EmploymentStatus.TERMINATED
        : EmploymentStatus.RESIGNED;

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          status: toStatus,
          isActive: false,
          exitAt: current.exitAt ?? new Date(),
        },
      });
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: id,
          fromStatus: current.status,
          toStatus,
          reason: reason ?? 'Removed by Super Admin from active employee list',
          changedBy: actor.id,
          effectiveAt: new Date(),
        },
      });
      if (current.user) {
        await tx.user.update({
          where: { id: current.user.id },
          data: { status: UserStatus.INACTIVE },
        });
        await tx.refreshToken.updateMany({
          where: { userId: current.user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    if (current.user) {
      await this.releaseInactiveUserContacts(current.user.id);
    }

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.DELETE,
      entityType: 'Employee',
      entityId: id,
      metadata: {
        event: 'employee_removed',
        from: current.status,
        to: toStatus,
        reason: reason ?? 'Removed by Super Admin from active employee list',
      },
    });

    // Auto-create a Resignation record so the employee appears in Exit & F&F
    const existingResignation = await this.prisma.resignation.findFirst({
      where: {
        employeeId: id,
        status: { in: [ResignationStatus.PENDING, ResignationStatus.APPROVED] },
      },
    });
    if (!existingResignation) {
      await this.prisma.resignation.create({
        data: {
          companyId: actor.companyId,
          employeeId: id,
          status: ResignationStatus.APPROVED,
          lastWorkingDay: new Date(),
          noticeDays: 0,
          reason: reason ?? 'Removed by HR/Super Admin from active employee list',
          resignedAt: new Date(),
          approvedBy: actor.id,
          approvedAt: new Date(),
        },
      });
    }

    return this.getScoped(actor.companyId, id);
  }

  /** Generate / reset login credentials for an employee (CEO/HR). */
  async resetCredentials(
    actor: AuthUser,
    id: string,
    opts?: { username?: string; password?: string; generatePassword?: boolean },
  ) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const emp = await this.getScoped(actor.companyId, id);
    this.assertNotProtectedSuperAdmin(emp.user);
    const username =
      opts?.username?.trim() ||
      emp.user?.email ||
      emp.email ||
      emp.workEmail ||
      `${emp.employeeCode.toLowerCase()}@eitf.local`;

    let password = opts?.password;
    if (!password && opts?.generatePassword) {
      password = this.generatePassword();
    }
    if (!password) throw new BadRequestException('Password required');
    if (password.length < 5) {
      throw new BadRequestException('Password must be at least 5 characters');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user = emp.user
      ? await this.prisma.user.findUnique({ where: { id: emp.user.id } })
      : await this.prisma.user.findFirst({
          where: { companyId: actor.companyId, employeeId: id },
        });

    const employeeRole = await this.prisma.role.findFirst({
      where: { companyId: actor.companyId, code: RoleCode.EMPLOYEE },
    });
    if (!employeeRole) throw new BadRequestException('EMPLOYEE role missing');

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          companyId: actor.companyId,
          loginId: emp.employeeCode,
          email: username,
          mobile: emp.mobile,
          passwordHash,
          displayName: emp.displayName || `${emp.firstName} ${emp.lastName ?? ''}`.trim(),
          status: UserStatus.ACTIVE,
          forcePasswordChange: true,
          employeeId: id,
          failedLoginAttempts: 0,
          lockedAt: null,
          userRoles: { create: [{ roleId: employeeRole.id }] },
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginId: emp.employeeCode,
          email: username,
          passwordHash,
          status: UserStatus.ACTIVE,
          forcePasswordChange: true,
          failedLoginAttempts: 0,
          lockedAt: null,
          employeeId: id,
        },
      });
    }

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.PASSWORD_RESET,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: 'reset_credentials', employeeId: id },
    });

    return {
      employeeId: id,
      employeeCode: emp.employeeCode,
      loginId: user.loginId ?? emp.employeeCode,
      username: user.loginId ?? emp.employeeCode,
      email: user.email,
      password,
      userId: user.id,
    };
  }

  async getLoginInfo(actor: AuthUser, id: string) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const emp = await this.getScoped(actor.companyId, id);
    const user = emp.user
      ? await this.prisma.user.findUnique({
          where: { id: emp.user.id },
          select: {
            id: true,
            loginId: true,
            email: true,
            status: true,
            lockedAt: true,
            failedLoginAttempts: true,
            forcePasswordChange: true,
          },
        })
      : null;

    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      hasLogin: Boolean(user),
      loginId: user?.loginId ?? emp.employeeCode,
      username: user?.loginId ?? emp.employeeCode,
      email: user?.email ?? null,
      accountStatus: user?.status ?? null,
      lockedAt: user?.lockedAt ?? null,
      failedLoginAttempts: user?.failedLoginAttempts ?? 0,
      forcePasswordChange: user?.forcePasswordChange ?? false,
      employeeActive: emp.isActive,
    };
  }

  async changeUsername(actor: AuthUser, id: string, username: string) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const emp = await this.getScoped(actor.companyId, id);
    this.assertNotProtectedSuperAdmin(emp.user);
    const nextUsername = username.trim();
    if (!nextUsername) throw new BadRequestException('Username is required');
    if (nextUsername.length < 5) {
      throw new BadRequestException('User ID must be at least 5 characters');
    }

    const taken = await this.prisma.user.findFirst({
      where: {
        companyId: actor.companyId,
        OR: [
          { loginId: { equals: nextUsername, mode: 'insensitive' } },
          { email: { equals: nextUsername, mode: 'insensitive' } },
        ],
        NOT: emp.user ? { id: emp.user.id } : undefined,
      },
    });
    if (taken) throw new BadRequestException('User ID / username already in use');

    const user = emp.user
      ? await this.prisma.user.update({
          where: { id: emp.user.id },
          data: {
            loginId: nextUsername,
            // Keep email login working when username looks like an email
            ...(nextUsername.includes('@') ? { email: nextUsername } : {}),
          },
        })
      : null;
    if (!user) throw new BadRequestException('Employee has no login account yet');

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: 'change_username', employeeId: id },
    });

    return this.getLoginInfo(actor, id);
  }

  async setAccountLock(actor: AuthUser, id: string, locked: boolean) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const emp = await this.getScoped(actor.companyId, id);
    this.assertNotProtectedSuperAdmin(emp.user);
    if (!emp.user) throw new BadRequestException('Employee has no login account');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: emp.user!.id },
        data: locked
          ? { status: UserStatus.LOCKED, lockedAt: new Date() }
          : { status: UserStatus.ACTIVE, lockedAt: null, failedLoginAttempts: 0 },
      });
      if (locked) {
        await tx.refreshToken.updateMany({
          where: { userId: emp.user!.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: emp.user.id,
      metadata: { event: locked ? 'account_locked' : 'account_unlocked', employeeId: id },
    });

    return this.getLoginInfo(actor, id);
  }
}
