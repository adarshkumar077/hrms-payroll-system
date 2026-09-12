import { Injectable } from '@nestjs/common';
import {
  EmploymentStatus,
  LoanAdvanceStatus,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

const CACHE_TTL_MS = 5 * 60_000;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async employeeDashboard(user: AuthUser) {
    if (!user.employeeId) {
      return { role: 'user', message: 'No employee profile linked' };
    }
    const employeeId = user.employeeId;
    const now = new Date();
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));

    const [attendance, leaveBalances, openTickets, loans, latestPayslip, goals] =
      await Promise.all([
        this.prisma.attendanceRecord.count({
          where: { employeeId, date: { gte: from, lte: to } },
        }),
        this.prisma.leaveBalance.findMany({
          where: { employeeId, year: now.getFullYear() },
          include: { leaveType: true },
        }),
        this.prisma.ticket.count({
          where: {
            requesterId: employeeId,
            status: { notIn: ['RESOLVED', 'CLOSED'] },
          },
        }),
        this.prisma.loanAdvance.findMany({
          where: { employeeId, status: LoanAdvanceStatus.ACTIVE },
        }),
        this.prisma.payrollLine.findFirst({
          where: {
            employeeId,
            payrollRun: { status: { in: [PayrollRunStatus.LOCKED, PayrollRunStatus.APPROVED] } },
          },
          include: { payrollRun: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.performanceGoal.count({
          where: { employeeId, cycleYear: now.getFullYear(), status: 'ACTIVE' },
        }),
      ]);

    return {
      monthAttendanceDays: attendance,
      leaveBalances: leaveBalances
        .filter((b) => b.leaveType != null)
        .map((b) => ({
          code: b.leaveType!.code,
          available: b.opening + b.accrued + b.carriedForward + b.adjusted - b.used - b.encashed,
        })),
      openTickets,
      activeLoans: loans.length,
      loanOutstanding: loans.reduce((s, l) => s + l.outstanding, 0),
      latestPayslip: latestPayslip
        ? {
            netPay: latestPayslip.netPay,
            year: latestPayslip.payrollRun.year,
            month: latestPayslip.payrollRun.month,
          }
        : null,
      activeGoals: goals,
    };
  }

  async hrDashboard(companyId: string) {
    const [activeEmployees, onProbation, onNotice, pendingLeave, openTickets, pendingOnboarding] =
      await Promise.all([
        this.prisma.employee.count({ where: { companyId, isActive: true } }),
        this.prisma.employee.count({
          where: { companyId, status: EmploymentStatus.PROBATION, isActive: true },
        }),
        this.prisma.employee.count({
          where: { companyId, status: EmploymentStatus.NOTICE },
        }),
        this.prisma.leaveApplication.count({
          where: { companyId, status: 'PENDING' },
        }),
        this.prisma.ticket.count({
          where: { companyId, status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } },
        }),
        this.prisma.onboardingChecklist.count({
          where: { companyId, status: 'IN_PROGRESS' },
        }),
      ]);

    return {
      activeEmployees,
      onProbation,
      onNotice,
      pendingLeave,
      openTickets,
      pendingOnboarding,
    };
  }

  async ceoDashboard(companyId: string, forceRefresh = false) {
    const cached = await this.prisma.dashboardMetricsCache.findUnique({
      where: { companyId_scope: { companyId, scope: 'SUPER_ADMIN' } },
    });
    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.computedAt.getTime() < CACHE_TTL_MS
    ) {
      return {
        ...(cached.metricsJson as object),
        cached: true,
        computedAt: cached.computedAt,
      };
    }
    return this.refreshCeoMetrics(companyId);
  }

  async refreshCeoMetrics(companyId: string) {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getFullYear(), 0, 1));
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));

    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      select: {
        id: true,
        isActive: true,
        status: true,
        department: true,
        joinedAt: true,
        exitAt: true,
        createdAt: true,
      },
    });

    const totalEmployees = employees.filter((e) => e.isActive).length;
    const hiredThisYear = employees.filter(
      (e) => e.joinedAt && e.joinedAt >= yearStart,
    ).length;
    const exitedThisYear = employees.filter(
      (e) => e.exitAt && e.exitAt >= yearStart,
    ).length;
    const attritionRate =
      totalEmployees + exitedThisYear > 0
        ? Math.round((exitedThisYear / (totalEmployees + exitedThisYear)) * 1000) / 10
        : 0;

    const deptMap = new Map<string, number>();
    for (const e of employees.filter((x) => x.isActive)) {
      const d = e.department ?? 'Unassigned';
      deptMap.set(d, (deptMap.get(d) ?? 0) + 1);
    }

    const lastPayroll = await this.prisma.payrollRun.findFirst({
      where: {
        companyId,
        status: { in: [PayrollRunStatus.LOCKED, PayrollRunStatus.APPROVED] },
      },
      include: { lines: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    const payrollCost = lastPayroll
      ? lastPayroll.lines.reduce((s, l) => s + l.netPay, 0)
      : 0;

    // Department cost proxy: active structures monthly earn sum by dept
    const structures = await this.prisma.employeeSalaryStructure.findMany({
      where: { companyId, isActive: true },
      include: {
        employee: { select: { department: true, isActive: true } },
        lines: { include: { component: true } },
      },
    });
    const deptCost: Record<string, number> = {};
    for (const s of structures) {
      if (!s.employee.isActive) continue;
      const d = s.employee.department ?? 'Unassigned';
      const monthly = s.lines
        .filter((l) => l.component.type === 'EARNING')
        .reduce((sum, l) => sum + l.amount, 0);
      deptCost[d] = (deptCost[d] ?? 0) + monthly;
    }

    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: { companyId, date: { gte: monthStart, lte: monthEnd } },
      select: { status: true },
    });
    const presentish = attendanceRecords.filter((a) =>
      ['P', 'PL', 'HD', 'WFH', 'OD'].includes(a.status),
    ).length;
    const attendancePct =
      attendanceRecords.length > 0
        ? Math.round((presentish / attendanceRecords.length) * 1000) / 10
        : 0;

    const loanLiabilities = await this.prisma.loanAdvance.aggregate({
      where: { companyId, status: LoanAdvanceStatus.ACTIVE },
      _sum: { outstanding: true },
    });

    const esdEmployees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    let depositLiabilities = 0;
    for (const e of esdEmployees) {
      const last = await this.prisma.esdLedgerEntry.findFirst({
        where: { employeeId: e.id },
        orderBy: { createdAt: 'desc' },
      });
      depositLiabilities += last?.balanceAfter ?? 0;
    }

    const pendingOnboarding = await this.prisma.onboardingChecklist.count({
      where: { companyId, status: 'IN_PROGRESS' },
    });

    const metrics = {
      totalEmployees,
      payrollCost: Math.round(payrollCost * 100) / 100,
      lastPayrollPeriod: lastPayroll
        ? { year: lastPayroll.year, month: lastPayroll.month }
        : null,
      departmentHeadcount: Object.fromEntries(deptMap),
      departmentCost: deptCost,
      attendancePct,
      employeeGrowth: hiredThisYear,
      attritionRate,
      liabilities: {
        loans: loanLiabilities._sum.outstanding ?? 0,
        deposits: Math.round(depositLiabilities * 100) / 100,
      },
      depositLiabilities: Math.round(depositLiabilities * 100) / 100,
      hiringStatus: {
        hiredThisYear,
        pendingOnboarding,
        onProbation: employees.filter((e) => e.status === EmploymentStatus.PROBATION && e.isActive)
          .length,
      },
      cached: false,
      computedAt: new Date(),
    };

    await this.prisma.dashboardMetricsCache.upsert({
      where: { companyId_scope: { companyId, scope: 'SUPER_ADMIN' } },
      create: {
        companyId,
        scope: 'SUPER_ADMIN',
        metricsJson: metrics as unknown as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
      update: {
        metricsJson: metrics as unknown as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
    });

    return metrics;
  }

  /** Manager viewing another employee — gated by company setting */
  async employeeApprovalView(user: AuthUser, employeeId: string) {
    const setting = await this.prisma.companySetting.findUnique({
      where: {
        companyId_key: { companyId: user.companyId, key: 'dashboard.employee_override' },
      },
    });
    const enabled = setting?.value === true || setting?.value === 'true';
    const isHr = user.roles.some((r) => (['SUPER_ADMIN', 'HR'] as string[]).includes(r));
    if (!enabled && !isHr) {
      return { allowed: false, message: 'Employee dashboard override disabled' };
    }
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId },
    });
    if (!emp) return { allowed: false, message: 'Employee not found' };
    // Reuse employee dashboard shape with synthetic user
    return {
      allowed: true,
      employee: {
        id: emp.id,
        employeeCode: emp.employeeCode,
        firstName: emp.firstName,
        lastName: emp.lastName,
      },
      dashboard: await this.employeeDashboard({
        ...user,
        employeeId: emp.id,
      } as AuthUser),
    };
  }
}
