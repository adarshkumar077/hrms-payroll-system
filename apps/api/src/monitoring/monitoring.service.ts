import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AuditAction } from '@prisma/client';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as tls from 'tls';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService, isDeliverableEmail } from '../mail/mail.service';

export type CheckStatus = 'ok' | 'warn' | 'critical' | 'unknown';
export type HealthCheck = { key: string; label: string; status: CheckStatus; detail: string };

type BackupStatus = {
  ok: boolean;
  finishedAt: string;
  encrypted?: boolean;
  database?: { ok: boolean; bytes: number };
  uploads?: { state: string; files: number };
  offsite?: { state: string; failed?: string };
};

const ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;
const BACKUP_MAX_AGE_HOURS = 26;

/**
 * In-app monitoring. Runs every 15 minutes and emails ALERT_EMAILS (max once per problem per
 * 6 hours) when something needs attention: database, disk, memory, backups (failed / stale /
 * off-site failed), email delivery, failed-login spikes and TLS certificate expiry.
 *
 * A server that is completely down cannot alert about itself: pair this with an external
 * uptime monitor that polls https://<host>/api/v1/health (see docs/PRODUCTION_DEPLOYMENT_GUIDE.md).
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private lastAlertAt = new Map<string, number>();
  private lastChecks: { checkedAt: Date; checks: HealthCheck[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  private get isProd() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  async runChecks(): Promise<HealthCheck[]> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkDisk(),
      this.checkMemory(),
      this.checkBackups(),
      this.checkEmail(),
      this.checkFailedLogins(),
      this.checkCertificate(),
    ]);
    this.lastChecks = { checkedAt: new Date(), checks };
    return checks;
  }

  snapshot() {
    return this.lastChecks;
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - t0;
      return { key: 'database', label: 'Database', status: ms > 2000 ? 'warn' : 'ok', detail: `responding in ${ms} ms` };
    } catch {
      return { key: 'database', label: 'Database', status: 'critical', detail: 'database is not responding' };
    }
  }

  private async checkDisk(): Promise<HealthCheck> {
    try {
      const s = await fs.statfs(this.config.get<string>('MONITOR_DISK_PATH') || process.cwd());
      const total = Number(s.blocks) * Number(s.bsize);
      const free = Number(s.bavail) * Number(s.bsize);
      const pct = total > 0 ? (free / total) * 100 : 100;
      const gb = (free / 1024 ** 3).toFixed(1);
      const status: CheckStatus = pct < 10 ? 'critical' : pct < 15 ? 'warn' : 'ok';
      return { key: 'disk', label: 'Disk space', status, detail: `${gb} GB free (${pct.toFixed(0)}%)` };
    } catch {
      return { key: 'disk', label: 'Disk space', status: 'unknown', detail: 'could not read disk usage' };
    }
  }

  private async checkMemory(): Promise<HealthCheck> {
    const free = os.freemem();
    const total = os.totalmem();
    const pct = (free / total) * 100;
    const load = os.loadavg()[0];
    const cpus = os.cpus().length || 1;
    const status: CheckStatus = pct < 5 ? 'critical' : pct < 10 || load > cpus * 2 ? 'warn' : 'ok';
    return {
      key: 'resources',
      label: 'Memory / CPU',
      status,
      detail: `${(free / 1024 ** 3).toFixed(1)} of ${(total / 1024 ** 3).toFixed(1)} GB free; load ${load.toFixed(2)} on ${cpus} CPUs`,
    };
  }

  private async checkBackups(): Promise<HealthCheck> {
    const file = this.config.get<string>('BACKUP_STATUS_FILE');
    const base = { key: 'backup', label: 'Backups' };
    if (!file) return { ...base, status: this.isProd ? 'warn' : 'unknown', detail: 'BACKUP_STATUS_FILE is not configured' };
    let st: BackupStatus;
    try {
      st = JSON.parse(await fs.readFile(file, 'utf8')) as BackupStatus;
    } catch {
      return { ...base, status: 'critical', detail: 'no backup has completed yet (status file missing)' };
    }
    const ageH = (Date.now() - new Date(st.finishedAt).getTime()) / 3_600_000;
    const parts = [
      `last run ${Number.isFinite(ageH) ? ageH.toFixed(1) : '?'} h ago`,
      `database ${st.database?.ok ? 'ok' : 'FAILED'}`,
      `uploads ${st.uploads?.state ?? 'n/a'} (${st.uploads?.files ?? 0} files)`,
      `off-site ${st.offsite?.state ?? 'n/a'}`,
      st.encrypted ? 'encrypted' : 'NOT encrypted',
    ];
    let status: CheckStatus = 'ok';
    if (!st.ok || !Number.isFinite(ageH) || ageH > BACKUP_MAX_AGE_HOURS) status = 'critical';
    else if (!st.encrypted || st.offsite?.state !== 'ok') status = 'warn';
    return { ...base, status, detail: parts.join(', ') };
  }

  private async checkEmail(): Promise<HealthCheck> {
    const s = this.mail.stats();
    const base = { key: 'email', label: 'Email delivery' };
    if (!s.configured) {
      return { ...base, status: this.isProd ? 'warn' : 'unknown', detail: 'SMTP is not configured (email OTP login is off)' };
    }
    if (s.failuresLast15m >= 3) {
      return { ...base, status: 'critical', detail: `${s.failuresLast15m} failed sends in 15 min (last: ${s.lastFailure?.error ?? 'n/a'})` };
    }
    return { ...base, status: s.failuresLastHour > 0 ? 'warn' : 'ok', detail: `${s.failuresLastHour} failed sends in the last hour` };
  }

  private async checkFailedLogins(): Promise<HealthCheck> {
    const since = new Date(Date.now() - 15 * 60_000);
    const n = await this.prisma.auditLog.count({ where: { action: AuditAction.LOGIN_FAILED, createdAt: { gte: since } } });
    const status: CheckStatus = n >= 50 ? 'critical' : n >= 20 ? 'warn' : 'ok';
    return { key: 'failed_logins', label: 'Failed logins', status, detail: `${n} failed logins in the last 15 min` };
  }

  private async checkCertificate(): Promise<HealthCheck> {
    const target = this.config.get<string>('TLS_CHECK_HOST'); // e.g. nginx:443
    const base = { key: 'tls_certificate', label: 'HTTPS certificate' };
    if (!target) return { ...base, status: 'unknown', detail: 'TLS_CHECK_HOST not set' };
    const [host, portStr] = target.split(':');
    const servername = this.config.get<string>('TLS_CHECK_SERVERNAME') || undefined;
    return new Promise<HealthCheck>((resolve) => {
      const sock = tls.connect({ host, port: Number(portStr || 443), servername, rejectUnauthorized: false, timeout: 5000 }, () => {
        const cert = sock.getPeerCertificate();
        sock.end();
        const days = cert?.valid_to ? (new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000 : NaN;
        if (!Number.isFinite(days)) return resolve({ ...base, status: 'unknown', detail: 'no certificate returned' });
        const status: CheckStatus = days < 7 ? 'critical' : days < 21 ? 'warn' : 'ok';
        resolve({ ...base, status, detail: `expires in ${Math.floor(days)} days (${cert.valid_to})` });
      });
      sock.on('error', () => resolve({ ...base, status: 'critical', detail: `HTTPS endpoint ${target} not reachable` }));
      sock.on('timeout', () => { sock.destroy(); resolve({ ...base, status: 'critical', detail: `HTTPS endpoint ${target} timed out` }); });
    });
  }

  private alertRecipients(): string[] {
    return (this.config.get<string>('ALERT_EMAILS') ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => isDeliverableEmail(s));
  }

  /** Every 15 minutes: run checks and alert on problems (deduplicated per problem for 6 h). */
  @Cron('*/15 * * * *')
  async monitor() {
    const checks = await this.runChecks();
    const problems = checks.filter((c) => c.status === 'critical' || (c.status === 'warn' && ['backup', 'disk'].includes(c.key)));
    const now = Date.now();
    const due = problems.filter((p) => now - (this.lastAlertAt.get(`${p.key}:${p.status}`) ?? 0) > ALERT_REPEAT_MS);
    if (!due.length) return { checks, alerted: [] as string[] };

    for (const p of due) {
      this.lastAlertAt.set(`${p.key}:${p.status}`, now);
      this.logger.error(`ALERT [${p.status}] ${p.label}: ${p.detail}`);
    }
    const company = await this.prisma.company.findFirst({ where: { isActive: true }, select: { id: true } });
    if (company) {
      await this.audit
        .log({
          companyId: company.id,
          action: AuditAction.UPDATE,
          entityType: 'SystemAlert',
          metadata: { alerts: due.map((p) => ({ key: p.key, status: p.status, detail: p.detail })) },
        })
        .catch(() => undefined);
    }
    const to = this.alertRecipients();
    if (to.length && this.mail.isConfigured()) {
      const text = [
        'EITF HRMS monitoring found problems that need attention:',
        '',
        ...due.map((p) => `- [${p.status.toUpperCase()}] ${p.label}: ${p.detail}`),
        '',
        `Checked at ${new Date(now).toISOString()}. You will not be re-alerted about the same problem for 6 hours.`,
      ].join('\n');
      for (const addr of to) {
        await this.mail.send({ to: addr, subject: `EITF HRMS alert: ${due.map((p) => p.label).join(', ')}`, text, category: 'alert' });
      }
    } else {
      this.logger.warn('Alerts could not be emailed: set ALERT_EMAILS and SMTP_* to receive them.');
    }
    return { checks, alerted: due.map((p) => p.key) };
  }
}
