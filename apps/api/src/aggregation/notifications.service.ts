import { ForbiddenException, Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { MailService, isDeliverableEmail, maskEmail } from '../mail/mail.service';
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mail?: MailService,
  ) {}

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
   * Fan-out notification: in-app always; email via SMTP to the targeted employee; SMS / WhatsApp /
   * push are recorded as not configured (no provider).
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

    // Email goes only to the targeted employee's own registered address. Company-wide
    // notifications (no employeeId) stay in-app; they are never emailed to an arbitrary person.
    const employee = dto.employeeId
      ? await this.prisma.employee.findFirst({
          where: { companyId, id: dto.employeeId },
          select: { id: true, email: true },
        })
      : null;

    for (const channel of channels) {
      let status: string;
      let note: string;
      let recipient: string;
      if (channel === NotificationChannel.DASHBOARD) {
        status = 'DELIVERED';
        note = 'In-app notification';
        recipient = dto.employeeId ?? 'company';
      } else if (channel === NotificationChannel.EMAIL) {
        recipient = employee?.email ? maskEmail(employee.email) : dto.employeeId ?? 'company';
        if (!employee) {
          status = 'SKIPPED';
          note = 'Company-wide notification: shown in-app only';
        } else if (!this.mail?.isConfigured()) {
          status = 'NOT_CONFIGURED';
          note = 'Email (SMTP) is not configured';
        } else if (!isDeliverableEmail(employee.email)) {
          status = 'SKIPPED';
          note = 'Employee has no valid email on file';
        } else {
          const r = await this.mail.send({
            to: employee.email,
            subject: dto.title,
            text: `${dto.body}\n\n— EITF HRMS`,
            category: 'notification',
          });
          status = r.ok ? 'SENT' : 'FAILED';
          note = r.ok ? 'Email sent' : `Email failed: ${r.error}`;
        }
      } else {
        // SMS / WhatsApp / push have no provider: record it, never print content or recipients.
        status = 'NOT_CONFIGURED';
        note = `${channel} provider not configured`;
        recipient = dto.employeeId ?? 'company';
      }
      await this.prisma.notificationDispatchLog.create({
        data: {
          companyId,
          channel,
          recipient,
          title: dto.title,
          body: dto.body,
          status,
          meta: { actorId, note } as Prisma.InputJsonValue,
        },
      });
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
    let ann;
    try {
      ann = await this.prisma.announcement.create({
        data: {
          companyId: user.companyId,
          title: dto.title,
          body: dto.body,
          audience: dto.audience ?? 'ALL',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          createdBy: user.id,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/22P05|WIN1252|character with byte sequence/i.test(msg)) {
        throw new BadRequestException(
          'Announcement text contains characters (such as emoji) that the database cannot store. Remove emoji/special symbols and try again.',
        );
      }
      throw err;
    }

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
