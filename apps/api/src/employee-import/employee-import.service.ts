import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, RoleCode } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { EmployeesService } from '../employees/employees.service';
import { EmployeePayrollService } from '../employees/employee-payroll.service';
import {
  CheckedRow,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  buildTemplate,
  parseEmployeeFile,
  validateRow,
} from './employee-import.parser';

const ENTITY = 'employees-master';
const PREVIEW_VALID_HOURS = 24;
const BACKUP_MAX_AGE_HOURS = 24;

type UploadedFile = { originalname: string; size: number; buffer: Buffer };

/**
 * Secure employee master import:
 *  1. preview  (Super Admin / Admin / HR): parse + validate + duplicate checks, nothing written
 *     except an ImportJob audit record (counts, file checksum, row-level error codes – no PII).
 *  2. commit   (Super Admin only): same file (checksum must match the preview), zero errors,
 *     a confirmed recent backup, then employees are created through the normal EmployeesService
 *     path. Existing Employee IDs are never overwritten; re-importing the same file is safe.
 */
@Injectable()
export class EmployeeImportService {
  private readonly logger = new Logger(EmployeeImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly payroll: EmployeePayrollService,
  ) {}

  template() {
    return buildTemplate();
  }

  private assertFile(file?: UploadedFile): UploadedFile {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the employee Excel (.xlsx) or .csv file.');
    if (file.size > IMPORT_MAX_BYTES) throw new BadRequestException('File is larger than 5 MB.');
    return file;
  }

  private sha256(buf: Buffer) {
    return createHash('sha256').update(buf).digest('hex');
  }

  /** Parse + validate + check duplicates within the file and against existing records. */
  async analyse(companyId: string, file: UploadedFile) {
    let parsed;
    try {
      parsed = await parseEmployeeFile(file.originalname, file.buffer);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Could not read the file.');
    }
    if (parsed.missingColumns.length) {
      throw new BadRequestException(`Missing required column(s): ${parsed.missingColumns.join(', ')}. Download the template for the expected headers.`);
    }
    if (parsed.rows.length === 0) throw new BadRequestException('The file has no employee rows.');
    if (parsed.rows.length > IMPORT_MAX_ROWS) throw new BadRequestException(`At most ${IMPORT_MAX_ROWS} rows per file.`);

    const rows: CheckedRow[] = parsed.rows.map((r) => validateRow(r.rowNumber, r.values));

    // Duplicates inside the file.
    const seen = { code: new Map<string, number>(), mobile: new Map<string, number>(), email: new Map<string, number>() };
    for (const r of rows) {
      if (!r.data) continue;
      const keys: [keyof typeof seen, string, string][] = [
        ['code', r.data.employeeCode.toLowerCase(), 'Employee ID'],
        ['mobile', r.data.mobile, 'Mobile Number'],
        ['email', r.data.email, 'Email'],
      ];
      for (const [k, val, label] of keys) {
        const prev = seen[k].get(val);
        if (prev) r.errors.push({ field: label, message: `duplicate of row ${prev} in this file` });
        else seen[k].set(val, r.rowNumber);
      }
      if (r.errors.length) r.status = 'error';
    }

    // Existing records (Employee ID exists → skipped; mobile/email owned by another employee → error).
    const ready = rows.filter((r) => r.data);
    const existing = await this.prisma.employee.findMany({
      where: {
        companyId,
        OR: [
          { employeeCode: { in: ready.map((r) => r.data!.employeeCode), mode: 'insensitive' } },
          { mobile: { in: ready.map((r) => r.data!.mobile) } },
          { email: { in: ready.map((r) => r.data!.email), mode: 'insensitive' } },
        ],
      },
      select: { employeeCode: true, mobile: true, email: true },
    });
    const byCode = new Map(existing.map((e) => [e.employeeCode.toLowerCase(), e]));
    for (const r of ready) {
      const d = r.data!;
      const same = byCode.get(d.employeeCode.toLowerCase());
      if (same) {
        if (r.status !== 'error') {
          r.status = 'exists';
          r.errors.push({ field: 'Employee ID', message: 'already exists – skipped, existing record is not changed' });
        }
        continue;
      }
      const mobileOwner = existing.find((e) => e.mobile === d.mobile);
      if (mobileOwner) r.errors.push({ field: 'Mobile Number', message: `already registered to employee ${mobileOwner.employeeCode}` });
      const emailOwner = existing.find((e) => e.email?.toLowerCase() === d.email);
      if (emailOwner) r.errors.push({ field: 'Email', message: `already registered to employee ${emailOwner.employeeCode}` });
      if (r.errors.length) r.status = 'error';
    }

    const summary = {
      totalRows: rows.length,
      ready: rows.filter((r) => r.status === 'ready').length,
      existing: rows.filter((r) => r.status === 'exists').length,
      errors: rows.filter((r) => r.status === 'error').length,
    };
    return { parsed, rows, summary };
  }

