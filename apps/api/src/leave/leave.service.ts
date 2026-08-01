import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AuditAction,
  LeaveApplicationStatus,
  LeaveLedgerType,
  NotificationStatus,
  Prisma,
  RoleCode,
  WorkflowType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { WorkflowService } from '../workflow/workflow.service';
import {
  AdjustBalanceDto,
  ApplyLeaveDto,
  EncashLeaveDto,
  ReviewLeaveDto,
} from './dto/leave.dto';

function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(from: Date, to: Date, halfDay: boolean) {
  if (halfDay) return 0.5;
  const ms = dateOnly(to).getTime() - dateOnly(from).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function available(b: {
  opening: number;
  accrued: number;
  carriedForward: number;
  adjusted: number;
  used: number;
  encashed: number;
}) {
  return b.opening + b.accrued + b.carriedForward + b.adjusted - b.used - b.encashed;
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflow: WorkflowService,
  ) {}

  private async setting<T>(companyId: string, key: string, fallback: T): Promise<T> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    return (row?.value as T) ?? fallback;
  }

  private isHr(user: AuthUser) {
    const allowed: string[] = [RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER];
    return user.roles.some((r) => allowed.includes(r));
  }

  async ensureDefaultTypes(companyId: string) {
    const defs = [
      { code: 'CL', name: 'Casual Leave', sortOrder: 1 },
      { code: 'SL', name: 'Sick Leave', sortOrder: 2, requiresAttachment: true },
      { code: 'EL', name: 'Earned Leave', sortOrder: 3 },
      { code: 'CO', name: 'Comp Off', sortOrder: 4, isPaid: true },
      { code: 'OTHER', name: 'Other', sortOrder: 99, requiresApproval: true },
    ];
    for (const d of defs) {
      await this.prisma.leaveType.upsert({
        where: { companyId_code: { companyId, code: d.code } },
        create: {
          companyId,
          code: d.code,
          name: d.name,
          sortOrder: d.sortOrder,
          requiresAttachment: d.requiresAttachment ?? false,
          requiresApproval: d.requiresApproval ?? true,
          isPaid: d.isPaid ?? true,
        },
        update: { name: d.name },
      });
    }

    await this.prisma.leaveApprovalChain.upsert({
      where: { companyId_name: { companyId, name: 'default' } },
      create: {
        companyId,
        name: 'default',
        stepsJson: [{ step: 1, role: 'MANAGER' }, { step: 2, role: 'HR' }],
      },
      update: {},
    });

    return this.listTypes(companyId);
  }

  listTypes(companyId: string) {
    return this.prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async getOrCreateBalance(
    tx: Prisma.TransactionClient,
    companyId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
  ) {
    return tx.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year },
      },
      create: { companyId, employeeId, leaveTypeId, year },
      update: {},
    });
  }

  async balancesForEmployee(companyId: string, employeeId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const types = await this.ensureDefaultTypes(companyId);
    const rows = [];
    for (const t of types) {
      const bal = await this.getOrCreateBalance(this.prisma, companyId, employeeId, t.id, y);
      rows.push({
        ...bal,
        leaveType: t,
        available: available(bal),
      });
    }
    return rows;
  }

  async myBalances(user: AuthUser, year?: number) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    return this.balancesForEmployee(user.companyId, user.employeeId, year);
  }

  /** Accrual: 0 for first N probation months → credit at end → +monthly after */
  async runMonthlyAccrual(companyId: string, asOf = new Date()) {
    const probationMonths = await this.setting(companyId, 'leave.probation_months', 6);
    const creditAtEnd = await this.setting(companyId, 'leave.credit_at_probation_end', 6);
    const monthlyAfter = await this.setting(companyId, 'leave.monthly_credit_after', 1);

    const el = await this.prisma.leaveType.findFirst({
      where: { companyId, code: 'EL' },
    });
    if (!el) {
      await this.ensureDefaultTypes(companyId);
    }
    const earned = await this.prisma.leaveType.findFirstOrThrow({
      where: { companyId, code: 'EL' },
    });

    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
    });

    const year = asOf.getFullYear();
    const results = [];

    for (const emp of employees) {
      if (!emp.joinedAt) continue;
      const joined = new Date(emp.joinedAt);
      const months =
        (asOf.getFullYear() - joined.getFullYear()) * 12 +
        (asOf.getMonth() - joined.getMonth());

      let credit = 0;
      let note = '';
      if (months < probationMonths) {
        credit = 0;
        note = `Probation month ${months + 1}/${probationMonths} — no accrual`;
      } else if (months === probationMonths) {
        credit = creditAtEnd;
        note = `Probation complete — credited ${creditAtEnd} days`;
      } else {
        credit = monthlyAfter;
        note = `Monthly accrual +${monthlyAfter}`;
      }

      if (credit <= 0) {
        results.push({ employeeId: emp.id, credit: 0, note });
        continue;
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const bal = await this.getOrCreateBalance(tx, companyId, emp.id, earned.id, year);
        const next = await tx.leaveBalance.update({
          where: { id: bal.id },
          data: { accrued: { increment: credit } },
        });
        await tx.leaveLedgerEntry.create({
          data: {
            companyId,
            employeeId: emp.id,
            leaveTypeId: earned.id,
            entryType: LeaveLedgerType.ACCRUAL,
            days: credit,
            balanceAfter: available(next),
            note,
          },
        });
        return next;
      });
      results.push({ employeeId: emp.id, credit, note, balance: available(updated) });
    }
    return { asOf, results };
  }

  async runCarryForward(companyId: string, fromYear: number) {
    const enabled = await this.setting(companyId, 'leave.carry_forward_enabled', true);
    if (!enabled) return { message: 'Carry-forward disabled', moved: 0 };
    const maxCf = await this.setting(companyId, 'leave.carry_forward_max', 12);
    const el = await this.prisma.leaveType.findFirst({ where: { companyId, code: 'EL' } });
    if (!el) return { message: 'EL type missing', moved: 0 };

    const balances = await this.prisma.leaveBalance.findMany({
      where: { companyId, leaveTypeId: el.id, year: fromYear },
    });
    let moved = 0;
    for (const b of balances) {
      const avail = available(b);
      const carry = Math.min(Math.max(avail, 0), maxCf);
      if (carry <= 0) continue;
      await this.prisma.$transaction(async (tx) => {
        const next = await this.getOrCreateBalance(
          tx,
          companyId,
          b.employeeId,
          el.id,
          fromYear + 1,
        );
        const updated = await tx.leaveBalance.update({
          where: { id: next.id },
          data: { carriedForward: { increment: carry } },
        });
        await tx.leaveLedgerEntry.create({
          data: {
            companyId,
            employeeId: b.employeeId,
            leaveTypeId: el.id,
            entryType: LeaveLedgerType.CARRY_FORWARD,
            days: carry,
            balanceAfter: available(updated),
            note: `Carry forward from ${fromYear}`,
          },
        });
      });
      moved += 1;
    }
    return { fromYear, toYear: fromYear + 1, moved, maxCf };
  }

  async apply(user: AuthUser, dto: ApplyLeaveDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    await this.ensureDefaultTypes(user.companyId);

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, companyId: user.companyId, isActive: true },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    if (leaveType.requiresAttachment && !dto.attachmentUrl) {
      throw new BadRequestException('Attachment required for this leave type');
    }
    if (leaveType.code === 'OTHER' && !dto.otherTypeNote) {
      throw new BadRequestException('Please describe the leave type (Other)');
    }

    const from = dateOnly(new Date(dto.fromDate));
    const to = dateOnly(new Date(dto.toDate));
    if (to < from) throw new BadRequestException('toDate must be on/after fromDate');

    const days = daysBetween(from, to, !!dto.isHalfDay);
    if (leaveType.maxDaysPerRequest && days > leaveType.maxDaysPerRequest) {
      throw new BadRequestException(`Max ${leaveType.maxDaysPerRequest} days allowed`);
    }

    const year = from.getUTCFullYear();
    const bal = await this.getOrCreateBalance(
      this.prisma,
      user.companyId,
      user.employeeId,
      leaveType.id,
      year,
    );
    if (leaveType.code !== 'OTHER' && leaveType.code !== 'CO' && available(bal) < days) {
      throw new BadRequestException(
        `Insufficient balance (${available(bal)} available, ${days} requested)`,
      );
    }

    const chain = await this.prisma.leaveApprovalChain.findFirst({
      where: { companyId: user.companyId, isActive: true },
    });
    const steps = (chain?.stepsJson as { step: number; role: string }[]) ?? [
      { step: 1, role: 'MANAGER' },
      { step: 2, role: 'HR' },
    ];

    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
    });

    const app = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leaveApplication.create({
        data: {
          companyId: user.companyId,
          employeeId: user.employeeId!,
          leaveTypeId: leaveType.id,
          fromDate: from,
          toDate: to,
          days,
          isHalfDay: dto.isHalfDay ?? false,
          halfDaySession: dto.halfDaySession,
          reason: dto.reason,
          otherTypeNote: dto.otherTypeNote,
          attachmentUrl: dto.attachmentUrl,
          status: leaveType.requiresApproval
            ? LeaveApplicationStatus.PENDING
            : LeaveApplicationStatus.APPROVED,
          currentStep: 1,
          steps: {
            create: steps.map((s) => ({
              stepOrder: s.step,
              approverRole: s.role,
              approverId: s.role === 'MANAGER' ? emp.reportingToId : undefined,
              status:
                !leaveType.requiresApproval && s.step === 1
                  ? LeaveApplicationStatus.APPROVED
                  : LeaveApplicationStatus.PENDING,
            })),
          },
        },
        include: { leaveType: true, steps: true },
      });

      if (!leaveType.requiresApproval) {
        await this.debitOnApprove(tx, created.id, user.id);
      }
      return created;
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'LeaveApplication',
      entityId: app.id,
      metadata: { days, leaveType: leaveType.code },
    });

    if (leaveType.requiresApproval) {
      try {
        await this.workflow.startInstance({
          companyId: user.companyId,
          type: WorkflowType.LEAVE,
          entityType: 'LeaveApplication',
          entityId: app.id,
          requesterId: user.employeeId!,
          summary: `${leaveType.code} ${days} day(s)`,
        });
      } catch {
        // non-fatal
      }
    }

    // Notify all HR/CEO users about the new leave application
    try {
      await this.notifyHrOfLeave(user, emp, leaveType.code, days, from, to);
    } catch {
      // non-fatal
    }

    return app;
  }

  private async notifyHrOfLeave(
    applicant: AuthUser,
    emp: { firstName: string; lastName?: string | null; employeeCode: string },
    leaveCode: string,
    days: number,
    from: Date,
    to: Date,
  ) {
    const hrUsers = await this.prisma.user.findMany({
      where: {
        companyId: applicant.companyId,
        status: 'ACTIVE',
        userRoles: {
          some: { role: { code: { in: [RoleCode.HR, RoleCode.CEO] } } },
        },
      },
      include: { employee: { select: { id: true } } },
    });

    const name = `${emp.firstName} ${emp.lastName ?? ''}`.trim();
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const title = `Leave Applied: ${name} (${emp.employeeCode})`;
    const body = `${name} applied for ${leaveCode} leave (${days} day${days > 1 ? 's' : ''}) from ${fromStr} to ${toStr}. Please review.`;

    for (const hrUser of hrUsers) {
      if (!hrUser.employee?.id) continue;
      // Skip notifying the applicant if they are also HR/CEO
      if (hrUser.employee.id === applicant.employeeId) continue;
      await this.prisma.notification.create({
        data: {
          companyId: applicant.companyId,
          employeeId: hrUser.employee.id,
          title,
          body,
          category: 'leave',
          status: NotificationStatus.SENT,
        },
      });
    }
  }

  private async debitOnApprove(
    tx: Prisma.TransactionClient,
    applicationId: string,
    actorId?: string,
  ) {
    const app = await tx.leaveApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    const year = app.fromDate.getUTCFullYear();
    const bal = await this.getOrCreateBalance(
      tx,
      app.companyId,
      app.employeeId,
      app.leaveTypeId,
      year,
    );
    const updated = await tx.leaveBalance.update({
      where: { id: bal.id },
      data: { used: { increment: app.days } },
    });
    await tx.leaveLedgerEntry.create({
      data: {
        companyId: app.companyId,
        employeeId: app.employeeId,
        leaveTypeId: app.leaveTypeId,
        applicationId: app.id,
        entryType: LeaveLedgerType.DEBIT,
        days: app.days,
        balanceAfter: available(updated),
        note: 'Leave approved',
        createdBy: actorId,
      },
    });
  }

  async myApplications(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    return this.prisma.leaveApplication.findMany({
      where: { employeeId: user.employeeId },
      include: { leaveType: true, steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approvalQueue(user: AuthUser) {
    if (!this.isHr(user) && !user.roles.includes(RoleCode.MANAGER)) {
      throw new ForbiddenException();
    }

    const where: Prisma.LeaveApplicationWhereInput = {
      companyId: user.companyId,
      status: LeaveApplicationStatus.PENDING,
    };

    if (user.roles.includes(RoleCode.MANAGER) && !user.roles.includes(RoleCode.HR) && !user.roles.includes(RoleCode.CEO)) {
      where.steps = {
        some: {
          status: LeaveApplicationStatus.PENDING,
          OR: [
            { approverId: user.employeeId ?? undefined },
            { approverRole: 'MANAGER' },
          ],
        },
      };
      if (user.employeeId) {
        where.employee = { reportingToId: user.employeeId };
      }
    }

    return this.prisma.leaveApplication.findMany({
      where,
      include: {
        leaveType: true,
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
        },
        steps: { orderBy: { stepOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async review(user: AuthUser, id: string, dto: ReviewLeaveDto) {
    const isPrivileged =
      user.roles.includes(RoleCode.CEO) || user.roles.includes(RoleCode.HR);
    const isManager = user.roles.includes(RoleCode.MANAGER);
    if (!isPrivileged && !isManager) throw new ForbiddenException();
    if (
      dto.status !== LeaveApplicationStatus.APPROVED &&
      dto.status !== LeaveApplicationStatus.REJECTED
    ) {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }

    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        leaveType: true,
        employee: { select: { id: true, reportingToId: true } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== LeaveApplicationStatus.PENDING) {
      throw new BadRequestException('Application is not pending');
    }

    const current = app.steps.find((s) => s.stepOrder === app.currentStep);
    if (!current || current.status !== LeaveApplicationStatus.PENDING) {
      throw new BadRequestException('No pending step');
    }

    if (!isPrivileged) {
      const canAct =
        (current.approverId && current.approverId === user.employeeId) ||
        (current.approverRole === 'MANAGER' &&
          app.employee.reportingToId === user.employeeId);
      if (!canAct) {
        throw new ForbiddenException('You are not authorized to review this application');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.leaveApprovalStep.update({
        where: { id: current.id },
        data: {
          status: dto.status,
          comment: dto.comment,
          actedAt: new Date(),
          approverId: user.employeeId ?? current.approverId,
        },
      });

      if (dto.status === LeaveApplicationStatus.REJECTED) {
        const updated = await tx.leaveApplication.update({
          where: { id },
          data: { status: LeaveApplicationStatus.REJECTED },
          include: { leaveType: true, steps: true, employee: true },
        });
        return updated;
      }

      const nextStep = app.steps.find((s) => s.stepOrder === app.currentStep + 1);
      if (nextStep) {
        return tx.leaveApplication.update({
          where: { id },
          data: { currentStep: nextStep.stepOrder },
          include: { leaveType: true, steps: true, employee: true },
        });
      }

      await this.debitOnApprove(tx, id, user.id);
      return tx.leaveApplication.update({
        where: { id },
        data: { status: LeaveApplicationStatus.APPROVED },
        include: { leaveType: true, steps: true, employee: true },
      });
    });

    try {
      await this.workflow.syncFromLegacy({
        companyId: user.companyId,
        entityType: 'LeaveApplication',
        entityId: id,
        action: dto.status === LeaveApplicationStatus.REJECTED ? 'REJECT' : 'APPROVE',
        actorId: user.id,
        comment: dto.comment,
      });
    } catch {
      // non-fatal
    }

    return result;
  }

  async cancel(user: AuthUser, id: string) {
    if (!user.employeeId) throw new ForbiddenException();
    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, companyId: user.companyId, employeeId: user.employeeId },
    });
    if (!app) throw new NotFoundException();
    if (app.status !== LeaveApplicationStatus.PENDING) {
      throw new BadRequestException('Only pending applications can be withdrawn');
    }
    return this.prisma.leaveApplication.update({
      where: { id },
      data: { status: LeaveApplicationStatus.WITHDRAWN },
    });
  }

  async calendar(
    companyId: string,
    from: string,
    to: string,
    employeeId?: string,
    status?: string,
    department?: string,
    search?: string,
  ) {
    const where: Prisma.LeaveApplicationWhereInput = {
      companyId,
      fromDate: { lte: new Date(to) },
      toDate: { gte: new Date(from) },
    };

    if (status && status !== 'ALL') {
      where.status = status as LeaveApplicationStatus;
    }

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (department || search) {
      const empWhere: Prisma.EmployeeWhereInput = {};
      if (department) empWhere.department = department;
      if (search) {
        empWhere.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
        ];
      }
      where.employee = empWhere;
    }

    return this.prisma.leaveApplication.findMany({
      where,
      include: {
        leaveType: true,
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
        },
      },
      orderBy: { fromDate: 'asc' },
    });
  }

  async balanceSheet(companyId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    await this.ensureDefaultTypes(companyId);
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
      orderBy: { employeeCode: 'asc' },
    });
    const types = await this.listTypes(companyId);
    const sheet = [];
    for (const emp of employees) {
      const balances = [];
      for (const t of types) {
        const bal = await this.getOrCreateBalance(this.prisma, companyId, emp.id, t.id, y);
        balances.push({
          leaveType: t,
          ...bal,
          available: available(bal),
        });
      }
      sheet.push({ employee: emp, balances });
    }
    return { year: y, sheet };
  }

  async encash(user: AuthUser, dto: EncashLeaveDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    // Encashment is HR-driven for a selected employee via adjust path — use Adjust for simplicity
    throw new BadRequestException('Use POST /leave/encash/:employeeId');
  }

  async encashForEmployee(user: AuthUser, employeeId: string, dto: EncashLeaveDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const year = new Date().getFullYear();
    return this.prisma.$transaction(async (tx) => {
      const bal = await this.getOrCreateBalance(
        tx,
        user.companyId,
        employeeId,
        dto.leaveTypeId,
        year,
      );
      if (available(bal) < dto.days) throw new BadRequestException('Insufficient balance');
      const updated = await tx.leaveBalance.update({
        where: { id: bal.id },
        data: { encashed: { increment: dto.days } },
      });
      await tx.leaveLedgerEntry.create({
        data: {
          companyId: user.companyId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          entryType: LeaveLedgerType.ENCASHMENT,
          days: dto.days,
          balanceAfter: available(updated),
          note: dto.note ?? 'Leave encashment',
          createdBy: user.id,
        },
      });
      return { ...updated, available: available(updated) };
    });
  }

  async adjust(user: AuthUser, dto: AdjustBalanceDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const year = new Date().getFullYear();
    return this.prisma.$transaction(async (tx) => {
      const bal = await this.getOrCreateBalance(
        tx,
        user.companyId,
        dto.employeeId,
        dto.leaveTypeId,
        year,
      );
      const updated = await tx.leaveBalance.update({
        where: { id: bal.id },
        data: { adjusted: { increment: dto.days } },
      });
      await tx.leaveLedgerEntry.create({
        data: {
          companyId: user.companyId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          entryType: LeaveLedgerType.ADJUSTMENT,
          days: dto.days,
          balanceAfter: available(updated),
          note: dto.note ?? 'Manual adjustment',
          createdBy: user.id,
        },
      });
      return { ...updated, available: available(updated) };
    });
  }

  async ledger(companyId: string, employeeId: string) {
    return this.prisma.leaveLedgerEntry.findMany({
      where: { companyId, employeeId },
      include: { leaveType: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
