import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AttendanceDayStatus,
  AuditAction,
  DamageChargeStatus,
  EsdEntryType,
  LoanAdvanceStatus,
  LoanAdvanceType,
  PayrollRunStatus,
  Prisma,
  ReimbursementStatus,
  RoleCode,
  SalaryComponentType,
  WorkflowType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { WorkflowService } from '../workflow/workflow.service';
import {
  AssignStructureDto,
  CreateComponentDto,
  CreateTemplateDto,
  GeneratePayrollDto,
  RequestLoanDto,
  ReviewLoanDto,
  ReviewReimbursementDto,
  SubmitReimbursementDto,
} from './dto/money.dto';
import {
  buildEmiAmounts,
  calcEmi,
  calcEsdForMonth,
  calcPayrollPreview,
  calcPayslipTotals,
  calcProratedAmount,
  EmployeePayrollConfigJson,
  normalizePayrollConfig,
  PayrollPreview,
} from './payroll-calculator';
import { isIncentiveEligible, tallyMonthAttendance, type IncentiveRules } from './incentive';
import {
  PriorPayrollLine,
  priorMonthsInEsiPeriod,
  priorMonthsInFy,
  summarizePriorPayroll,
} from './statutory';
import { StatutoryRulesService } from './statutory/statutory-rules.service';
import * as M from '../common/money';

