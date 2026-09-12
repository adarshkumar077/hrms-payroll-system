import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { IntegrationProvider, Prisma, AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret } from '../common/secret-crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

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
    status = 'STUB_SENT',
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

  async sendEmail(companyId: string, to: string, subject: string, body: string) {
    const cfg = await this.prisma.integrationConfig.findUnique({
      where: {
        companyId_provider: { companyId, provider: IntegrationProvider.EMAIL },
      },
    });
    const status = cfg?.isEnabled ? 'STUB_SENT' : 'DISABLED_STUB';
    await this.logEvent(companyId, 'EMAIL', 'send', { to, subject, body: body.slice(0, 500) }, status);
    // eslint-disable-next-line no-console
    console.log(`[email] to=${to} subject=${subject}`);
    return { ok: true, channel: 'EMAIL', status, stub: true };
  }

  async sendSms(companyId: string, to: string, message: string) {
    const cfg = await this.prisma.integrationConfig.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.SMS } },
    });
    const status = cfg?.isEnabled ? 'STUB_SENT' : 'DISABLED_STUB';
    await this.logEvent(companyId, 'SMS', 'send', { to, message }, status);
    console.log(`[sms] to=${to} message=${message}`);
    return { ok: true, channel: 'SMS', status, stub: true };
  }

  async sendWhatsApp(companyId: string, to: string, message: string) {
    const cfg = await this.prisma.integrationConfig.findUnique({
      where: {
        companyId_provider: { companyId, provider: IntegrationProvider.WHATSAPP },
      },
    });
    const status = cfg?.isEnabled ? 'STUB_SENT' : 'DISABLED_STUB';
    await this.logEvent(companyId, 'WHATSAPP', 'send', { to, message }, status);
    console.log(`[whatsapp] to=${to} message=${message}`);
    return { ok: true, channel: 'WHATSAPP', status, stub: true };
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
      'STUB_SYNCED',
    );
    return {
      ok: true,
      stub: true,
      provider: 'GOOGLE_CALENDAR',
      synced: events.length,
      events,
      note: 'Stub sync — connect Google OAuth credentials in integration config to push events',
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
      debitSalary: l.grossEarnings,
      creditBank: l.netPay,
      deductions: l.totalDeductions,
      voucherType: 'Payroll',
    }));
    const payload = {
      format: 'tally-compatible-json',
      year: y,
      month: m,
      status: run.status,
      journal,
    };
    await this.logEvent(companyId, 'ACCOUNTING', 'export_payroll', payload as Prisma.InputJsonValue, 'STUB_EXPORTED');
    return { ok: true, stub: true, ...payload };
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
    const cfg = await this.prisma.integrationConfig.findUnique({
      where: { companyId_provider: { companyId: user.companyId, provider } },
    });
    const ok = Boolean(cfg?.isEnabled);
    const status = ok ? 'OK' : 'NOT_CONNECTED';
    await this.logEvent(user.companyId, provider, 'test', { actorId: user.id }, status);
    return { ok, provider, status, latencyMs: 12, stub: true };
  }

  async refresh(user: AuthUser, provider: IntegrationProvider) {
    await this.logEvent(user.companyId, provider, 'refresh', { actorId: user.id }, 'REFRESHED');
    return { ok: true, provider, syncedAt: new Date().toISOString(), stub: true };
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
