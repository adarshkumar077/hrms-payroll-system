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

  @Post('connect/:provider')
  @Roles(RoleCode.SUPER_ADMIN)
  connect(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
    @Body() body: { secrets?: Record<string, string> },
  ) {
    return this.integrations.connect(user, provider.toUpperCase() as IntegrationProvider, body.secrets);
  }

  @Post('disconnect/:provider')
  @Roles(RoleCode.SUPER_ADMIN)
  disconnect(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    return this.integrations.disconnect(user, provider.toUpperCase() as IntegrationProvider);
  }

  @Post('test/:provider')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  test(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    return this.integrations.testConnection(user, provider.toUpperCase() as IntegrationProvider);
  }

  @Post('refresh/:provider')
  @Roles(RoleCode.SUPER_ADMIN)
  refresh(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    return this.integrations.refresh(user, provider.toUpperCase() as IntegrationProvider);
  }

  @Get('api-keys')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  apiKeys(@CurrentUser() user: AuthUser) {
    return this.integrations.listApiKeys(user.companyId);
  }

  @Post('api-keys')
  @Roles(RoleCode.SUPER_ADMIN)
  createKey(@CurrentUser() user: AuthUser, @Body() body: { name: string }) {
    return this.integrations.createApiKey(user, body.name || 'REST API key');
  }

  @Post('api-keys/:id/revoke')
  @Roles(RoleCode.SUPER_ADMIN)
  revokeKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.integrations.revokeApiKey(user, id);
  }

  @Get('configs')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  configs(@CurrentUser() user: AuthUser) {
    return this.integrations.listConfigs(user.companyId);
  }

  @Put('configs/:provider')
  @Roles(RoleCode.SUPER_ADMIN)
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
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  events(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.integrations.listEvents(user.companyId, limit ? Number(limit) : 50);
  }

  @Post('email/send')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  email(
    @CurrentUser() user: AuthUser,
    @Body() body: { to: string; subject: string; body: string },
  ) {
    return this.integrations.sendEmail(user.companyId, body.to, body.subject, body.body);
  }

  @Post('sms/send')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  sms(@CurrentUser() user: AuthUser, @Body() body: { to: string; message: string }) {
    return this.integrations.sendSms(user.companyId, body.to, body.message);
  }

  @Post('whatsapp/send')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  whatsapp(@CurrentUser() user: AuthUser, @Body() body: { to: string; message: string }) {
    return this.integrations.sendWhatsApp(user.companyId, body.to, body.message);
  }

  @Post('google-calendar/sync')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  calendar(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.integrations.syncGoogleCalendar(user.companyId, user.id, {
      year: year ? Number(year) : undefined,
    });
  }

  @Get('accounting/export')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
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
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  devices(@CurrentUser() user: AuthUser) {
    return this.integrations.listBiometricDevices(user.companyId);
  }

  @Post('biometric/devices')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  upsertDevice(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; deviceCode: string; location?: string },
  ) {
    return this.integrations.upsertBiometricDevice(user.companyId, body);
  }
}