  async preview(actor: AuthUser, upload?: UploadedFile) {
    const file = this.assertFile(upload);
    const { parsed, rows, summary } = await this.analyse(actor.companyId, file);
    const sha256 = this.sha256(file.buffer);
    const job = await this.prisma.importJob.create({
      data: {
        companyId: actor.companyId,
        entity: ENTITY,
        fileName: file.originalname.slice(0, 200),
        status: 'PREVIEWED',
        dryRun: true,
        totalRows: summary.totalRows,
        successRows: summary.ready,
        errorRows: summary.errors,
        mappingJson: { sha256, columns: parsed.mapping, unknownColumns: parsed.unknownColumns },
        // Row numbers, field names and reasons only — no names, numbers or emails.
        errorReport: rows.filter((r) => r.errors.length).map((r) => ({ row: r.rowNumber, status: r.status, errors: r.errors.map((e) => `${e.field}: ${e.message}`) })),
        createdBy: actor.id,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.CREATE,
      entityType: 'ImportJob',
      entityId: job.id,
      metadata: { event: 'employee_import_preview', sha256, ...summary },
    });
    return {
      jobId: job.id,
      fileSha256: sha256,
      summary,
      columns: parsed.mapping,
      unknownColumns: parsed.unknownColumns,
      canImport: summary.errors === 0 && summary.ready > 0,
      rows: rows.map((r) => ({ row: r.rowNumber, employeeCode: r.employeeCode, name: r.name, status: r.status, errors: r.errors })),
    };
  }

  /** Requires a successful backup within the last 24 h when the backup status file is available. */
  private async assertRecentBackup() {
    const file = this.config.get<string>('BACKUP_STATUS_FILE');
    if (!file) return; // development / no backup container: the admin's confirmation is required instead
    let st: { ok?: boolean; finishedAt?: string };
    try {
      st = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      throw new BadRequestException('No completed backup found. Run a backup and try again.');
    }
    const ageH = (Date.now() - new Date(st.finishedAt ?? 0).getTime()) / 3_600_000;
    if (!st.ok || !(ageH <= BACKUP_MAX_AGE_HOURS)) {
      throw new BadRequestException('The latest backup failed or is older than 24 hours. Run a successful backup first.');
    }
  }

  async commit(actor: AuthUser, upload: UploadedFile | undefined, jobId: string, backupConfirmed: boolean) {
    if (!actor.roles.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenException('Only the Super Admin can approve the final employee import.');
    }
    const file = this.assertFile(upload);
    const job = await this.prisma.importJob.findFirst({ where: { id: jobId, companyId: actor.companyId, entity: ENTITY } });
    if (!job) throw new NotFoundException('Preview not found. Upload the file for preview first.');
    if (job.status !== 'PREVIEWED') throw new BadRequestException('This preview was already used. Preview the file again.');
    if (Date.now() - job.createdAt.getTime() > PREVIEW_VALID_HOURS * 3_600_000) {
      throw new BadRequestException('This preview has expired. Preview the file again.');
    }
    const sha256 = this.sha256(file.buffer);
    if ((job.mappingJson as { sha256?: string })?.sha256 !== sha256) {
      throw new BadRequestException('The file differs from the previewed file. Preview this file first.');
    }
    if (!backupConfirmed) throw new BadRequestException('Confirm that a verified database backup was taken before importing.');
    await this.assertRecentBackup();

    // Re-validate against the current database (records may have changed since the preview).
    const { rows, summary } = await this.analyse(actor.companyId, file);
    if (summary.errors > 0) {
      throw new BadRequestException(`The file now has ${summary.errors} row(s) with errors. Preview again and correct them.`);
    }

    await this.prisma.importJob.update({ where: { id: job.id }, data: { status: 'RUNNING', dryRun: false, startedAt: new Date() } });
    const created: string[] = [];
    const failed: { row: number; reason: string }[] = [];
    for (const r of rows.filter((x) => x.status === 'ready')) {
      const d = r.data!;
      // Random initial password nobody knows: employees sign in with email OTP (or an admin reset).
      const pw = `${randomBytes(18).toString('base64url')}aA1!`;
      try {
        const emp = (await this.employees.create(actor, {
          employeeCode: d.employeeCode,
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email,
          mobile: d.mobile,
          joinedAt: d.joiningDate,
          department: d.department,
          designation: d.designation,
          dateOfBirth: d.dateOfBirth,
          gender: d.gender,
          createLogin: true,
          password: pw,
          confirmPassword: pw,
        } as never)) as { id: string };
        await this.payroll.upsertConfig(actor, emp.id, {
          grossMonthly: d.grossMonthly,
          effectiveFrom: d.joiningDate,
          allowances: {},
          deductions: {},
        } as never);
        created.push(d.employeeCode);
      } catch (e) {
        failed.push({ row: r.rowNumber, reason: e instanceof Error ? e.message.slice(0, 200) : 'failed' });
      }
    }
    const status = failed.length === 0 ? 'COMPLETED' : created.length ? 'PARTIAL' : 'FAILED';
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        successRows: created.length,
        errorRows: failed.length,
        errorReport: failed.length ? failed : (job.errorReport ?? undefined),
        finishedAt: new Date(),
      },
    });
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.CREATE,
      entityType: 'ImportJob',
      entityId: job.id,
      metadata: { event: 'employee_import_commit', sha256, created: created.length, skippedExisting: summary.existing, failed: failed.length },
    });
    this.logger.log(`Employee import ${job.id}: created ${created.length}, skipped ${summary.existing}, failed ${failed.length}`);
    return { jobId: job.id, status, created: created.length, skippedExisting: summary.existing, failed };
  }

  listJobs(actor: AuthUser) {
    return this.prisma.importJob.findMany({
      where: { companyId: actor.companyId, entity: ENTITY },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, fileName: true, status: true, totalRows: true, successRows: true, errorRows: true, createdBy: true, createdAt: true, finishedAt: true },
    });
  }
}
