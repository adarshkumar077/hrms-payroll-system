import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IntegrationProvider, RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('configs')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.ADMIN)
  configs(@CurrentUser() user: AuthUser) {
    return this.integrations.listConfigs(user.companyId);
  }

  @Put('configs/:provider')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.ADMIN)
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
    @Body() body: { isEnabled?: boolean; configJson?: Record<string, unknown> },
  ) {
    return this.integrations.upsertConfig(
      user.companyId,
      provider.toUpperCase() as IntegrationProvider,
      body,
    );
  }

  @Get('events')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.ADMIN)
  events(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.integrations.listEvents(user.companyId, limit ? Number(limit) : 50);
  }

  @Post('email/send')
  @Roles(RoleCode.CEO, RoleCode.HR)
  email(
    @CurrentUser() user: AuthUser,
    @Body() body: { to: string; subject: string; body: string },
  ) {
    return this.integrations.sendEmail(user.companyId, body.to, body.subject, body.body);
  }

  @Post('sms/send')
  @Roles(RoleCode.CEO, RoleCode.HR)
  sms(@CurrentUser() user: AuthUser, @Body() body: { to: string; message: string }) {
    return this.integrations.sendSms(user.companyId, body.to, body.message);
  }

  @Post('whatsapp/send')
  @Roles(RoleCode.CEO, RoleCode.HR)
  whatsapp(@CurrentUser() user: AuthUser, @Body() body: { to: string; message: string }) {
    return this.integrations.sendWhatsApp(user.companyId, body.to, body.message);
  }

  @Post('google-calendar/sync')
  @Roles(RoleCode.CEO, RoleCode.HR)
  calendar(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.integrations.syncGoogleCalendar(user.companyId, user.id, {
      year: year ? Number(year) : undefined,
    });
  }

  @Get('accounting/export')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  accounting(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.integrations.exportAccounting(
      user.companyId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('biometric/devices')
  @Roles(RoleCode.CEO, RoleCode.HR)
  devices(@CurrentUser() user: AuthUser) {
    return this.integrations.listBiometricDevices(user.companyId);
  }

  @Post('biometric/devices')
  @Roles(RoleCode.CEO, RoleCode.HR)
  upsertDevice(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; deviceCode: string; location?: string },
  ) {
    return this.integrations.upsertBiometricDevice(user.companyId, body);
  }
}
