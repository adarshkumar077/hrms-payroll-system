import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.EMAIL,
  IntegrationProvider.SMS,
  IntegrationProvider.WHATSAPP,
  IntegrationProvider.BIOMETRIC_ESSL,
  IntegrationProvider.GOOGLE_CALENDAR,
  IntegrationProvider.ACCOUNTING,
];

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
