import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReportsService } from '../reports/reports.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { buildExport } from '../common/export.engine';

const TEMPLATES: Record<string, string[]> = {
  employees: ['employeeCode', 'firstName', 'lastName', 'email', 'department', 'designation'],
  attendance: ['employeeCode', 'date', 'status'],
  leave: ['employeeCode', 'leaveType', 'fromDate', 'toDate', 'days'],
  payroll: ['employeeCode', 'year', 'month', 'gross', 'net'],
  departments: ['department'],
  designations: ['designation'],
};

@Injectable()
export class DataExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: ReportsService,
  ) {}

  template(entity: string) {
    const cols = TEMPLATES[entity];
    if (!cols) throw new BadRequestException('Unknown template');
    return {
      entity,
      columns: cols,
      csv: `${cols.join(',')}\n`,
      filename: `${entity}-template.csv`,
    };
  }

  async listJobs(user: AuthUser) {
    const [imports, exports] = await Promise.all([
      this.prisma.importJob.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      this.prisma.exportJob.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);
    return { imports, exports };
  }

  async importCsv(
    user: AuthUser,
    entity: string,
    fileName: string,
    csv: string,
    opts: { dryRun?: boolean; mapping?: Record<string, string> },
  ) {
    this.assertImport(user, entity);
    const cols = TEMPLATES[entity];
    if (!cols) throw new BadRequestException('Unknown entity');
    const rows = this.parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const seen = new Set<string>();
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped: Record<string, string> = {};
      for (const col of cols) {
        const src = opts.mapping?.[col] ?? col;
        mapped[col] = (raw[src] ?? '').trim();
      }
      const key = mapped.employeeCode || mapped.department || mapped.designation || `row-${i}`;
      if (seen.has(key) && key) {
        errors.push({ row: i + 2, message: `Duplicate ${key}` });
        continue;
      }
      seen.add(key);
      if (entity === 'employees' && !mapped.employeeCode) {
        errors.push({ row: i + 2, message: 'employeeCode required' });
        continue;
      }
      success++;
      if (!opts.dryRun && entity === 'employees' && mapped.employeeCode) {
        const existing = await this.prisma.employee.findFirst({
          where: { companyId: user.companyId, employeeCode: mapped.employeeCode },
        });
        if (!existing) {
          await this.prisma.employee.create({
            data: {
              companyId: user.companyId,
              employeeCode: mapped.employeeCode,
              firstName: mapped.firstName || mapped.employeeCode,
              lastName: mapped.lastName || '',
              email: mapped.email || null,
              department: mapped.department || null,
              designation: mapped.designation || null,
              isActive: true,
            },
          });
        }
      }
    }

    const job = await this.prisma.importJob.create({
      data: {
        companyId: user.companyId,
        entity,
        fileName,
        status: errors.length && success === 0 ? 'FAILED' : 'COMPLETED',
        dryRun: Boolean(opts.dryRun),
        totalRows: rows.length,
        successRows: success,
        errorRows: errors.length,
        mappingJson: opts.mapping ?? {},
        errorReport: errors,
        createdBy: user.id,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'ImportJob',
      entityId: job.id,
      metadata: { entity, dryRun: Boolean(opts.dryRun) },
    });
    return job;
  }

  async exportData(
    user: AuthUser,
    entity: string,
    format: 'CSV' | 'XLSX' | 'PDF',
    filters: { year?: number; month?: number },
  ) {
    this.assertExport(user);
    const kindMap: Record<string, string> = {
      employees: 'employee',
      departments: 'department',
      designations: 'employee',
      attendance: 'attendance',
      leave: 'leave',
      payroll: 'payroll',
    };
    const kind = kindMap[entity] ?? entity;
    const report = await this.reports.resolveReport(user.companyId, kind, filters);
    const fmt = format === 'XLSX' ? 'excel' : format === 'PDF' ? 'pdf' : 'csv';
    const built = await buildExport(fmt, report.title, report.rows);
    const job = await this.prisma.exportJob.create({
      data: {
        companyId: user.companyId,
        entity,
        format,
        status: 'COMPLETED',
        filtersJson: filters,
        fileName: built.filename,
        createdBy: user.id,
        finishedAt: new Date(),
      },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.OTHER,
      entityType: 'ExportJob',
      entityId: job.id,
      metadata: { entity, format },
    });
    return { job, file: built };
  }

  jobStatus(user: AuthUser, id: string) {
    return this.prisma.importJob.findFirst({ where: { id, companyId: user.companyId } });
  }

  private assertImport(user: AuthUser, entity: string) {
    if (user.roles.includes(RoleCode.SUPER_ADMIN) || user.roles.includes(RoleCode.ADMIN)) return;
    if (user.roles.includes(RoleCode.HR) && ['employees', 'attendance', 'leave'].includes(entity)) return;
    throw new ForbiddenException();
  }

  private assertExport(user: AuthUser) {
    if (user.roles.includes(RoleCode.EMPLOYEE) && !user.roles.some((r) => r !== RoleCode.EMPLOYEE)) {
      return;
    }
    if (user.roles.includes(RoleCode.SUPER_ADMIN) || user.roles.includes(RoleCode.ADMIN) || user.roles.includes(RoleCode.HR)) {
      return;
    }
    throw new ForbiddenException();
  }

  private parseCsv(csv: string) {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] ?? '';
      });
      return row;
    });
  }
}
