import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, PayrollRunStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../auth/decorators/current-user.decorator';
import { AuditService } from '../../audit/audit.service';
import { ExportFile, buildExport } from '../../common/export.engine';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ExportLine,
  ExportValidation,
  TDS_EXPORT_NOTE,
  buildBankRows,
  buildEcrFile,
  buildEsiRows,
  buildTdsRows,
  fyMonths,
  parseFinancialYear,
  validateExportLines,
} from './statutory-exports';

const LINE_INCLUDE = {
  employee: {
    select: {
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      displayName: true,
      taxRegime: true,
      oldRegimeDeclaredDeductions: true,
      government: { select: { panNumber: true, uan: true, esicNumber: true } },
      bank: { select: { accountNumber: true, ifsc: true } },
    },
  },
  payrollRun: { select: { year: true, month: true } },
} satisfies Prisma.PayrollLineInclude;

type LineRow = Prisma.PayrollLineGetPayload<{ include: typeof LINE_INCLUDE }>;

const items = (v: unknown) =>
  (Array.isArray(v) ? v : []).map((i: { code?: string; amount?: number }) => ({
    code: String(i?.code ?? ''),
    amount: Number(i?.amount ?? 0),
  }));

export function toExportLine(l: LineRow): ExportLine {
  const e = l.employee;
  const name =
    e.displayName?.trim() ||
    [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ').trim() ||
    e.employeeCode;
  return {
    employeeCode: e.employeeCode,
    name,
    uan: e.government?.uan,
    esicNumber: e.government?.esicNumber,
    pan: e.government?.panNumber,
    bankAccount: e.bank?.accountNumber,
    ifsc: e.bank?.ifsc,
    regime: e.taxRegime,
    declaredDeductions: e.oldRegimeDeclaredDeductions,
    year: l.payrollRun.year,
    month: l.payrollRun.month,
    lopDays: l.lopDays,
    gross: l.grossEarnings,
    net: l.netPay,
    earnings: items(l.earningsJson),
    deductions: items(l.deductionsJson),
    employerPfEps: l.employerPfEps,
    employerPfEpf: l.employerPfEpf,
    employerEsi: l.employerEsi,
    statutory: (l.statutoryJson as ExportLine['statutory']) ?? null,
  };
}

const EXPORTABLE: PayrollRunStatus[] = [PayrollRunStatus.APPROVED, PayrollRunStatus.LOCKED];

export type EcrExport = ExportFile & { missingUan: number; skippedNoPf: number; included: number };

@Injectable()
export class PayrollExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async loadRun(companyId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, companyId },
      include: { lines: { include: LINE_INCLUDE, orderBy: { employee: { employeeCode: 'asc' } } } },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (!EXPORTABLE.includes(run.status)) {
      throw new BadRequestException('Exports are available only for APPROVED or LOCKED payroll runs');
    }
    return { run, lines: run.lines.map(toExportLine) };
  }

  private async record(user: AuthUser, entityId: string | null, kind: string, meta: object) {
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.OTHER,
      entityType: 'PayrollExport',
      entityId,
      metadata: { kind, ...meta } as Prisma.InputJsonValue,
    });
  }

  private tag(run: { year: number; month: number }) {
    return `${run.year}-${String(run.month).padStart(2, '0')}`;
  }

  async validation(user: AuthUser, id: string): Promise<ExportValidation> {
    const { lines } = await this.loadRun(user.companyId, id);
    return validateExportLines(lines);
  }

  async pfEcr(user: AuthUser, id: string): Promise<EcrExport> {
    const { run, lines } = await this.loadRun(user.companyId, id);
    const ecr = buildEcrFile(lines);
    await this.record(user, run.id, 'PF_ECR', {
      period: this.tag(run),
      rows: ecr.included,
      missingUan: ecr.missingUan.length,
    });
    return {
      filename: `pf_ecr_${this.tag(run)}.txt`,
      content: ecr.content,
      contentType: 'text/plain; charset=utf-8',
      missingUan: ecr.missingUan.length,
      skippedNoPf: ecr.skippedNoPf,
      included: ecr.included,
    };
  }

  async esiSheet(user: AuthUser, id: string): Promise<ExportFile> {
    const { run, lines } = await this.loadRun(user.companyId, id);
    const rows = buildEsiRows(lines);
    await this.record(user, run.id, 'ESI_SHEET', { period: this.tag(run), rows: rows.length });
    const file = await buildExport('excel', `ESI contribution ${this.tag(run)}`, rows);
    return file;
  }

  async bankCsv(user: AuthUser, id: string): Promise<ExportFile> {
    const { run, lines } = await this.loadRun(user.companyId, id);
    const rows = buildBankRows(lines, run.year, run.month);
    await this.record(user, run.id, 'BANK_TRANSFER', { period: this.tag(run), rows: rows.length });
    return buildExport('csv', `Bank transfer ${this.tag(run)}`, rows);
  }

  async tds(user: AuthUser, fy: string, format: 'csv' | 'excel'): Promise<ExportFile> {
    const start = parseFinancialYear(fy);
    if (start == null) throw new BadRequestException('fy must look like 2026-27');
    const months = fyMonths(start);
    const rows = await this.prisma.payrollLine.findMany({
      where: {
        companyId: user.companyId,
        payrollRun: {
          status: { in: EXPORTABLE },
          OR: months.map((m) => ({ year: m.year, month: m.month })),
        },
      },
      include: LINE_INCLUDE,
    });
    const data = buildTdsRows(rows.map(toExportLine), fy);
    await this.record(user, null, 'TDS_FORM16_DATA', { fy, rows: data.length, note: TDS_EXPORT_NOTE });
    return buildExport(format, `TDS Form16 24Q data FY ${fy}`, data);
  }
}
