import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateAnnouncementDto, SendNotificationDto } from './dto/aggregation.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private isHr(user: AuthUser) {
    return user.roles.some((r) => (['SUPER_ADMIN', 'HR'] as string[]).includes(r));
  }

  async ensureDefaultTemplates(companyId: string) {
    const defs = [
      {
        code: 'WELCOME',
        title: 'Welcome to {{company}}',
        body: 'Hi {{name}}, welcome aboard!',
      },
      {
        code: 'BIRTHDAY',
        title: 'Happy Birthday {{name}}!',
        body: 'Wishing you a wonderful birthday from the EITF team.',
      },
      {
        code: 'ANNIVERSARY',
        title: 'Work Anniversary',
        body: 'Congratulations {{name}} on your work anniversary!',
      },
      {
        code: 'GENERIC',
        title: '{{title}}',
        body: '{{body}}',
      },
    ];
    for (const d of defs) {
      await this.prisma.notificationTemplate.upsert({
        where: { companyId_code: { companyId, code: d.code } },
        create: {
          companyId,
          code: d.code,
          title: d.title,
          body: d.body,
          channels: ['DASHBOARD', 'EMAIL'],
        },
        update: {},
      });
    }
  }

  /**
   * Fan-out notification to dashboard (+ console stubs for email/sms/whatsapp/push).
   */
  async send(companyId: string, dto: SendNotificationDto, actorId?: string) {
    await this.ensureDefaultTemplates(companyId);
    const channels = dto.channels?.length
      ? dto.channels
      : [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL];

    const notification = await this.prisma.notification.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        title: dto.title,
        body: dto.body,
        category: dto.category ?? 'general',
        link: dto.link,
        status: NotificationStatus.SENT,
      },
    });

    const recipient =
      dto.employeeId ??
      (await this.prisma.employee
        .findFirst({ where: { companyId, isActive: true } })
        .then((e) => e?.email ?? e?.mobile ?? 'company'));

    for (const channel of channels) {
      await this.prisma.notificationDispatchLog.create({
        data: {
          companyId,
          channel,
          recipient: String(recipient),
          title: dto.title,
          body: dto.body,
          status: channel === NotificationChannel.DASHBOARD ? 'DELIVERED' : 'STUB_SENT',
          meta: {
            actorId,
            note:
              channel === NotificationChannel.DASHBOARD
                ? 'In-app notification'
                : `${channel} provider stub (console)`,
          } as Prisma.InputJsonValue,
        },
      });
      if (channel !== NotificationChannel.DASHBOARD) {
        // eslint-disable-next-line no-console
        console.log(`[notify:${channel}] to=${recipient} | ${dto.title} — ${dto.body}`);
      }
    }

    return notification;
  }

  async listForEmployee(companyId: string, employeeId: string) {
    return this.prisma.notification.findMany({
      where: {
        companyId,
        OR: [{ employeeId }, { employeeId: null }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async myNotifications(user: AuthUser) {
    if (!user.employeeId) {
      return this.prisma.notification.findMany({
        where: { companyId: user.companyId, employeeId: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }
    return this.listForEmployee(user.companyId, user.employeeId);
  }

  async markRead(user: AuthUser, id?: string, all = false) {
    if (!user.employeeId) throw new ForbiddenException();
    if (all) {
      await this.prisma.notification.updateMany({
        where: {
          companyId: user.companyId,
          employeeId: user.employeeId,
          readAt: null,
        },
        data: { readAt: new Date(), status: NotificationStatus.READ },
      });
      return { ok: true };
    }
    if (!id) throw new NotFoundException('id required');
    const n = await this.prisma.notification.findFirst({
      where: { id, companyId: user.companyId, employeeId: user.employeeId },
    });
    if (!n) throw new NotFoundException();
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date(), status: NotificationStatus.READ },
    });
  }

  async createAnnouncement(user: AuthUser, dto: CreateAnnouncementDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const ann = await this.prisma.announcement.create({
      data: {
        companyId: user.companyId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience ?? 'ALL',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        createdBy: user.id,
      },
    });

    // Fan-out dashboard notifications to active employees
    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, isActive: true },
      select: { id: true },
    });
    for (const e of employees) {
      await this.send(user.companyId, {
        employeeId: e.id,
        title: dto.title,
        body: dto.body,
        category: 'announcement',
        channels: [NotificationChannel.DASHBOARD],
      }, user.id);
    }

    return ann;
  }

  listAnnouncements(companyId: string) {
    return this.prisma.announcement.findMany({
      where: {
        companyId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** Daily birthday / anniversary wishes (manual/cron trigger) */
  async runWishes(companyId: string) {
    await this.ensureDefaultTemplates(companyId);
    const today = new Date();
    const md = `${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      include: { personal: true },
    });
    let birthdays = 0;
    let anniversaries = 0;

    for (const e of employees) {
      const name = `${e.firstName} ${e.lastName ?? ''}`.trim();
      if (e.dateOfBirth) {
        const b = e.dateOfBirth;
        const bmd = `${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`;
        if (bmd === md) {
          await this.send(companyId, {
            employeeId: e.id,
            title: `Happy Birthday ${name}!`,
            body: 'Wishing you a wonderful birthday from the EITF team.',
            category: 'birthday',
            channels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL],
          });
          birthdays++;
        }
      }
      if (e.joinedAt) {
        const j = e.joinedAt;
        const jmd = `${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`;
        if (jmd === md && j.getUTCFullYear() < today.getUTCFullYear()) {
          await this.send(companyId, {
            employeeId: e.id,
            title: 'Work Anniversary',
            body: `Congratulations ${name} on your work anniversary!`,
            category: 'anniversary',
            channels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL],
          });
          anniversaries++;
        }
      }
    }

    return { birthdays, anniversaries };
  }
}
