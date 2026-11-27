import { BadRequestException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { MailService, isDeliverableEmail, maskEmail } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { IntegrationProvider, Prisma, AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret } from '../common/secret-crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import * as M from '../common/money';

const DEFAULT_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.EMAIL,
  IntegrationProvider.SMS,
  IntegrationProvider.WHATSAPP,
  IntegrationProvider.BIOMETRIC_ESSL,
  IntegrationProvider.GOOGLE_CALENDAR,
  IntegrationProvider.ACCOUNTING,
  IntegrationProvider.GMAIL,
  IntegrationProvider.OUTLOOK,
  IntegrationProvider.SLACK,
  IntegrationProvider.TEAMS,
  IntegrationProvider.GOOGLE_DRIVE,
  IntegrationProvider.ONEDRIVE,
  IntegrationProvider.REST_API,
  IntegrationProvider.WEBHOOK,
];

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Optional() private readonly mail?: MailService,
  ) {}

  async ensureDefaults(companyId: string) {
    for (const provider of DEFAULT_PROVIDERS) {
      await this.prisma.integrationConfig.upsert({
        where: { companyId_provider: { companyId, provider } },
        create: {
          companyId,
          provider,
          isEnabled: provider === IntegrationProvider.BIOMETRIC_ESSL,
          configJson: {},
        },
        update: {},
      });
    }
  }

  async listConfigs(companyId: string) {
    await this.ensureDefaults(companyId);
    return this.prisma.integrationConfig.findMany({
      where: { companyId },
      orderBy: { provider: 'asc' },
    });
  }

  async upsertConfig(
    companyId: string,
    provider: IntegrationProvider,
    data: { isEnabled?: boolean; configJson?: Record<string, unknown> },
  ) {
    await this.ensureDefaults(companyId);
    return this.prisma.integrationConfig.upsert({
      where: { companyId_provider: { companyId, provider } },
      create: {
        companyId,
        provider,
        isEnabled: data.isEnabled ?? false,
        configJson: (data.configJson ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        ...(data.isEnabled != null ? { isEnabled: data.isEnabled } : {}),
        ...(data.configJson != null
          ? { configJson: data.configJson as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async logEvent(
    companyId: string,
    provider: string,
    eventType: string,
    payload: Prisma.InputJsonValue,
    status = 'LOGGED',
  ) {
    this.logger.log(`[${provider}] ${eventType} status=${status}`);
    return this.prisma.integrationEventLog.create({
      data: { companyId, provider, eventType, payload, status },
    });
  }

  async listEvents(companyId: string, limit = 50) {
    return this.prisma.integrationEventLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, limit),
    });
  }

  /**
   * Sends a real email through the company SMTP account. To limit misuse (phishing from the company
   * mailbox), the recipient must be the registered email of a user or employee of this company.
   */
  async sendEmail(companyId: string, to: string, subject: string, body: string) {
    if (!this.mail?.isConfigured()) {
      throw new ServiceUnavailableException('Email (SMTP) is not configured. See docs/EMAIL_OTP_SETUP.md.');
    }
    const recipient = String(to ?? '').trim().toLowerCase();
    if (!isDeliverableEmail(recipient)) throw new BadRequestException('Enter a valid email address.');
    if (!subject?.trim() || !body?.trim()) throw new BadRequestException('Subject and message are required.');
    const known =
      (await this.prisma.employee.count({ where: { companyId, email: recipient } })) +
      (await this.prisma.user.count({ where: { companyId, email: { equals: recipient, mode: 'insensitive' } } }));
    if (!known) throw new BadRequestException('Emails can only be sent to addresses registered in this company.');
    const result = await this.mail.send({
      to: recipient,
      subject: subject.trim().slice(0, 200),
      text: body.slice(0, 20_000),
      category: 'hr-message',
    });
    await this.logEvent(companyId, 'EMAIL', 'send', { to: maskEmail(recipient), subject: subject.slice(0, 200) }, result.ok ? 'SENT' : 'FAILED');
    if (!result.ok) throw new ServiceUnavailableException('The email could not be sent. Please try again later.');
    return { ok: true, channel: 'EMAIL', status: 'SENT', to: maskEmail(recipient) };
  }

  /** No SMS provider is integrated (MSG91 was removed; OTP and notices go by email). */
  async sendSms(_companyId: string, _to: string, _message: string) {
    throw new ServiceUnavailableException('SMS sending is not available: no SMS provider is integrated. Use email.');
  }

  /** No WhatsApp Business provider is integrated. */
  async sendWhatsApp(_companyId: string, _to: string, _message: string) {
    throw new ServiceUnavailableException('WhatsApp sending is not available: no WhatsApp provider is integrated. Use email.');
  }

  async syncGoogleCalendar(
    companyId: string,
    actorId: string,
    opts?: { year?: number },
  ) {
    const y = opts?.year ?? new Date().getFullYear();
    const holidays = await this.prisma.holiday.findMany({
      where: {
        companyId,
        date: {
          gte: new Date(Date.UTC(y, 0, 1)),
          lte: new Date(Date.UTC(y, 11, 31)),
        },
      },
      orderBy: { date: 'asc' },
    });
    const events = holidays.map((h) => ({
      title: h.name,
      date: h.date.toISOString().slice(0, 10),
      type: h.type,
    }));
    await this.logEvent(
      companyId,
      'GOOGLE_CALENDAR',
      'sync_holidays',
      { actorId, year: y, events },
      'NOT_CONNECTED',
    );
    // Pushing events needs a Google OAuth connection, which is not implemented. Nothing is sent;
    // the holiday list is returned so HR can import it into Google Calendar by hand.
    return {
      ok: false,
      provider: 'GOOGLE_CALENDAR',
      status: 'NOT_CONNECTED',
      synced: 0,
      events,
      note: 'Google Calendar is not connected; no events were pushed. The holiday list is shown for manual import.',
    };
  }

  async exportAccounting(companyId: string, year?: number, month?: number) {
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const run = await this.prisma.payrollRun.findUnique({
      where: { companyId_year_month: { companyId, year: y, month: m } },
      include: {
        lines: {
          include: {
            employee: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!run) throw new BadRequestException(`No payroll run for ${y}-${m}`);
    const journal = run.lines.map((l) => ({
      employeeCode: l.employee.employeeCode,
      name: `${l.employee.firstName} ${l.employee.lastName ?? ''}`.trim(),
      debitSalary: M.toNumber(l.grossEarnings),
      creditBank: M.toNumber(l.netPay),
      deductions: M.toNumber(l.totalDeductions),
      voucherType: 'Payroll',
    }));
    const payload = {
      format: 'tally-compatible-json',
      year: y,
      month: m,
      status: run.status,
      journal,
    };
    await this.logEvent(companyId, 'ACCOUNTING', 'export_payroll', payload as Prisma.InputJsonValue, 'EXPORTED');
    return { ok: true, ...payload };
  }

  async listBiometricDevices(companyId: string) {
    return this.prisma.biometricDevice.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async upsertBiometricDevice(
    companyId: string,
    data: { name: string; deviceCode: string; location?: string },
  ) {
    return this.prisma.biometricDevice.upsert({
      where: { companyId_deviceCode: { companyId, deviceCode: data.deviceCode } },
      create: {
        companyId,
        name: data.name,
        deviceCode: data.deviceCode,
        location: data.location,
        isOnline: true,
        lastSyncAt: new Date(),
      },
      update: {
        name: data.name,
        location: data.location,
        isOnline: true,
        lastSyncAt: new Date(),
      },
    });
  }

  async connect(user: AuthUser, provider: IntegrationProvider, secrets?: Record<string, string>) {
    const encrypted = secrets
      ? Object.fromEntries(
          Object.entries(secrets).map(([k, v]) => [k, encryptSecret(this.config, v)]),
        )
      : {};
    const row = await this.upsertConfig(user.companyId, provider, {
      isEnabled: true,
      configJson: { connectedAt: new Date().toISOString(), secrets: encrypted, hasSecrets: Object.keys(encrypted).length > 0 },
    });
    await this.logEvent(user.companyId, provider, 'connect', { actorId: user.id }, 'CONNECTED');
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'IntegrationConfig',
      entityId: row.id,
      metadata: { event: 'connect', provider },
    });
    return { ok: true, provider, isEnabled: true };
  }

  async disconnect(user: AuthUser, provider: IntegrationProvider) {
    const row = await this.upsertConfig(user.companyId, provider, { isEnabled: false, configJson: {} });
    await this.logEvent(user.companyId, provider, 'disconnect', { actorId: user.id }, 'DISCONNECTED');
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'IntegrationConfig',
      entityId: row.id,
      metadata: { event: 'disconnect', provider },
    });
    return { ok: true, provider, isEnabled: false };
  }

  async testConnection(user: AuthUser, provider: IntegrationProvider) {
    let ok: boolean;
    let status: string;
    let detail: string;
    if (provider === IntegrationProvider.EMAIL) {
      const v = this.mail ? await this.mail.verifyConnection() : { ok: false, error: 'smtp_not_configured' };
      ok = v.ok;
      status = v.ok ? 'OK' : 'FAILED';
      detail = v.ok ? 'SMTP server accepted the connection and login.' : `SMTP check failed: ${v.error ?? 'unknown'}`;
    } else {
      const cfg = await this.prisma.integrationConfig.findUnique({
        where: { companyId_provider: { companyId: user.companyId, provider } },
      });
      ok = false;
      status = cfg?.isEnabled ? 'NO_LIVE_TEST' : 'NOT_CONNECTED';
      detail = 'No live connection test exists for this provider; it is not integrated with an external service.';
    }
    await this.logEvent(user.companyId, provider, 'test', { actorId: user.id }, status);
    return { ok, provider, status, detail };
  }

  async refresh(user: AuthUser, provider: IntegrationProvider) {
    await this.logEvent(user.companyId, provider, 'refresh', { actorId: user.id }, 'NOT_SUPPORTED');
    return { ok: false, provider, status: 'NOT_SUPPORTED', detail: 'This provider has no external data to refresh.' };
  }

  async createApiKey(user: AuthUser, name: string) {
    const raw = `eitf_${randomBytes(24).toString('hex')}`;
    const row = await this.prisma.integrationApiKey.create({
      data: {
        companyId: user.companyId,
        name,
        keyPrefix: raw.slice(0, 12),
        secretHash: createHash('sha256').update(raw).digest('hex'),
        encryptedSecret: encryptSecret(this.config, raw),
        createdBy: user.id,
      },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'IntegrationApiKey',
      entityId: row.id,
    });
    return { id: row.id, name: row.name, keyPrefix: row.keyPrefix, secret: raw, once: true };
  }

  async listApiKeys(companyId: string) {
    const rows = await this.prisma.integrationApiKey.findMany({
      where: { companyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    }));
  }

  async revokeApiKey(user: AuthUser, id: string) {
    const row = await this.prisma.integrationApiKey.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!row) throw new NotFoundException('API key not found');
    await this.prisma.integrationApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
