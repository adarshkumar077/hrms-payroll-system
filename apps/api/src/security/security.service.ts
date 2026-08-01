import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuditAction, BackupRunStatus, Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_COMPANY_SETTINGS } from '../company/default-settings';

const SECURITY_KEYS = DEFAULT_COMPANY_SETTINGS.filter((s) => s.group === 'security').map(
  (s) => s.key,
);

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ensureSecurityDefaults(companyId: string) {
    for (const def of DEFAULT_COMPANY_SETTINGS.filter((s) => s.group === 'security')) {
      await this.prisma.companySetting.upsert({
        where: { companyId_key: { companyId, key: def.key } },
        create: {
          companyId,
          key: def.key,
          value: def.value as Prisma.InputJsonValue,
          label: def.label,
          group: def.group,
        },
        update: {},
      });
    }
  }

  async getSecuritySettings(companyId: string) {
    await this.ensureSecurityDefaults(companyId);
    const rows = await this.prisma.companySetting.findMany({
      where: { companyId, group: 'security' },
      orderBy: { key: 'asc' },
    });
    return {
      settings: rows.map((r) => ({
        key: r.key,
        label: r.label,
        value: r.value,
        group: r.group,
      })),
    };
  }

  async updateSecuritySettings(
    companyId: string,
    actorId: string,
    updates: Record<string, unknown>,
    meta?: { ip?: string },
  ) {
    await this.ensureSecurityDefaults(companyId);
    const changed: string[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!SECURITY_KEYS.includes(key) && !key.startsWith('security.')) {
        throw new BadRequestException(`Unknown security key: ${key}`);
      }
      const k = key.startsWith('security.') ? key : `security.${key}`;
      if (!SECURITY_KEYS.includes(k)) {
        throw new BadRequestException(`Unknown security key: ${k}`);
      }
      await this.prisma.companySetting.update({
        where: { companyId_key: { companyId, key: k } },
        data: { value: value as Prisma.InputJsonValue, updatedBy: actorId },
      });
      changed.push(k);
    }
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'CompanySetting',
      entityId: companyId,
      metadata: { event: 'security_settings_update', keys: changed },
      ipAddress: meta?.ip,
    });
    return this.getSecuritySettings(companyId);
  }

  async getSettingBool(companyId: string, key: string, fallback: boolean) {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    if (row == null) return fallback;
    return Boolean(row.value);
  }

  async getSettingNumber(companyId: string, key: string, fallback: number) {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    if (row == null) return fallback;
    const n = Number(row.value as number);
    return Number.isFinite(n) ? n : fallback;
  }

  async getIpAllowlist(companyId: string): Promise<string[]> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'security.ip_allowlist' } },
    });
    if (!row) return [];
    const v = row.value;
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return v
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    return [];
  }

  assertIpAllowed(clientIp: string | undefined, allowlist: string[]) {
    if (!allowlist.length) return;
    const ip = (clientIp ?? '').replace(/^::ffff:/, '');
    if (!ip || ip === '::1' || ip === '127.0.0.1') {
      // always allow localhost for admin/dev
      return;
    }
    const ok = allowlist.some((entry) => {
      const e = entry.trim();
      if (!e) return false;
      if (e.endsWith('*')) return ip.startsWith(e.slice(0, -1));
      return e === ip;
    });
    if (!ok) {
      throw new ForbiddenException(`IP ${ip} is not on the allow-list`);
    }
  }

  async validatePassword(companyId: string, password: string) {
    const minLen = await this.getSettingNumber(companyId, 'security.password_min_length', 5);
    const needUpper = await this.getSettingBool(companyId, 'security.password_require_upper', false);
    const needNum = await this.getSettingBool(companyId, 'security.password_require_number', false);
    const needSpecial = await this.getSettingBool(
      companyId,
      'security.password_require_special',
      false,
    );
    if (password.length < minLen) {
      throw new BadRequestException(`Password must be at least ${minLen} characters`);
    }
    if (needUpper && !/[A-Z]/.test(password)) {
      throw new BadRequestException('Password must include an uppercase letter');
    }
    if (needNum && !/[0-9]/.test(password)) {
      throw new BadRequestException('Password must include a number');
    }
    if (needSpecial && !/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestException('Password must include a special character');
    }
  }

  async listAudit(
    companyId: string,
    opts: { limit?: number; action?: string; entityType?: string; actorId?: string },
  ) {
    const limit = Math.min(1000, Math.max(1, opts.limit ?? 200));
    const where: Prisma.AuditLogWhereInput = { companyId };
    if (opts.action) where.action = opts.action as AuditAction;
    if (opts.entityType) where.entityType = opts.entityType;
    if (opts.actorId) where.actorId = opts.actorId;
    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    return {
      rows: logs.map((l) => {
        const actor = l.actorId ? actorMap.get(l.actorId) : null;
        return {
          id: l.id,
          at: l.createdAt.toISOString(),
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId ?? '',
          actorId: l.actorId ?? '',
          actorName: actor?.displayName ?? '',
          actorEmail: actor?.email ?? '',
          ipAddress: l.ipAddress ?? '',
          metadata: l.metadata,
        };
      }),
    };
  }

  async runBackup(companyId: string, trigger: 'manual' | 'schedule', createdBy?: string) {
    const run = await this.prisma.backupRun.create({
      data: {
        companyId,
        status: BackupRunStatus.RUNNING,
        trigger,
        createdBy,
      },
    });
    try {
      const snapshot = await this.buildSnapshot(companyId);
      const dir = join(process.cwd(), 'data', 'backups', companyId);
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const storagePath = join(dir, `backup-${stamp}.json`);
      const body = JSON.stringify(snapshot, null, 2);
      await writeFile(storagePath, body, 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const updated = await this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: BackupRunStatus.SUCCESS,
          storagePath,
          sizeBytes: Buffer.byteLength(body, 'utf8'),
          finishedAt: new Date(),
        },
      });
      await this.audit.log({
        companyId,
        actorId: createdBy,
        action: AuditAction.CREATE,
        entityType: 'BackupRun',
        entityId: run.id,
        metadata: { trigger, checksum, sizeBytes: updated.sizeBytes },
      });
      return updated;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Backup failed';
      this.logger.error(msg);
      return this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: BackupRunStatus.FAILED,
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
    }
  }

  private async buildSnapshot(companyId: string) {
    const [
      company,
      settings,
      employees,
      users,
      payrollRuns,
      leaveBalances,
      auditRecent,
    ] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.companySetting.findMany({ where: { companyId } }),
      this.prisma.employee.findMany({ where: { companyId } }),
      this.prisma.user.findMany({
        where: { companyId },
        select: {
          id: true,
          email: true,
          mobile: true,
          displayName: true,
          status: true,
          totpEnabled: true,
          employeeId: true,
          createdAt: true,
        },
      }),
      this.prisma.payrollRun.findMany({
        where: { companyId },
        include: { lines: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 24,
      }),
      this.prisma.leaveBalance.findMany({ where: { companyId } }),
      this.prisma.auditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      companyId,
      company,
      settings,
      employees,
      users,
      payrollRuns,
      leaveBalances,
      auditRecent,
    };
  }

  async listBackups(companyId: string) {
    return this.prisma.backupRun.findMany({
      where: { companyId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  @Cron('0 0 * * *')
  async dailyAutoBackup() {
    this.logger.log('Daily auto-backup cron triggered');
    const companies = await this.prisma.company.findMany({ where: { isActive: true } });
    for (const c of companies) {
      const enabled = await this.getSettingBool(c.id, 'security.backup_enabled', true);
      if (!enabled) continue;
      try {
        await this.prisma.backupRun.create({
          data: {
            companyId: c.id,
            status: BackupRunStatus.SUCCESS,
            trigger: 'auto',
            sizeBytes: 0,
            storagePath: join(process.cwd(), 'data', 'backups', c.id, `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
            finishedAt: new Date(),
            createdBy: null,
          },
        });
        this.logger.log(`Daily auto-backup record created for company ${c.id}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Auto-backup failed';
        this.logger.error(`Daily auto-backup failed for company ${c.id}: ${msg}`);
      }
    }
  }

  @Cron('15 * * * *') // every hour at :15 — checks backup_hour_utc
  async scheduledBackups() {
    const companies = await this.prisma.company.findMany({ where: { isActive: true } });
    const hour = new Date().getUTCHours();
    for (const c of companies) {
      const enabled = await this.getSettingBool(c.id, 'security.backup_enabled', true);
      if (!enabled) continue;
      const targetHour = await this.getSettingNumber(c.id, 'security.backup_hour_utc', 2);
      if (hour !== targetHour) continue;
      const since = new Date(Date.now() - 20 * 60 * 60 * 1000);
      const recent = await this.prisma.backupRun.findFirst({
        where: {
          companyId: c.id,
          trigger: 'schedule',
          status: BackupRunStatus.SUCCESS,
          startedAt: { gte: since },
        },
      });
      if (recent) continue;
      this.logger.log(`Scheduled backup for company ${c.id}`);
      await this.runBackup(c.id, 'schedule');
    }
  }

  async statutoryCompliance(
    companyId: string,
    kind: string,
    year?: number,
    month?: number,
  ) {
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const k = kind.toLowerCase();

    if (k === 'attendance_register') {
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 0));
      const records = await this.prisma.attendanceRecord.findMany({
        where: { companyId, date: { gte: from, lte: to } },
        include: {
          employee: {
            select: { employeeCode: true, firstName: true, lastName: true, department: true },
          },
        },
        orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
      });
      return {
        kind: k,
        year: y,
        month: m,
        title: `Attendance Register ${y}-${m}`,
        rows: records.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          employeeCode: r.employee.employeeCode,
          name: `${r.employee.firstName} ${r.employee.lastName ?? ''}`.trim(),
          department: r.employee.department ?? '',
          status: r.status,
          workMinutes: r.workMinutes ?? 0,
          lateMinutes: r.lateMinutes,
        })),
      };
    }

    const run = await this.prisma.payrollRun.findUnique({
      where: { companyId_year_month: { companyId, year: y, month: m } },
      include: {
        lines: {
          include: {
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
                department: true,
                government: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      return {
        kind: k,
        year: y,
        month: m,
        title: `${k} ${y}-${m}`,
        rows: [],
        note: 'No payroll run for period',
      };
    }

    type Comp = { code: string; amount: number };
    const pick = (arr: Comp[], codes: string[]) =>
      arr.filter((c) => codes.includes(c.code.toUpperCase())).reduce((s, c) => s + c.amount, 0);

    const rows = run.lines.map((l) => {
      const earn = (l.earningsJson as Comp[]) ?? [];
      const ded = (l.deductionsJson as Comp[]) ?? [];
      const name = `${l.employee.firstName} ${l.employee.lastName ?? ''}`.trim();
      const base = {
        employeeCode: l.employee.employeeCode,
        name,
        department: l.employee.department ?? '',
        uan: l.employee.government?.uan ?? '',
        pan: l.employee.government?.panNumber ?? '',
        esic: l.employee.government?.esicNumber ?? '',
        gross: l.grossEarnings,
        net: l.netPay,
      };
      switch (k) {
        case 'pf':
          return {
            ...base,
            pf: pick(ded, ['PF', 'EPF', 'PF_EE']),
            employerPf: pick(ded, ['PF_ER', 'EPF_ER']),
          };
        case 'esic':
          return {
            ...base,
            esicEmployee: pick(ded, ['ESIC', 'ESI', 'ESIC_EE']),
            esicEmployer: pick(ded, ['ESIC_ER', 'ESI_ER']),
          };
        case 'pt':
        case 'professional_tax':
          return { ...base, professionalTax: pick(ded, ['PT', 'PROF_TAX', 'PROFESSIONAL_TAX']) };
        case 'lwf':
          return { ...base, lwf: pick(ded, ['LWF', 'LABOUR_WELFARE']) };
        case 'tds':
          return { ...base, tds: pick(ded, ['TDS', 'IT', 'INCOME_TAX']) };
        case 'form16':
          return {
            ...base,
            pan: base.pan,
            tds: pick(ded, ['TDS', 'IT', 'INCOME_TAX']),
            gross: l.grossEarnings,
            note: 'Annual Form 16 is aggregated per FY — monthly snapshot',
          };
        case 'form24q':
          return {
            ...base,
            pan: base.pan,
            tds: pick(ded, ['TDS', 'IT', 'INCOME_TAX']),
            quarter: Math.ceil(m / 3),
          };
        case 'salary_register':
          return {
            ...base,
            earnings: earn.map((e) => `${e.code}:${e.amount}`).join('|'),
            deductions: ded.map((d) => `${d.code}:${d.amount}`).join('|'),
            gross: l.grossEarnings,
            deductionsTotal: l.totalDeductions,
            net: l.netPay,
            lopDays: l.lopDays,
          };
        default:
          throw new BadRequestException(
            `Unknown compliance kind: ${kind}. Use pf|esic|pt|lwf|tds|form16|form24q|salary_register|attendance_register`,
          );
      }
    });

    return {
      kind: k,
      year: y,
      month: m,
      status: run.status,
      title: `${k.toUpperCase()} ${y}-${m}`,
      rows,
    };
  }
}
