import { Injectable, NotFoundException } from '@nestjs/common';
import {
  LoanAdvanceStatus,
  LoanAdvanceType,
  PayrollRunStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { buildExport, rowsToCsv } from '../common/export.engine';

function avail(b: {
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
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async attendance(companyId: string, year?: number, month?: number) {
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));
    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId, date: { gte: from, lte: to } },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true, department: true },
        },
      },
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    });
    return {
      year: y,
      month: m,
      rows: records.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        employeeCode: r.employee.employeeCode,
        name: `${r.employee.firstName} ${r.employee.lastName ?? ''}`.trim(),
        department: r.employee.department ?? '',
        status: r.status,
        lateMinutes: r.lateMinutes ?? 0,
      })),
    };
  }

  async leave(companyId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const apps = await this.prisma.leaveApplication.findMany({
      where: {
        companyId,
        fromDate: {
          gte: new Date(Date.UTC(y, 0, 1)),
          lte: new Date(Date.UTC(y, 11, 31)),
        },
      },
      include: {
        leaveType: true,
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true, department: true },
        },
      },
      orderBy: { fromDate: 'desc' },
    });
    return {
      year: y,
      rows: apps.map((a) => ({
        employeeCode: a.employee.employeeCode,
        name: `${a.employee.firstName} ${a.employee.lastName ?? ''}`.trim(),
        department: a.employee.department ?? '',
        leaveType: a.leaveType.code,
        from: a.fromDate.toISOString().slice(0, 10),
        to: a.toDate.toISOString().slice(0, 10),
        days: a.days,
        status: a.status,
      })),
    };
  }

  async payroll(companyId: string, year?: number, month?: number) {
    const where: { companyId: string; year?: number; month?: number } = { companyId };
    if (year) where.year = year;
    if (month) where.month = month;
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        ...where,
        status: { in: [PayrollRunStatus.LOCKED, PayrollRunStatus.APPROVED, PayrollRunStatus.REVIEW] },
      },
      include: {
        lines: {
          include: {
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true, department: true },
            },
          },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    const rows = runs.flatMap((run) =>
      run.lines.map((l) => ({
        year: run.year,
        month: run.month,
        status: run.status,
        employeeCode: l.employee.employeeCode,
        name: `${l.employee.firstName} ${l.employee.lastName ?? ''}`.trim(),
        department: l.employee.department ?? '',
        gross: l.grossEarnings,
        deductions: l.totalDeductions,
        net: l.netPay,
        lopDays: l.lopDays,
      })),
    );
    return { rows };
  }

  async employee(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      orderBy: { employeeCode: 'asc' },
      include: {
        reportingTo: { select: { employeeCode: true, firstName: true } },
      },
    });
    return {
      rows: employees.map((e) => ({
        employeeCode: e.employeeCode,
        name: `${e.firstName} ${e.lastName ?? ''}`.trim(),
        email: e.email ?? '',
        mobile: e.mobile ?? '',
        department: e.department ?? '',
        designation: e.designation ?? '',
        status: e.status,
        isActive: e.isActive,
        joinedAt: e.joinedAt?.toISOString().slice(0, 10) ?? '',
        exitAt: e.exitAt?.toISOString().slice(0, 10) ?? '',
        manager: e.reportingTo
          ? `${e.reportingTo.employeeCode} ${e.reportingTo.firstName}`
          : '',
      })),
    };
  }

  async department(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { department: true, status: true },
    });
    const map = new Map<string, { headcount: number; probation: number }>();
    for (const e of employees) {
      const d = e.department ?? 'Unassigned';
      const cur = map.get(d) ?? { headcount: 0, probation: 0 };
      cur.headcount++;
      if (e.status === 'PROBATION') cur.probation++;
      map.set(d, cur);
    }
    return {
      rows: [...map.entries()].map(([department, v]) => ({
        department,
        headcount: v.headcount,
        onProbation: v.probation,
      })),
    };
  }

  async cost(companyId: string) {
    const structures = await this.prisma.employeeSalaryStructure.findMany({
      where: { companyId, isActive: true },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true, isActive: true } },
        lines: { include: { component: true } },
      },
    });
    const rows = structures
      .filter((s) => s.employee.isActive)
      .map((s) => {
        const monthly = s.lines
          .filter((l) => l.component.type === 'EARNING')
          .reduce((sum, l) => sum + l.amount, 0);
        return {
          employeeCode: s.employee.employeeCode,
          name: `${s.employee.firstName} ${s.employee.lastName ?? ''}`.trim(),
          department: s.employee.department ?? '',
          ctcAnnual: s.ctcAnnual,
          monthlyEarnings: monthly,
        };
      });
    const byDept: Record<string, number> = {};
    for (const r of rows) {
      byDept[r.department] = (byDept[r.department] ?? 0) + r.monthlyEarnings;
    }
    return { rows, departmentMonthlyCost: byDept };
  }

  async compliance(companyId: string, year?: number, month?: number) {
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const run = await this.prisma.payrollRun.findUnique({
      where: { companyId_year_month: { companyId, year: y, month: m } },
      include: {
        lines: {
          include: {
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!run) {
      return { year: y, month: m, rows: [], note: 'No payroll run for period' };
    }
    const rows = run.lines.map((l) => {
      const ded = (l.deductionsJson as { code: string; amount: number }[]) ?? [];
      const pf = ded.find((d) => d.code === 'PF')?.amount ?? 0;
      const pt = ded.find((d) => d.code === 'PT')?.amount ?? 0;
      return {
        employeeCode: l.employee.employeeCode,
        name: `${l.employee.firstName} ${l.employee.lastName ?? ''}`.trim(),
        gross: l.grossEarnings,
        pf,
        professionalTax: pt,
        net: l.netPay,
      };
    });
    return { year: y, month: m, status: run.status, rows };
  }

  async audit(companyId: string, limit = 200) {
    const logs = await this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(1000, Math.max(1, limit)),
    });
    return {
      rows: logs.map((l) => ({
        at: l.createdAt.toISOString(),
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId ?? '',
        actorId: l.actorId ?? '',
      })),
    };
  }

  async performance(companyId: string, year?: number) {
    const cycleYear = year ?? new Date().getFullYear();
    const [goals, reviews, promotions] = await Promise.all([
      this.prisma.performanceGoal.findMany({
        where: { companyId, cycleYear },
        include: {
          employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.managerReview.findMany({
        where: { companyId, cycleYear },
        include: {
          employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
        },
      }),
      this.prisma.promotionRecommendation.findMany({
        where: { companyId, cycleYear },
      }),
    ]);
    const reviewMap = new Map(reviews.map((r) => [r.employeeId, r]));
    const promoMap = new Map(promotions.map((p) => [p.employeeId, p]));
    return {
      year: cycleYear,
      rows: goals.map((goal) => ({
        employeeCode: goal.employee.employeeCode,
        name: `${goal.employee.firstName} ${goal.employee.lastName ?? ''}`.trim(),
        department: goal.employee.department ?? '',
        goal: goal.title,
        status: goal.status,
        rating: reviewMap.get(goal.employeeId)?.rating ?? '',
        promotionRecommended: promoMap.get(goal.employeeId)?.recommended ?? false,
      })),
    };
  }

  async reimbursements(companyId: string) {
    const claims = await this.prisma.reimbursementClaim.findMany({
      where: { companyId },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      rows: claims.map((claim) => ({
        employeeCode: claim.employee.employeeCode,
        name: `${claim.employee.firstName} ${claim.employee.lastName ?? ''}`.trim(),
        department: claim.employee.department ?? '',
        category: claim.category,
        amount: claim.amount,
        status: claim.status,
        createdAt: claim.createdAt.toISOString(),
      })),
    };
  }

  async assets(companyId: string) {
    const assets = await this.prisma.asset.findMany({
      where: { companyId },
      include: {
        allocations: {
          include: {
            employee: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
          orderBy: { allocatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { assetTag: 'asc' },
    });
    return {
      rows: assets.map((asset) => ({
        assetTag: asset.assetTag,
        name: asset.name,
        type: asset.type,
        status: asset.status,
        assignedTo: asset.allocations[0]
          ? `${asset.allocations[0].employee.employeeCode} ${asset.allocations[0].employee.firstName} ${asset.allocations[0].employee.lastName ?? ''}`.trim()
          : '',
        purchaseCost: asset.purchaseCost ?? 0,
      })),
    };
  }

  async exit(companyId: string) {
    const rows = await this.balanceFnf(companyId);
    return { rows: rows.rows };
  }

  async esd(companyId: string) {
    const rows = await this.balanceDeposit(companyId);
    return { rows: rows.rows };
  }

  // ---- Balance sheets ----
  async balanceLeave(companyId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const balances = await this.prisma.leaveBalance.findMany({
      where: { companyId, year: y },
      include: {
        leaveType: true,
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true, department: true },
        },
      },
      orderBy: [{ employeeId: 'asc' }],
    });
    return {
      year: y,
      rows: balances.map((b) => ({
        employeeCode: b.employee.employeeCode,
        name: `${b.employee.firstName} ${b.employee.lastName ?? ''}`.trim(),
        department: b.employee.department ?? '',
        leaveType: b.leaveType.code,
        opening: b.opening,
        accrued: b.accrued,
        used: b.used,
        encashed: b.encashed,
        available: avail(b),
      })),
    };
  }

  async balanceSalary(companyId: string) {
    return this.cost(companyId);
  }

  async balanceDeposit(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
      orderBy: { employeeCode: 'asc' },
    });
    const rows = [];
    for (const e of employees) {
      const last = await this.prisma.esdLedgerEntry.findFirst({
        where: { employeeId: e.id },
        orderBy: { createdAt: 'desc' },
      });
      rows.push({
        employeeCode: e.employeeCode,
        name: `${e.firstName} ${e.lastName ?? ''}`.trim(),
        department: e.department ?? '',
        balance: last?.balanceAfter ?? 0,
      });
    }
    return { rows };
  }

  async balanceLoan(companyId: string, type?: 'LOAN' | 'ADVANCE') {
    const loans = await this.prisma.loanAdvance.findMany({
      where: {
        companyId,
        ...(type ? { type: type as LoanAdvanceType } : {}),
        status: { in: [LoanAdvanceStatus.ACTIVE, LoanAdvanceStatus.CLOSED, LoanAdvanceStatus.PENDING] },
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true, department: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      rows: loans.map((l) => ({
        employeeCode: l.employee.employeeCode,
        name: `${l.employee.firstName} ${l.employee.lastName ?? ''}`.trim(),
        department: l.employee.department ?? '',
        type: l.type,
        amount: l.amount,
        outstanding: l.outstanding,
        emiAmount: l.emiAmount,
        status: l.status,
      })),
    };
  }

  async balanceOvertime(companyId: string, year?: number, month?: number) {
    // Proxy: count OD / HD as overtime-ish markers from attendance
    const att = await this.attendance(companyId, year, month);
    const rows = att.rows.filter((r) => r.status === 'OD' || r.status === 'HD');
    return { year: att.year, month: att.month, rows, note: 'Proxy from OD/HD attendance statuses' };
  }

  async balanceIncentive(companyId: string, year?: number, month?: number) {
    const pay = await this.payroll(companyId, year, month);
    const rows = pay.rows.map((r) => ({
      ...r,
      // incentive is inside earnings JSON historically; surface net as placeholder if not split
      note: 'See payroll earnings INCENTIVE component in run detail',
    }));
    return { rows };
  }

  async balanceFnf(companyId: string) {
    const fnfs = await this.prisma.fnfSettlement.findMany({
      where: { companyId },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true, department: true },
        },
        resignation: { select: { lastWorkingDay: true, status: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });
    return {
      rows: fnfs.map((f) => ({
        employeeCode: f.employee.employeeCode,
        name: `${f.employee.firstName} ${f.employee.lastName ?? ''}`.trim(),
        department: f.employee.department ?? '',
        status: f.status,
        credits: f.grossCredits,
        debits: f.grossDebits,
        netPayable: f.netPayable,
        lastWorkingDay: f.resignation.lastWorkingDay.toISOString().slice(0, 10),
      })),
    };
  }

  async resolveReport(
    companyId: string,
    kind: string,
    query: { year?: number; month?: number; limit?: number },
  ): Promise<{ title: string; rows: Record<string, unknown>[] }> {
    switch (kind) {
      case 'attendance': {
        const d = await this.attendance(companyId, query.year, query.month);
        return { title: `Attendance ${d.year}-${d.month}`, rows: d.rows };
      }
      case 'leave': {
        const d = await this.leave(companyId, query.year);
        return { title: `Leave ${d.year}`, rows: d.rows };
      }
      case 'payroll': {
        const d = await this.payroll(companyId, query.year, query.month);
        return { title: 'Payroll', rows: d.rows };
      }
      case 'employee': {
        const d = await this.employee(companyId);
        return { title: 'Employees', rows: d.rows };
      }
      case 'department': {
        const d = await this.department(companyId);
        return { title: 'Departments', rows: d.rows };
      }
      case 'cost': {
        const d = await this.cost(companyId);
        return { title: 'Cost', rows: d.rows };
      }
      case 'compliance': {
        const d = await this.compliance(companyId, query.year, query.month);
        return { title: `Compliance ${d.year}-${d.month}`, rows: d.rows };
      }
      case 'audit': {
        const d = await this.audit(companyId, query.limit);
        return { title: 'Audit log', rows: d.rows };
      }
      case 'performance': {
        const d = await this.performance(companyId, query.year);
        return { title: `Performance ${d.year}`, rows: d.rows };
      }
      case 'reimbursement':
      case 'reimbursements': {
        const d = await this.reimbursements(companyId);
        return { title: 'Reimbursements', rows: d.rows };
      }
      case 'asset':
      case 'assets': {
        const d = await this.assets(companyId);
        return { title: 'Assets', rows: d.rows };
      }
      case 'exit': {
        const d = await this.exit(companyId);
        return { title: 'Exit & F&F', rows: d.rows };
      }
      case 'esd': {
        const d = await this.esd(companyId);
        return { title: 'ESD / Deposit', rows: d.rows };
      }
      default:
        throw new NotFoundException(`Unknown report: ${kind}`);
    }
  }

  async resolveBalance(
    companyId: string,
    kind: string,
    query: { year?: number; month?: number },
  ): Promise<{ title: string; rows: Record<string, unknown>[] }> {
    switch (kind) {
      case 'leave': {
        const d = await this.balanceLeave(companyId, query.year);
        return { title: `Leave balance ${d.year}`, rows: d.rows };
      }
      case 'salary': {
        const d = await this.balanceSalary(companyId);
        return { title: 'Salary balance', rows: d.rows };
      }
      case 'deposit': {
        const d = await this.balanceDeposit(companyId);
        return { title: 'ESD deposit balance', rows: d.rows };
      }
      case 'loan': {
        const d = await this.balanceLoan(companyId, 'LOAN');
        return { title: 'Loan balance', rows: d.rows };
      }
      case 'advance': {
        const d = await this.balanceLoan(companyId, 'ADVANCE');
        return { title: 'Advance balance', rows: d.rows };
      }
      case 'overtime': {
        const d = await this.balanceOvertime(companyId, query.year, query.month);
        return { title: 'Overtime (proxy)', rows: d.rows };
      }
      case 'incentive': {
        const d = await this.balanceIncentive(companyId, query.year, query.month);
        return { title: 'Incentive', rows: d.rows };
      }
      case 'fnf': {
        const d = await this.balanceFnf(companyId);
        return { title: 'F&F settlements', rows: d.rows };
      }
      default:
        throw new NotFoundException(`Unknown balance sheet: ${kind}`);
    }
  }

  async exportCsv(title: string, rows: Record<string, unknown>[]) {
    return buildExport('csv', title, rows);
  }

  async exportExcel(title: string, rows: Record<string, unknown>[]) {
    return buildExport('excel', title, rows);
  }

  async exportPdfHtml(title: string, rows: Record<string, unknown>[]) {
    return buildExport('pdf', title, rows);
  }

  async exportEmail(
    companyId: string,
    actorId: string,
    title: string,
    rows: Record<string, unknown>[],
    recipientHint?: string,
  ) {
    const csv = rowsToCsv(rows);
    await this.prisma.notification.create({
      data: {
        companyId,
        title: `Report ready: ${title}`,
        body: `Report "${title}" generated with ${rows.length} row(s). CSV attached in dispatch log (email stub).`,
        category: 'report',
        status: NotificationStatus.SENT,
      },
    });
    await this.prisma.notificationDispatchLog.create({
      data: {
        companyId,
        channel: NotificationChannel.EMAIL,
          recipient: recipientHint ?? 'report-recipient-not-configured',
        title: `Report: ${title}`,
        body: `Rows: ${rows.length}\n\n${csv.slice(0, 2000)}`,
        status: 'STUB_SENT',
        meta: { actorId, note: 'Email provider stub' },
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[report:email] ${title} rows=${rows.length}`);
    return { ok: true, rows: rows.length, channel: 'EMAIL', stub: true };
  }
}
