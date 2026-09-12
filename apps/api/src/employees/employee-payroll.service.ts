import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { PayrollConfigBodyDto } from './dto/payroll-config.dto';
import {
  calcDailyEarning,
  calcDailySalary,
  calcPayrollPreview,
  defaultPayrollConfigJson,
  EmployeePayrollConfigJson,
  normalizePayrollConfig,
} from '../payroll/payroll-calculator';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class EmployeePayrollService {
  constructor(private readonly prisma: PrismaService) {}

  private isHrOrCeo(user: AuthUser) {
    return user.roles.includes(RoleCode.SUPER_ADMIN) || user.roles.includes(RoleCode.HR);
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  private mergeConfigJson(dto: PayrollConfigBodyDto): EmployeePayrollConfigJson {
    const base = defaultPayrollConfigJson();
    const d = dto.deductions;
    const pfEnabled = d.pf?.enabled ?? false;
    const tdsEnabled = d.tds?.enabled ?? false;
    const esdEnabled = d.esd?.enabled ?? false;
    return {
      allowances: {
        ...base.allowances,
        ...dto.allowances,
        custom: dto.allowances.custom ?? [],
      },
      deductions: {
        pf: {
          ...base.deductions.pf,
          ...(d.pf ?? {}),
          enabled: pfEnabled,
          mode: d.pf?.mode ?? 'fixed',
          value: d.pf?.value ?? d.pf?.amount ?? (pfEnabled ? 3600 : base.deductions.pf.value),
        },
        tds: {
          ...base.deductions.tds,
          ...(d.tds ?? {}),
          enabled: tdsEnabled,
          mode: d.tds?.mode ?? 'percent',
          value: d.tds?.value ?? d.tds?.amount ?? (tdsEnabled ? 1 : base.deductions.tds.value),
        },
        esd: {
          enabled: esdEnabled,
          amount: d.esd?.amount ?? d.esd?.value ?? (esdEnabled ? 500 : base.deductions.esd.amount),
        },
        professionalTax: {
          enabled: d.professionalTax?.enabled ?? false,
          amount: d.professionalTax?.amount ?? d.professionalTax?.value ?? 0,
        },
        custom: d.custom ?? [],
      },
    };
  }

  async getConfig(actor: AuthUser, employeeId: string) {
    const privileged = this.isHrOrCeo(actor) || actor.roles.includes(RoleCode.ADMIN);
    if (!privileged && actor.employeeId !== employeeId) {
      throw new ForbiddenException();
    }
    await this.assertEmployee(actor.companyId, employeeId);
    const row = await this.prisma.employeePayrollConfig.findUnique({ where: { employeeId } });
    if (!row) {
      return {
        employeeId,
        grossMonthly: 0,
        dailySalary: null,
        hourlySalary: null,
        salaryType: 'MONTHLY',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        workingDays: 30,
        config: defaultPayrollConfigJson(),
        preview: calcPayrollPreview({ grossMonthly: 0, config: defaultPayrollConfigJson() }),
      };
    }
    const config = normalizePayrollConfig(row.configJson as EmployeePayrollConfigJson);
    return {
      ...row,
      config,
      preview: calcPayrollPreview({ grossMonthly: row.grossMonthly, config }),
    };
  }

  async upsertConfig(actor: AuthUser, employeeId: string, dto: PayrollConfigBodyDto) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    await this.assertEmployee(actor.companyId, employeeId);

    const workingDays = dto.workingDays ?? 30;
    const config = this.mergeConfigJson(dto);
    const dailySalary = calcDailySalary(dto.grossMonthly, workingDays, dto.dailySalary);
    const preview = calcPayrollPreview({ grossMonthly: dto.grossMonthly, config });

    const data = {
      companyId: actor.companyId,
      employeeId,
      grossMonthly: roundMoney(dto.grossMonthly),
      dailySalary: roundMoney(dailySalary),
      hourlySalary: dto.hourlySalary != null ? roundMoney(dto.hourlySalary) : null,
      salaryType: dto.salaryType ?? 'MONTHLY',
      effectiveFrom: new Date(dto.effectiveFrom),
      workingDays,
      configJson: config as unknown as Prisma.InputJsonValue,
    };

    const saved = await this.prisma.employeePayrollConfig.upsert({
      where: { employeeId },
      create: data,
      update: data,
    });

    return {
      ...saved,
      config,
      preview,
    };
  }

  async payrollHistory(actor: AuthUser, employeeId: string) {
    const privileged = this.isHrOrCeo(actor) || actor.roles.includes(RoleCode.ADMIN);
    if (!privileged && actor.employeeId !== employeeId) throw new ForbiddenException();
    await this.assertEmployee(actor.companyId, employeeId);

    const lines = await this.prisma.payrollLine.findMany({
      where: { companyId: actor.companyId, employeeId },
      include: { payrollRun: true },
      orderBy: [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }],
    });

    return lines.map((line) => {
      const earnings = Array.isArray(line.earningsJson)
        ? (line.earningsJson as { code: string; name: string; amount: number }[])
        : [];
      const deductions = Array.isArray(line.deductionsJson)
        ? (line.deductionsJson as { code: string; name: string; amount: number }[])
        : [];
      const pf = deductions.find((d) => d.code === 'PF')?.amount ?? 0;
      const tds = deductions.find((d) => d.code === 'TDS')?.amount ?? 0;
      const esd = deductions.find((d) => d.code === 'ESD')?.amount ?? 0;
      const pt = deductions.find((d) => d.code === 'PT')?.amount ?? 0;
      const other = deductions
        .filter((d) => !['PF', 'TDS', 'ESD', 'PT', 'LOP', 'LOAN_EMI'].includes(d.code))
        .reduce((s, d) => s + d.amount, 0);

      return {
        id: line.id,
        month: line.payrollRun.month,
        year: line.payrollRun.year,
        status: line.payrollRun.status,
        workingDays: line.attendanceDays,
        presentDays: line.attendanceDays,
        absentDays: line.lopDays,
        halfDays: 0,
        leaveDays: 0,
        grossSalary: line.grossEarnings,
        pf,
        tds,
        deposit: esd,
        professionalTax: pt,
        otherDeductions: other,
        totalEarnings: line.grossEarnings,
        totalDeductions: line.totalDeductions,
        netSalary: line.netPay,
        paidAt: line.paidAt,
      };
    });
  }

  async salaryTracker(actor: AuthUser, employeeId: string, year?: number, month?: number) {
    const privileged = this.isHrOrCeo(actor) || actor.roles.includes(RoleCode.ADMIN);
    if (!privileged && actor.employeeId !== employeeId) throw new ForbiddenException();
    await this.assertEmployee(actor.companyId, employeeId);

    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));

    const configRow = await this.prisma.employeePayrollConfig.findUnique({ where: { employeeId } });
    const config = (configRow?.configJson as EmployeePayrollConfigJson) ?? defaultPayrollConfigJson();
    const grossMonthly = configRow?.grossMonthly ?? 0;
    const workingDays = configRow?.workingDays ?? to.getUTCDate();
    const dailySalary = configRow?.dailySalary ?? calcDailySalary(grossMonthly, workingDays);

    const attendance = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    let runningTotal = 0;
    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let lateMarks = 0;

    const daily = attendance.map((row) => {
      const earning = calcDailyEarning(row.status, dailySalary);
      if (['P', 'PL', 'WFH', 'OD', 'L'].includes(row.status)) presentDays += 1;
      if (['A', 'ULOB'].includes(row.status)) absentDays += 1;
      if (row.status === 'HD') halfDays += 1;
      if (row.status === 'L') lateMarks += 1;
      runningTotal += earning.amount;
      return {
        date: row.date,
        dayName: row.date.toLocaleDateString('en-IN', { weekday: 'long' }),
        status: row.status,
        checkIn: row.checkInAt,
        checkOut: row.checkOutAt,
        workingHours: row.workMinutes ? row.workMinutes / 60 : null,
        dailySalary,
        dailyEarning: earning.amount,
        color: earning.color,
        runningMonthlyTotal: roundMoney(runningTotal),
        remarks: row.sourceNote ?? row.correctionNote,
      };
    });

    const preview = calcPayrollPreview({ grossMonthly, config });
    const attendanceRatio = workingDays > 0 ? presentDays / workingDays : 1;
    const proRatedGross = roundMoney(grossMonthly * attendanceRatio);
    const expectedMonthEnd = Math.max(
      0,
      proRatedGross + preview.totalAllowances - preview.totalDeductions,
    );

    return {
      year: y,
      month: m,
      workingDays,
      presentDays,
      absentDays,
      halfDays,
      lateMarks,
      paidLeaves: attendance.filter((a) => a.status === 'PL').length,
      weekOffs: attendance.filter((a) => a.status === 'WO').length,
      holidays: attendance.filter((a) => a.status === 'H').length,
      currentGrossEarnings: proRatedGross,
      currentTotalDeductions: preview.totalDeductions,
      currentNetSalary: Math.max(0, proRatedGross + preview.totalAllowances - preview.totalDeductions),
      attendanceIncentive: config.allowances.incentive ?? 0,
      expectedMonthEndSalary: expectedMonthEnd,
      daily,
      preview,
      config: configRow,
    };
  }
}