type PayItem = { code: string; name: string; amount: number };

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflow: WorkflowService,
    private readonly statutoryRules: StatutoryRulesService,
  ) {}

  /** Read-only statutory rule tables (payroll settings screen). */
  statutoryRulesView(companyId: string, financialYear?: string) {
    return this.statutoryRules.view(companyId, financialYear);
  }

  /** Approved / locked payroll earlier in the FY, grouped by employee (for TDS projection + ESI period). */
  private async priorPayrollByEmployee(companyId: string, year: number, month: number) {
    const months = priorMonthsInFy(year, month);
    const byEmp = new Map<string, PriorPayrollLine[]>();
    if (!months.length) return byEmp;
    const lines = await this.prisma.payrollLine.findMany({
      where: {
        companyId,
        payrollRun: {
          status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.LOCKED] },
          OR: months.map((m) => ({ year: m.year, month: m.month })),
        },
      },
      select: {
        employeeId: true,
        earningsJson: true,
        deductionsJson: true,
        grossEarnings: true,
        statutoryJson: true,
        payrollRun: { select: { year: true, month: true } },
      },
    });
    for (const l of lines) {
      const list = byEmp.get(l.employeeId) ?? [];
      list.push({
        year: l.payrollRun.year,
        month: l.payrollRun.month,
        earnings: Array.isArray(l.earningsJson) ? (l.earningsJson as PayItem[]) : [],
        deductions: Array.isArray(l.deductionsJson) ? (l.deductionsJson as PayItem[]) : [],
        grossEarnings: l.grossEarnings,
        statutory: (l.statutoryJson as PriorPayrollLine['statutory']) ?? null,
      });
      byEmp.set(l.employeeId, list);
    }
    return byEmp;
  }

  private isFinance(user: AuthUser) {
    const roles: string[] = [RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN];
    return user.roles.some((r) => roles.includes(r));
  }

  private async setting<T>(companyId: string, key: string, fallback: T): Promise<T> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    return (row?.value as T) ?? fallback;
  }

  async ensureDefaultComponents(companyId: string) {
    const defs: {
      code: string;
      name: string;
      type: SalaryComponentType;
      isStatutory?: boolean;
      sortOrder: number;
    }[] = [
      { code: 'BASIC', name: 'Basic', type: SalaryComponentType.EARNING, sortOrder: 1 },
      { code: 'HRA', name: 'HRA', type: SalaryComponentType.EARNING, sortOrder: 2 },
      { code: 'SPECIAL', name: 'Special Allowance', type: SalaryComponentType.EARNING, sortOrder: 3 },
      { code: 'INCENTIVE', name: 'Attendance Incentive', type: SalaryComponentType.EARNING, sortOrder: 4 },
      { code: 'REIMB', name: 'Reimbursement', type: SalaryComponentType.EARNING, sortOrder: 5 },
      { code: 'PF', name: 'PF Employee', type: SalaryComponentType.DEDUCTION, isStatutory: true, sortOrder: 10 },
      { code: 'PT', name: 'Professional Tax', type: SalaryComponentType.DEDUCTION, isStatutory: true, sortOrder: 11 },
      { code: 'ESD', name: 'Security Deposit', type: SalaryComponentType.DEDUCTION, sortOrder: 12 },
      { code: 'LOAN_EMI', name: 'Loan/Advance EMI', type: SalaryComponentType.DEDUCTION, sortOrder: 13 },
      { code: 'LOP', name: 'Loss of Pay', type: SalaryComponentType.DEDUCTION, sortOrder: 14 },
      { code: 'ASSET_DAMAGE', name: 'Asset Damage', type: SalaryComponentType.DEDUCTION, sortOrder: 15 },
    ];
    for (const d of defs) {
      await this.prisma.salaryComponent.upsert({
        where: { companyId_code: { companyId, code: d.code } },
        create: {
          companyId,
          code: d.code,
          name: d.name,
          type: d.type,
          isStatutory: d.isStatutory ?? false,
          sortOrder: d.sortOrder,
        },
        update: { name: d.name },
      });
    }
    return this.prisma.salaryComponent.findMany({
      where: { companyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  listComponents(companyId: string) {
    return this.ensureDefaultComponents(companyId);
  }

  async createComponent(user: AuthUser, dto: CreateComponentDto) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    return this.prisma.salaryComponent.create({
      data: {
        companyId: user.companyId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        isTaxable: dto.isTaxable ?? true,
        isStatutory: dto.isStatutory ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  listTemplates(companyId: string) {
    return this.prisma.salaryTemplate.findMany({
      where: { companyId },
      include: { lines: { include: { component: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createTemplate(user: AuthUser, dto: CreateTemplateDto) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    await this.ensureDefaultComponents(user.companyId);
    return this.prisma.salaryTemplate.create({
      data: {
        companyId: user.companyId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        grade: dto.grade,
        lines: {
          create: dto.lines.map((l) => ({
            componentId: l.componentId,
            amount: M.toDb(l.amount),
            percentOfBasic: l.percentOfBasic,
          })),
        },
      },
      include: { lines: { include: { component: true } } },
    });
  }

  async assignStructure(user: AuthUser, dto: AssignStructureDto) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: user.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const prev = await this.prisma.employeeSalaryStructure.findFirst({
      where: { employeeId: dto.employeeId, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const structure = await this.prisma.$transaction(async (tx) => {
      if (prev) {
        await tx.employeeSalaryStructure.update({
          where: { id: prev.id },
          data: { isActive: false },
        });
      }
      const created = await tx.employeeSalaryStructure.create({
        data: {
          companyId: user.companyId,
          employeeId: dto.employeeId,
          effectiveFrom: new Date(dto.effectiveFrom),
          ctcAnnual: M.toDb(dto.ctcAnnual),
          notes: dto.notes,
          lines: {
            create: dto.lines.map((l) => ({
              componentId: l.componentId,
              amount: M.toDb(l.amount),
            })),
          },
        },
        include: { lines: { include: { component: true } } },
      });
      await tx.salaryRevision.create({
        data: {
          companyId: user.companyId,
          employeeId: dto.employeeId,
          effectiveFrom: new Date(dto.effectiveFrom),
          previousCtc: prev?.ctcAnnual,
          newCtc: M.toDb(dto.ctcAnnual),
          reason: dto.reason ?? 'Structure assigned',
          createdBy: user.id,
          snapshot: created.lines.map((l) => ({
            code: l.component.code,
            amount: M.toNumber(l.amount),
          })) as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'EmployeeSalaryStructure',
      entityId: structure.id,
    });
    return structure;
  }

  async getStructure(user: AuthUser, employeeId: string) {
    const privileged: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN];
    const isPrivileged = user.roles.some((r) => privileged.includes(r as RoleCode));
    if (!isPrivileged && user.employeeId !== employeeId) {
      throw new ForbiddenException('You can only view your own salary structure');
    }
    return this.prisma.employeeSalaryStructure.findFirst({
      where: { companyId: user.companyId, employeeId, isActive: true },
      include: { lines: { include: { component: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  revisions(companyId: string, employeeId: string) {
    return this.prisma.salaryRevision.findMany({
      where: { companyId, employeeId },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  listRuns(companyId: string) {
    return this.prisma.payrollRun.findMany({
      where: { companyId },
      include: { _count: { select: { lines: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async getRun(companyId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, companyId },
      include: {
        lines: {
          include: {
            employee: {
              select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
            },
          },
          orderBy: { employeeId: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async generate(user: AuthUser, dto: GeneratePayrollDto) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    await this.ensureDefaultComponents(user.companyId);

    const existing = await this.prisma.payrollRun.findUnique({
      where: {
        companyId_year_month: {
          companyId: user.companyId,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (existing && ['APPROVED', 'LOCKED'].includes(existing.status)) {
      throw new BadRequestException('Payroll already approved/locked for this month');
    }

    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, isActive: true },
    });

    const from = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const to = new Date(Date.UTC(dto.year, dto.month, 0));
    const workingDaysApprox = to.getUTCDate();

    const esdEnabled = await this.setting(user.companyId, 'esd.enabled', false);
    const esdAmount = await this.setting(user.companyId, 'esd.monthly_amount', 0);
    const incentiveEnabled = await this.setting(user.companyId, 'incentive.enabled', true);
    const incentiveAmount = await this.setting(user.companyId, 'incentive.amount', 0);
    const maxLate = await this.setting(user.companyId, 'incentive.max_late_marks', 0);
    const incentiveRules: IncentiveRules = {
      enabled: incentiveEnabled,
      amount: incentiveAmount,
      maxLateMarks: maxLate,
      requireNoHalfDay: await this.setting(user.companyId, 'incentive.require_no_half_day', true),
      requireNoAbsent: await this.setting(user.companyId, 'incentive.require_no_absent', true),
      requireNoUlob: await this.setting(user.companyId, 'incentive.require_no_ulob', true),
    };

    // Statutory rule tables for the run's FY and what was already paid earlier in the FY.
    const { rules: statutoryRules } = await this.statutoryRules.getRulesForMonth(
      user.companyId,
      dto.year,
      dto.month,
    );
    const priorByEmp = await this.priorPayrollByEmployee(user.companyId, dto.year, dto.month);
    const esiPeriodMonths = priorMonthsInEsiPeriod(dto.year, dto.month);

    const run = await this.prisma.$transaction(async (tx) => {
      const payroll =
        existing ??
        (await tx.payrollRun.create({
          data: {
            companyId: user.companyId,
            year: dto.year,
            month: dto.month,
            status: PayrollRunStatus.DRAFT,
          },
        }));

      if (existing) {
        await tx.payrollLine.deleteMany({ where: { payrollRunId: payroll.id } });
      }

      for (const emp of employees) {
        const structure = await tx.employeeSalaryStructure.findFirst({
          where: { employeeId: emp.id, isActive: true },
          include: { lines: { include: { component: true } } },
        });

        const attendance = await tx.attendanceRecord.findMany({
          where: { employeeId: emp.id, date: { gte: from, lte: to } },
        });
        const fullPresentStatuses = ['P', 'PL', 'WFH', 'OD'];
        const presentDays = attendance.reduce((sum, a) => {
          if (fullPresentStatuses.includes(a.status)) return sum + 1;
          if (a.status === AttendanceDayStatus.HD) return sum + 0.5;
          return sum;
        }, 0);
        const lopStatuses: AttendanceDayStatus[] = [AttendanceDayStatus.A, AttendanceDayStatus.ULOB];
        const lopDays =
          attendance.filter((a) => lopStatuses.includes(a.status)).length +
          attendance.filter((a) => a.status === AttendanceDayStatus.HD).length * 0.5;

        // Every line item amount is rounded HALF_UP to 2dp when it is added; totals are
        // exact Decimal sums of those rounded lines, so gross − deductions = net to the paisa.
        const earnings: PayItem[] = [];
        const deductions: PayItem[] = [];
        const item = (code: string, name: string, amount: M.MoneyInput): PayItem => ({
          code,
          name,
          amount: M.toNumber(amount),
        });

        const payrollCfg = await tx.employeePayrollConfig.findUnique({
          where: { employeeId: emp.id },
        });

        const cfg = payrollCfg
          ? normalizePayrollConfig(payrollCfg.configJson as EmployeePayrollConfigJson)
          : null;
        if (payrollCfg && cfg) {
          // ESD comes from the employee config; PF / ESI / TDS / PT are computed below, once every
          // taxable earning (incentive) and LOP for the month is known.
          const esdThisMonth = calcEsdForMonth(cfg.deductions.esd).amount;
          if (esdThisMonth > 0) {
            deductions.push({ code: 'ESD', name: 'Security Deposit', amount: esdThisMonth });
          }
          for (const custom of cfg.deductions.custom ?? []) {
            if (M.money(custom.amount).greaterThan(0)) {
              deductions.push(item('CUSTOM', custom.name, custom.amount));
            }
          }
          const allowanceCodes: Record<string, { code: string; name: string; key: keyof typeof cfg.allowances }> = {
            basic: { code: 'BASIC', name: 'Basic', key: 'basic' },
            hra: { code: 'HRA', name: 'HRA', key: 'hra' },
            medical: { code: 'MEDICAL', name: 'Medical Allowance', key: 'medical' },
            travel: { code: 'TRAVEL', name: 'Travel Allowance', key: 'travel' },
            internet: { code: 'INTERNET', name: 'Internet Allowance', key: 'internet' },
            overtime: { code: 'OT', name: 'Overtime', key: 'overtime' },
            bonus: { code: 'BONUS', name: 'Bonus', key: 'bonus' },
            incentive: { code: 'INCENTIVE', name: 'Incentive', key: 'incentive' },
            special: { code: 'SPECIAL', name: 'Special Allowance', key: 'special' },
          };
          // Configured monthly gross is a salary line in its own right (allowances are added on
          // top), exactly as calcPayrollPreview shows it to HR. Previously it was never paid, so
          // gross-only employees got ~₹0 earnings.
          if (M.money(payrollCfg.grossMonthly).greaterThan(0)) {
            earnings.push(item('SALARY', 'Salary', M.round2(payrollCfg.grossMonthly)));
          }
          for (const meta of Object.values(allowanceCodes)) {
            const amt = cfg.allowances[meta.key];
            if (typeof amt === 'number' && amt > 0) {
              earnings.push(item(meta.code, meta.name, amt));
            }
          }
          for (const custom of cfg.allowances.custom ?? []) {
            if (M.money(custom.amount).greaterThan(0)) {
              earnings.push(item('CUSTOM_EARN', custom.name, custom.amount));
            }
          }
        } else if (structure) {
          for (const line of structure.lines) {
            const it = item(line.component.code, line.component.name, line.amount);
            if (line.component.type === SalaryComponentType.EARNING) earnings.push(it);
            else deductions.push(it);
          }
        } else {
          earnings.push(item('BASIC', 'Basic', 0));
        }

        // LOP deduction: lopBase × lopDays ÷ calendar days, rounded once. lopBase is Basic when
        // set, otherwise the configured gross salary line (same fallback as the PF wage).
        const basic = earnings.find((e) => e.code === 'BASIC')?.amount ?? 0;
        const lopBase = basic > 0 ? basic : (earnings.find((e) => e.code === 'SALARY')?.amount ?? 0);
        if (lopDays > 0 && lopBase > 0) {
          const lopAmt = calcProratedAmount(lopBase, lopDays, workingDaysApprox);
          deductions.push(item('LOP', 'Loss of Pay', lopAmt));
        }

        // Incentive: judged on this month's attendance (late marks, absences, half days, ULOB)
        // against every incentive.* rule — not the running late counter, which resets on
        // late→HD conversion and ignored absences entirely.
        if (isIncentiveEligible(tallyMonthAttendance(attendance), incentiveRules)) {
          earnings.push(item('INCENTIVE', 'Attendance Incentive', incentiveAmount));
        }

        // ESD (company default — skip when employee payroll config handles it)
        if (!payrollCfg && esdEnabled && esdAmount > 0) {
          deductions.push(item('ESD', 'Security Deposit', esdAmount));
        }

        // Loan EMI
        const loans = await tx.loanAdvance.findMany({
          where: {
            employeeId: emp.id,
            status: LoanAdvanceStatus.ACTIVE,
          },
          include: {
            emis: {
              where: { dueYear: dto.year, dueMonth: dto.month, paidAt: null },
            },
          },
        });
        const loanEmi = M.sum(loans.flatMap((loan) => loan.emis.map((emi) => emi.amount)));
        if (loanEmi.greaterThan(0)) {
          deductions.push(item('LOAN_EMI', 'Loan/Advance EMI', loanEmi));
        }

        const damages = await tx.assetDamageCharge.findMany({
          where: { employeeId: emp.id, status: DamageChargeStatus.PENDING },
        });
        const damageTotal = M.sumBy(damages, (d) => d.amount);
        if (damageTotal.greaterThan(0)) {
          deductions.push(item('ASSET_DAMAGE', 'Asset Damage', damageTotal));
        }

        // Approved reimbursements not yet paid
        const reimbursements = await tx.reimbursementClaim.findMany({
          where: {
            employeeId: emp.id,
            status: ReimbursementStatus.APPROVED,
            paidInPayrollId: null,
          },
        });
        const reimbTotal = M.sumBy(reimbursements, (r) => r.amount);
        if (reimbTotal.greaterThan(0)) {
          earnings.push(item('REIMB', 'Reimbursement', reimbTotal));
        }

        // Statutory deductions (PF / ESI / TDS / PT) for config-based employees. Each follows the
        // employee's toggle: off, manual fixed / percent override, or the statutory engine.
        let statutory: PayrollPreview | null = null;
        if (payrollCfg && cfg) {
          const lopAmount = M.sumBy(
            deductions.filter((d) => d.code === 'LOP'),
            (d) => d.amount,
          );
          const taxableEarnings = M.sumBy(
            earnings.filter((e) => e.code !== 'REIMB'),
            (e) => e.amount,
          );
          // Same base as the salary preview: configured gross + allowances (+ incentive) − LOP.
          const monthlyGross = M.nonNegative(
            // taxableEarnings already contains the SALARY (configured gross) line.
            M.sub(taxableEarnings, lopAmount),
          );
          const pfWage =
            basic > 0
              ? M.nonNegative(M.sub(basic, lopAmount))
              : M.nonNegative(M.sub(M.round2(payrollCfg.grossMonthly), lopAmount));
          const prior = summarizePriorPayroll(priorByEmp.get(emp.id) ?? [], esiPeriodMonths);
          statutory = calcPayrollPreview({
            grossMonthly: payrollCfg.grossMonthly,
            config: cfg,
            statutory: {
              rules: statutoryRules,
              year: dto.year,
              month: dto.month,
              taxRegime: emp.taxRegime,
              declaredDeductions: emp.oldRegimeDeclaredDeductions ?? 0,
              ptState: emp.ptState,
              gender: emp.gender,
              monthlyGross,
              pfWage,
              priorTaxableGross: prior.priorTaxableGross,
              priorTdsDeducted: prior.priorTdsDeducted,
              priorProfessionalTax: prior.priorProfessionalTax,
              esiPeriodEligible: prior.esiPeriodEligible,
            },
          });
          const statutoryItems: PayItem[] = [];
          if (statutory.pf > 0) statutoryItems.push(item('PF', 'Provident Fund', statutory.pf));
          if (statutory.esi > 0) statutoryItems.push(item('ESI', 'ESI (Employee)', statutory.esi));
          if (statutory.tds > 0) statutoryItems.push(item('TDS', 'TDS', statutory.tds));
          if (statutory.professionalTax > 0) {
            statutoryItems.push(item('PT', 'Professional Tax', statutory.professionalTax));
          }
          deductions.unshift(...statutoryItems);
        }

        const { gross, totalDeductions: ded, net } = calcPayslipTotals(earnings, deductions);

        await tx.payrollLine.create({
          data: {
            payrollRunId: payroll.id,
            companyId: user.companyId,
            employeeId: emp.id,
            earningsJson: earnings,
            deductionsJson: deductions,
            grossEarnings: M.toDb(gross),
            totalDeductions: M.toDb(ded),
            netPay: M.toDb(net),
            attendanceDays: presentDays,
            lopDays,
            employerPfEps: M.toDb(statutory?.employerPfEps ?? 0),
            employerPfEpf: M.toDb(statutory?.employerPfEpf ?? 0),
            employerEsi: M.toDb(statutory?.employerEsi ?? 0),
            statutoryJson: statutory
              ? (statutory.statutory as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
      }

      return tx.payrollRun.update({
        where: { id: payroll.id },
        data: {
          status: PayrollRunStatus.REVIEW,
          generatedAt: new Date(),
        },
      });
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'PayrollRun',
      entityId: run.id,
      metadata: { year: dto.year, month: dto.month },
    });

    return this.getRun(user.companyId, run.id);
  }

  async approve(user: AuthUser, runId: string) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    const run = await this.getRun(user.companyId, runId);
    if (run.status === PayrollRunStatus.LOCKED || run.status === PayrollRunStatus.APPROVED) {
      throw new BadRequestException('Already approved/locked');
    }

    const year = run.year;
    const month = run.month;
    const esdEnabled = await this.setting(user.companyId, 'esd.enabled', false);
    const esdAmount = await this.setting(user.companyId, 'esd.monthly_amount', 0);
    const interestRate = await this.setting(user.companyId, 'esd.interest_rate_annual', 0);

    await this.prisma.$transaction(async (tx) => {
      for (const line of run.lines) {
        const deductions = Array.isArray(line.deductionsJson)
          ? (line.deductionsJson as { code: string; amount: number }[])
          : [];
        const earnings = Array.isArray(line.earningsJson)
          ? (line.earningsJson as { code: string; amount: number }[])
          : [];

        // Mark loan EMIs paid + recoveries
        const loanEmi = deductions.find((d) => d.code === 'LOAN_EMI')?.amount ?? 0;
        if (loanEmi > 0) {
          const loans = await tx.loanAdvance.findMany({
            where: { employeeId: line.employeeId, status: LoanAdvanceStatus.ACTIVE },
            include: {
              emis: { where: { dueYear: year, dueMonth: month, paidAt: null } },
            },
          });
          for (const loan of loans) {
            let recovered = M.money(0);
            for (const emi of loan.emis) {
              await tx.loanEmiSchedule.update({
                where: { id: emi.id },
                data: { paidAt: new Date() },
              });
              recovered = recovered.plus(emi.amount);
            }
            if (recovered.greaterThan(0)) {
              const outstanding = M.toDb(M.nonNegative(M.sub(loan.outstanding, recovered)));
              await tx.loanAdvance.update({
                where: { id: loan.id },
                data: {
                  outstanding,
                  status: outstanding.lessThanOrEqualTo(0)
                    ? LoanAdvanceStatus.CLOSED
                    : LoanAdvanceStatus.ACTIVE,
                },
              });
              await tx.loanRecoveryEntry.create({
                data: {
                  loanAdvanceId: loan.id,
                  year,
                  month,
                  amount: M.toDb(recovered),
                  payrollRunId: run.id,
                  note: 'Auto payroll recovery',
                },
              });
            }
          }
        }

        // ESD deposit + simple monthly interest on balance
        if (esdEnabled && esdAmount > 0) {
          const last = await tx.esdLedgerEntry.findFirst({
            where: { employeeId: line.employeeId },
            orderBy: { createdAt: 'desc' },
          });
          const deposit = M.round2(esdAmount);
          let bal = M.money(last?.balanceAfter).plus(deposit);
          await tx.esdLedgerEntry.create({
            data: {
              companyId: user.companyId,
              employeeId: line.employeeId,
              entryType: EsdEntryType.DEPOSIT,
              amount: deposit,
              balanceAfter: M.toDb(bal),
              year,
              month,
              note: 'Monthly ESD via payroll',
              createdBy: user.id,
            },
          });
          if (interestRate > 0 && bal.greaterThan(0)) {
            // Monthly interest = balance × annual% ÷ 12, rounded HALF_UP to 2dp.
            const interest = M.round2(M.div(M.percentOf(bal, interestRate), 12));
            if (interest.greaterThan(0)) {
              bal = bal.plus(interest);
              await tx.esdLedgerEntry.create({
                data: {
                  companyId: user.companyId,
                  employeeId: line.employeeId,
                  entryType: EsdEntryType.INTEREST,
                  amount: interest,
                  balanceAfter: M.toDb(bal),
                  year,
                  month,
                  note: 'Monthly compounded interest',
                  createdBy: user.id,
                },
              });
            }
          }
        }

        // Mark reimbursements paid
        const reimb = earnings.find((e) => e.code === 'REIMB')?.amount ?? 0;
        if (reimb > 0) {
          await tx.reimbursementClaim.updateMany({
            where: {
              employeeId: line.employeeId,
              status: ReimbursementStatus.APPROVED,
              paidInPayrollId: null,
            },
            data: {
              status: ReimbursementStatus.PAID,
              paidInPayrollId: run.id,
            },
          });
        }

        const assetDmg = deductions.find((d) => d.code === 'ASSET_DAMAGE')?.amount ?? 0;
        if (assetDmg > 0) {
          await tx.assetDamageCharge.updateMany({
            where: { employeeId: line.employeeId, status: DamageChargeStatus.PENDING },
            data: { status: DamageChargeStatus.DEDUCTED, payrollRunId: run.id },
          });
        }
      }

      await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollRunStatus.LOCKED,
          approvedAt: new Date(),
          approvedBy: user.id,
        },
      });
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'PayrollRun',
      entityId: runId,
      metadata: { event: 'approved_locked' },
    });

    return this.getRun(user.companyId, runId);
  }

  async myPayslips(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    return this.prisma.payrollLine.findMany({
      where: {
        employeeId: user.employeeId,
        payrollRun: { status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.LOCKED] } },
      },
      include: { payrollRun: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myPayslip(user: AuthUser, lineId: string) {
    if (!user.employeeId) throw new ForbiddenException();
    const line = await this.prisma.payrollLine.findFirst({
      where: {
        id: lineId,
        employeeId: user.employeeId,
        payrollRun: { status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.LOCKED] } },
      },
      include: {
        payrollRun: true,
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    });
    if (!line) throw new NotFoundException('Payslip not found');
    return line;
  }

  async markPaid(actor: AuthUser, lineId: string) {
    if (!this.isFinance(actor)) throw new ForbiddenException();
    const line = await this.prisma.payrollLine.findFirst({
      where: { id: lineId, companyId: actor.companyId },
      include: { payrollRun: true },
    });
    if (!line) throw new NotFoundException('Payroll line not found');
    if (!['APPROVED', 'LOCKED'].includes(line.payrollRun.status)) {
      throw new BadRequestException('Payroll run must be approved/locked before marking paid');
    }
    if (line.paidAt) throw new BadRequestException('Already marked as paid');

    const updated = await this.prisma.payrollLine.update({
      where: { id: lineId },
      data: {
        paidAt: new Date(),
        paidAmount: line.netPay,
        paidBy: actor.id,
      },
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'PayrollLine',
      entityId: lineId,
      metadata: { event: 'marked_paid', amount: M.toNumber(line.netPay) },
    });

    return updated;
  }

  // ---- ESD ----
  async esdBalance(companyId: string, employeeId: string) {
    const last = await this.prisma.esdLedgerEntry.findFirst({
      where: { companyId, employeeId },
      orderBy: { createdAt: 'desc' },
    });
    const ledger = await this.prisma.esdLedgerEntry.findMany({
      where: { companyId, employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { balance: last?.balanceAfter ?? 0, ledger };
  }

  async esdSheet(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
      orderBy: { employeeCode: 'asc' },
    });
    const rows = [];
    for (const e of employees) {
      const last = await this.prisma.esdLedgerEntry.findFirst({
        where: { employeeId: e.id },
        orderBy: { createdAt: 'desc' },
      });
      rows.push({ employee: e, balance: last?.balanceAfter ?? 0 });
    }
    return rows;
  }

  // ---- Loans ----
  async requestLoan(user: AuthUser, dto: RequestLoanDto) {
    if (!user.employeeId) throw new ForbiddenException();
    const rate = dto.interestRate ?? 0;
    const principal = M.toDb(dto.amount);
    const n = dto.tenureMonths;
    const emi = M.toDb(calcEmi(principal, rate, n));

    const loan = await this.prisma.loanAdvance.create({
      data: {
        companyId: user.companyId,
        employeeId: user.employeeId,
        type: dto.type,
        amount: principal,
        interestRate: rate,
        tenureMonths: n,
        emiAmount: emi,
        outstanding: principal,
        reason: dto.reason,
        status: LoanAdvanceStatus.PENDING,
      },
    });

    try {
      await this.workflow.startInstance({
        companyId: user.companyId,
        type: dto.type === LoanAdvanceType.LOAN ? WorkflowType.LOAN : WorkflowType.ADVANCE,
        entityType: 'LoanAdvance',
        entityId: loan.id,
        requesterId: user.employeeId,
        summary: `${dto.type} ${M.toFixed2(principal)}`,
      });
    } catch {
      // non-fatal
    }

    return loan;
  }

  myLoans(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException();
    return this.prisma.loanAdvance.findMany({
      where: { employeeId: user.employeeId },
      include: { emis: { orderBy: { installmentNo: 'asc' } }, recoveries: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  loanQueue(companyId: string) {
    return this.prisma.loanAdvance.findMany({
      where: { companyId, status: LoanAdvanceStatus.PENDING },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async reviewLoan(user: AuthUser, id: string, dto: ReviewLoanDto) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    const loan = await this.prisma.loanAdvance.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!loan) throw new NotFoundException();
    if (loan.status !== LoanAdvanceStatus.PENDING) {
      throw new BadRequestException('Not pending');
    }

    if (dto.status === 'REJECTED') {
      const rejected = await this.prisma.loanAdvance.update({
        where: { id },
        data: {
          status: LoanAdvanceStatus.REJECTED,
          approvedBy: user.id,
          approvedAt: new Date(),
        },
      });
      await this.workflow.syncFromLegacy({
        companyId: user.companyId,
        entityType: 'LoanAdvance',
        entityId: id,
        action: 'REJECT',
        actorId: user.id,
      });
      return rejected;
    }

    const now = new Date();
    // Interest-free loans: last installment absorbs the paise remainder so the loan closes at 0.
    const emis = buildEmiAmounts({
      principal: loan.amount,
      emiAmount: loan.emiAmount,
      tenureMonths: loan.tenureMonths,
      interestRate: loan.interestRate,
    }).map((amount, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return {
        installmentNo: i + 1,
        dueYear: d.getFullYear(),
        dueMonth: d.getMonth() + 1,
        amount,
      };
    });

    const activated = await this.prisma.loanAdvance.update({
      where: { id },
      data: {
        status: LoanAdvanceStatus.ACTIVE,
        approvedBy: user.id,
        approvedAt: now,
        startedAt: now,
        emis: { create: emis },
      },
      include: { emis: true },
    });
    await this.workflow.syncFromLegacy({
      companyId: user.companyId,
      entityType: 'LoanAdvance',
      entityId: id,
      action: 'APPROVE',
      actorId: user.id,
    });
    return activated;
  }

  loanSheet(companyId: string) {
    return this.prisma.loanAdvance.findMany({
      where: { companyId, status: { in: [LoanAdvanceStatus.ACTIVE, LoanAdvanceStatus.CLOSED] } },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Reimbursements ----
  async submitReimbursement(user: AuthUser, dto: SubmitReimbursementDto) {
    if (!user.employeeId) throw new ForbiddenException();
    const allowed = ['Travel', 'Petrol', 'Internet', 'Mobile', 'Medical', 'Food', 'Other'];
    if (!allowed.includes(dto.category)) {
      throw new BadRequestException(`Category must be one of: ${allowed.join(', ')}`);
    }
    const claim = await this.prisma.reimbursementClaim.create({
      data: {
        companyId: user.companyId,
        employeeId: user.employeeId,
        category: dto.category,
        amount: M.toDb(dto.amount),
        description: dto.description,
        receiptUrl: dto.receiptUrl,
      },
    });
    try {
      await this.workflow.startInstance({
        companyId: user.companyId,
        type: WorkflowType.EXPENSE,
        entityType: 'ReimbursementClaim',
        entityId: claim.id,
        requesterId: user.employeeId,
        summary: `${dto.category} ${M.toFixed2(dto.amount)}`,
      });
    } catch {
      // non-fatal
    }
    return claim;
  }

  myReimbursements(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException();
    return this.prisma.reimbursementClaim.findMany({
      where: { employeeId: user.employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  reimbursementQueue(companyId: string) {
    return this.prisma.reimbursementClaim.findMany({
      where: {
        companyId,
        status: { in: [ReimbursementStatus.PENDING, ReimbursementStatus.APPROVED] },
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async reviewReimbursement(user: AuthUser, id: string, dto: ReviewReimbursementDto) {
    const isCeo = user.roles.includes(RoleCode.SUPER_ADMIN);
    const isHr = user.roles.includes(RoleCode.HR) || isCeo;
    if (!isHr && !isCeo) throw new ForbiddenException();

    const claim = await this.prisma.reimbursementClaim.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!claim) throw new NotFoundException();

    if (dto.status === ReimbursementStatus.REJECTED) {
      const rejected = await this.prisma.reimbursementClaim.update({
        where: { id },
        data: {
          status: ReimbursementStatus.REJECTED,
          rejectReason: dto.rejectReason,
        },
      });
      await this.workflow.syncFromLegacy({
        companyId: user.companyId,
        entityType: 'ReimbursementClaim',
        entityId: id,
        action: 'REJECT',
        actorId: user.id,
        comment: dto.rejectReason,
      });
      return rejected;
    }

    // Dual approval: HR then CEO (CEO can do both)
    const data: Prisma.ReimbursementClaimUpdateInput = {};
    if (isHr && !claim.hrApprovedAt) {
      data.hrApprovedAt = new Date();
      data.hrApprovedBy = user.id;
    }
    if (isCeo) {
      data.ceoApprovedAt = new Date();
      data.ceoApprovedBy = user.id;
      if (!claim.hrApprovedAt) {
        data.hrApprovedAt = new Date();
        data.hrApprovedBy = user.id;
      }
    }

    const next = await this.prisma.reimbursementClaim.update({
      where: { id },
      data,
    });

    const fullyApproved = next.hrApprovedAt && next.ceoApprovedAt;
    if (fullyApproved && next.status === ReimbursementStatus.PENDING) {
      const approved = await this.prisma.reimbursementClaim.update({
        where: { id },
        data: { status: ReimbursementStatus.APPROVED },
      });
      await this.workflow.syncFromLegacy({
        companyId: user.companyId,
        entityType: 'ReimbursementClaim',
        entityId: id,
        action: 'APPROVE',
        actorId: user.id,
      });
      // Extra sync for second step if still pending in engine
      await this.workflow.syncFromLegacy({
        companyId: user.companyId,
        entityType: 'ReimbursementClaim',
        entityId: id,
        action: 'APPROVE',
        actorId: user.id,
      });
      return approved;
    }

    await this.workflow.syncFromLegacy({
      companyId: user.companyId,
      entityType: 'ReimbursementClaim',
      entityId: id,
      action: 'APPROVE',
      actorId: user.id,
    });
    return next;
  }
}
