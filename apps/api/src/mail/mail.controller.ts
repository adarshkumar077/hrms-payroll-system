import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction, RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, maskEmail } from './mail.service';

/** Super Admin tools to verify the SMTP setup (connection test + a real test email to themself). */
@ApiTags('mail')
@ApiBearerAuth()
@Controller('admin/email')
@Roles(RoleCode.SUPER_ADMIN)
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  status() {
    const s = this.mail.stats();
    return { ...s, from: s.configured ? maskEmail(this.mail.fromHeader().address) : null };
  }

  @Post('test')
  async test(@CurrentUser() actor: AuthUser) {
    const connection = await this.mail.verifyConnection();
    const me = await this.prisma.user.findFirst({ where: { id: actor.id, companyId: actor.companyId }, select: { email: true } });
    let delivery: { ok: boolean; error?: string } = { ok: false, error: 'not_attempted' };
    if (connection.ok && me?.email) {
      const r = await this.mail.send({
        to: me.email,
        subject: 'EITF HRMS – SMTP test email',
        text: 'This is a test email from EITF HRMS. If you received it, outgoing email (and email OTP login) can be delivered.',
        category: 'test',
      });
      delivery = { ok: r.ok, error: r.error };
    } else if (!me?.email) {
      delivery = { ok: false, error: 'your_account_has_no_email' };
    }
    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'MailSettings',
      metadata: { event: 'smtp_test', connection: connection.ok, delivered: delivery.ok, error: delivery.error ?? connection.error ?? null },
    });
    return {
      connection,
      testEmail: { ...delivery, to: me?.email ? maskEmail(me.email) : null },
      note: 'Delivery is confirmed only when the email actually arrives in the inbox.',
    };
  }
}
