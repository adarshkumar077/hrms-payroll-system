import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Employee, Prisma, RoleCode, TaxRegime } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { PayrollConfigBodyDto } from './dto/payroll-config.dto';
import {
  calcDailyEarning,
  calcDailySalary,
  calcPayrollPreview,
  calendarDaysInMonth,
  defaultPayrollConfigJson,
  EmployeePayrollConfigJson,
  normalizePayrollConfig,
  StatutoryContext,
} from '../payroll/payroll-calculator';
import { financialYearOf } from '../payroll/statutory';
import { StatutoryRulesService } from '../payroll/statutory/statutory-rules.service';
import * as M from '../common/money';

const roundMoney = M.toNumber;

type EmployeeTaxFields = Pick<Employee, 'taxRegime' | 'oldRegimeDeclaredDeductions' | 'ptState' | 'gender'>;

@Injectable()
export class EmployeePayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statutoryRules: StatutoryRulesService,
  ) {}

  /**
   * Steady-state statutory context for previews: current FY rules for the company and the
   * employee's regime / PT state, treated as a full year (monthly TDS = annual tax ÷ 12).
   */
  private async previewContext(
    companyId: string,
    emp: EmployeeTaxFields,
    overrides: Partial<EmployeeTaxFields> = {},
  ): Promise<StatutoryContext> {
    const now = new Date();
    const fy = financialYearOf(now.getFullYear(), now.getMonth() + 1);
    const { rules } = await this.statutoryRules.getRules(companyId, fy);
    const merged = { ...emp, ...overrides };
    return {
      rules,
      year: Number(fy.slice(0, 4)),
      month: 4,
      taxRegime: merged.taxRegime ?? 'NEW',
      declaredDeductions: merged.oldRegimeDeclaredDeductions ?? 0,
      ptState: merged.ptState ?? null,
      gender: merged.gender ?? null,
    };
  }

  private taxFieldsFromDto(dto: PayrollConfigBodyDto): Partial<EmployeeTaxFields> {
    const out: Partial<EmployeeTaxFields> = {};
    if (dto.taxRegime) out.taxRegime = dto.taxRegime === 'OLD' ? TaxRegime.OLD : TaxRegime.NEW;
    if (dto.oldRegimeDeclaredDeductions != null) {
      out.oldRegimeDeclaredDeductions = M.toDb(dto.oldRegimeDeclaredDeductions);
    }
    if (dto.ptState) out.ptState = dto.ptState === 'NONE' ? null : dto.ptState;
    return out;
  }

  private taxView(emp: EmployeeTaxFields) {
    return {
      taxRegime: emp.taxRegime,
      oldRegimeDeclaredDeductions: emp.oldRegimeDeclaredDeductions,
      ptState: emp.ptState ?? 'NONE',
    };
  }

  private isHrOrCeo(user: AuthUser) {
    return (
      user.roles.includes(RoleCode.SUPER_ADMIN) ||
      user.roles.includes(RoleCode.HR) ||
      user.roles.includes(RoleCode.ADMIN)
    );
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
    const pfMode = d.pf?.mode ?? 'statutory';
    const esdEnabled = d.esd?.enabled ?? false;
    const esdType = d.esd?.type === 'one_time' || d.esd?.type === 'custom' ? d.esd.type : 'monthly';
    const esdAmount = d.esd?.amount ?? d.esd?.value ?? (esdEnabled ? 500 : base.deductions.esd.amount);
    return {
      allowances: {
        ...base.allowances,
        ...dto.allowances,
        custom: dto.allowances.custom ?? [],
      },
      deductions: {
        // statutory = engine (12% of Basic+DA capped at the wage ceiling); fixed / percent = manual override.
        pf: {
          enabled: pfEnabled,
          mode: pfMode,
          value: d.pf?.value ?? d.pf?.amount ?? base.deductions.pf.value,
        },
        // statutory = income-tax slab engine; fixed = manual monthly TDS.
        tds:
          d.tds?.mode === 'fixed'
            ? { enabled: d.tds.enabled !== false, mode: 'fixed', value: d.tds.value ?? d.tds.amount ?? 0 }
            : { enabled: d.tds?.enabled !== false, mode: 'statutory' },
        esi:
          d.esi?.mode === 'fixed'
            ? { enabled: !!d.esi.enabled, mode: 'fixed', value: d.esi.value ?? d.esi.amount ?? 0 }
            : { enabled: !!d.esi?.enabled, mode: 'statutory' },
        esd: {
          enabled: esdEnabled,
          amount: esdAmount,
          type: esdType,
          totalAmount: d.esd?.totalAmount ?? esdAmount,
          deductedToDate: Math.max(0, d.esd?.deductedToDate ?? 0),
        },
        professionalTax: {
          enabled: d.professionalTax?.enabled ?? base.deductions.professionalTax.enabled,
          mode: d.professionalTax?.mode === 'fixed' ? 'fixed' : 'statutory',
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
    const emp = await this.assertEmployee(actor.companyId, employeeId);
    const ctx = await this.previewContext(actor.companyId, emp);
    const row = await this.prisma.employeePayrollConfig.findUnique({ where: { employeeId } });
    if (!row) {
      return {
        ...this.taxView(emp),
        employeeId,
        grossMonthly: 0,
        dailySalary: null,
        hourlySalary: null,
        salaryType: 'MONTHLY',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        workingDays: 30,
        config: defaultPayrollConfigJson(),
        preview: calcPayrollPreview({ grossMonthly: 0, config: defaultPayrollConfigJson(), statutory: ctx }),
      };
    }
    const config = normalizePayrollConfig(row.configJson as EmployeePayrollConfigJson);
    return {
      ...row,
      ...this.taxView(emp),
      config,
      preview: calcPayrollPreview({ grossMonthly: row.grossMonthly, config, statutory: ctx }),
    };
  }

  /** Statutory preview for an unsaved config (same body as PUT); nothing is written. */
  async previewConfig(actor: AuthUser, employeeId: string, dto: PayrollConfigBodyDto) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const emp = await this.assertEmployee(actor.companyId, employeeId);
    const config = this.mergeConfigJson(dto);
    const ctx = await this.previewContext(actor.companyId, emp, this.taxFieldsFromDto(dto));
    return calcPayrollPreview({ grossMonthly: dto.grossMonthly, config, statutory: ctx });
  }

  async upsertConfig(actor: AuthUser, employeeId: string, dto: PayrollConfigBodyDto) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    let emp = await this.assertEmployee(actor.companyId, employeeId);
    const taxFields = this.taxFieldsFromDto(dto);
    if (Object.keys(taxFields).length) {
      emp = await this.prisma.employee.update({ where: { id: employeeId }, data: taxFields });
    }

    // Per-day salary always uses actual calendar days of the effective month (not fixed 30).
    const eff = new Date(dto.effectiveFrom);
    const calendarDays = calendarDaysInMonth(eff.getUTCFullYear(), eff.getUTCMonth() + 1);
    const workingDays = dto.workingDays ?? calendarDays;
    const config = this.mergeConfigJson(dto);
    const dailySalary = calcDailySalary(dto.grossMonthly, calendarDays);
    const ctx = await this.previewContext(actor.companyId, emp);
    const preview = calcPayrollPreview({ grossMonthly: dto.grossMonthly, config, statutory: ctx });

    const data = {
      companyId: actor.companyId,
      employeeId,
      grossMonthly: M.toDb(dto.grossMonthly),
      dailySalary: M.toDb(dailySalary),
      hourlySalary: M.toDbOrNull(dto.hourlySalary),
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
      ...this.taxView(emp),
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
      const esi = deductions.find((d) => d.code === 'ESI')?.amount ?? 0;
      const other = deductions
        .filter((d) => !['PF', 'TDS', 'ESI', 'ESD', 'PT', 'LOP', 'LOAN_EMI'].includes(d.code))
        .reduce((s, d) => s.plus(M.money(d.amount)), M.money(0));

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
        esi,
        deposit: esd,
        professionalTax: pt,
        otherDeductions: roundMoney(other),
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
    const emp = await this.assertEmployee(actor.companyId, employeeId);

    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));

    const configRow = await this.prisma.employeePayrollConfig.findUnique({ where: { employeeId } });
    const config = normalizePayrollConfig(
      (configRow?.configJson as EmployeePayrollConfigJson) ?? defaultPayrollConfigJson(),
    );
    const grossMonthly = configRow?.grossMonthly ?? 0;
    const calendarDays = calendarDaysInMonth(y, m);
    const workingDays = calendarDays;
    // Always divide by actual calendar days of the selected month (ignore stale 30-day store).
    const dailySalary = calcDailySalary(grossMonthly, calendarDays);

    const attendance = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    let runningTotal = M.money(0);
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
      runningTotal = runningTotal.plus(earning.amount);
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

    const preview = calcPayrollPreview({
      grossMonthly,
      config,
      statutory: await this.previewContext(actor.companyId, emp),
    });
    const attendanceRatio = workingDays > 0 ? presentDays / workingDays : 1;
    // gross × presentDays ÷ workingDays, exact then rounded once.
    const proRatedGross =
      workingDays > 0 ? roundMoney(M.div(M.mul(grossMonthly, presentDays), workingDays)) : roundMoney(grossMonthly);
    const expectedMonthEnd = roundMoney(
      M.nonNegative(M.sub(M.add(proRatedGross, preview.totalAllowances), preview.totalDeductions)),
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
      currentNetSalary: expectedMonthEnd,
      attendanceIncentive: config.allowances.incentive ?? 0,
      expectedMonthEndSalary: expectedMonthEnd,
      daily,
      preview,
      config: configRow,
    };
  }
}
