import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction, PayrollRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthUser } from '../../auth/decorators/current-user.decorator';
import { financialYearOf, financialYearStart } from '../statutory';
import * as M from '../../common/money';

export type OpeningRowInput = { employeeCode: string; taxableGross: unknown; tdsDeducted: unknown; professionalTax?: unknown };

const FY_RE = /^(20\d{2})-(\d{2})$/;
const MAX = 100_000_000;

function amount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) && n >= 0 && n <= MAX ? Math.round(n * 100) / 100 : null;
}

/**
 * Opening balances for a mid-year go-live: salary paid and TDS/PT deducted earlier in the FY
 * outside this system (or by a previous employer). Figures come from source records; the system
 * only adds them to its own history when projecting TDS.
 */
@Injectable()
export class TaxOpeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertFy(fy: string) {
    const m = FY_RE.exec(fy ?? '');
    if (!m || (Number(m[1]) + 1) % 100 !== Number(m[2])) throw new BadRequestException('financialYear must look like 2026-27.');
  }

  async list(user: AuthUser, financialYear?: string) {
    const now = new Date();
    const fy = financialYear || financialYearOf(now.getFullYear(), now.getMonth() + 1);
    this.assertFy(fy);
    const rows = await this.prisma.employeeTaxOpeningBalance.findMany({
      where: { companyId: user.companyId, financialYear: fy },
      include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { employee: { employeeCode: 'asc' } },
    });
    return {
      financialYear: fy,
      rows: rows.map((r) => ({
        id: r.id,
        employeeCode: r.employee.employeeCode,
        name: [r.employee.firstName, r.employee.lastName].filter(Boolean).join(' '),
        taxableGross: M.toNumber(r.taxableGross),
        tdsDeducted: M.toNumber(r.tdsDeducted),
        professionalTax: M.toNumber(r.professionalTax),
        source: r.source,
        updatedAt: r.updatedAt,
      })),
    };
  }

  /** All-or-nothing upsert by Employee ID. `dryRun` validates without saving. */
  async save(user: AuthUser, body: { financialYear: string; source: string; rows: OpeningRowInput[]; dryRun?: boolean }) {
    const fy = String(body?.financialYear ?? '').trim();
    this.assertFy(fy);
    const source = String(body?.source ?? '').trim();
    if (source.length < 3) throw new BadRequestException('Describe the source of the figures (e.g. "Apr–Nov 2026 old payroll, CA-verified").');
    const input = Array.isArray(body?.rows) ? body.rows : [];
    if (!input.length || input.length > 5000) throw new BadRequestException('Provide 1–5000 rows.');

    const codes = input.map((r) => String(r?.employeeCode ?? '').trim());
    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, employeeCode: { in: codes.filter(Boolean) } },
      select: { id: true, employeeCode: true },
    });
    const byCode = new Map(employees.map((e) => [e.employeeCode, e.id]));
    const seen = new Set<string>();
    const errors: { row: number; employeeCode: string; message: string }[] = [];
    const valid: { employeeId: string; taxableGross: number; tdsDeducted: number; professionalTax: number }[] = [];
    input.forEach((r, i) => {
      const code = codes[i];
      const row = i + 1;
      if (!code) return errors.push({ row, employeeCode: '', message: 'Employee ID is required' });
      if (seen.has(code)) return errors.push({ row, employeeCode: code, message: 'duplicate Employee ID in this list' });
      seen.add(code);
      const employeeId = byCode.get(code);
      if (!employeeId) return errors.push({ row, employeeCode: code, message: 'no employee with this Employee ID' });
      const taxableGross = amount(r.taxableGross);
      const tdsDeducted = amount(r.tdsDeducted);
      const professionalTax = amount(r.professionalTax);
      if (taxableGross === null) return errors.push({ row, employeeCode: code, message: 'taxable gross must be a non-negative amount' });
      if (tdsDeducted === null) return errors.push({ row, employeeCode: code, message: 'TDS must be a non-negative amount' });
      if (professionalTax === null) return errors.push({ row, employeeCode: code, message: 'professional tax must be a non-negative amount' });
      if (tdsDeducted > taxableGross) return errors.push({ row, employeeCode: code, message: 'TDS cannot exceed taxable gross' });
      valid.push({ employeeId, taxableGross, tdsDeducted, professionalTax });
    });

    // Months already processed in this system for this FY are counted from payslips; warn so the
    // opening balance covers only the months BEFORE the system went live.
    const fyStart = financialYearStart(fy);
    const processedRuns = await this.prisma.payrollRun.count({
      where: {
        companyId: user.companyId,
        status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.LOCKED] },
        OR: [{ year: fyStart, month: { gte: 4 } }, { year: fyStart + 1, month: { lte: 3 } }],
      },
    });
    const summary = { financialYear: fy, rows: input.length, valid: valid.length, errors: errors.length, approvedRunsThisFy: processedRuns };
    if (errors.length || body.dryRun) return { saved: false, summary, errors };

    await this.prisma.$transaction(
      valid.map((v) =>
        this.prisma.employeeTaxOpeningBalance.upsert({
          where: { employeeId_financialYear: { employeeId: v.employeeId, financialYear: fy } },
          create: { companyId: user.companyId, financialYear: fy, source: source.slice(0, 300), enteredBy: user.id, ...v },
          update: { source: source.slice(0, 300), enteredBy: user.id, taxableGross: v.taxableGross, tdsDeducted: v.tdsDeducted, professionalTax: v.professionalTax },
        }),
      ),
    );
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'EmployeeTaxOpeningBalance',
      metadata: { event: 'tax_opening_balances_saved', financialYear: fy, rows: valid.length, source: source.slice(0, 300) },
    });
    return { saved: true, summary, errors: [] };
  }

  async remove(user: AuthUser, id: string) {
    const row = await this.prisma.employeeTaxOpeningBalance.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new BadRequestException('Opening balance not found.');
    await this.prisma.employeeTaxOpeningBalance.delete({ where: { id } });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.DELETE,
      entityType: 'EmployeeTaxOpeningBalance',
      entityId: id,
      metadata: { event: 'tax_opening_balance_deleted', financialYear: row.financialYear },
    });
    return { ok: true };
  }
}
