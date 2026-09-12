import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { StudioPayload, StudioService } from './studio.service';

class UpdateStudioDto implements StudioPayload {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() legalName?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() gst?: string | null;
  @IsOptional() @IsString() pan?: string | null;
  @IsOptional() @IsString() logoUrl?: string | null;
  @IsOptional() @IsString() faviconUrl?: string | null;
  @IsOptional() @IsString() loginLogoUrl?: string | null;
  @IsOptional() @IsString() emailLogoUrl?: string | null;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() secondaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsBoolean() darkModeEnabled?: boolean;
  @IsOptional() @IsObject() dashboardWidgets?: Record<string, boolean>;
  @IsOptional() @IsObject() sidebarConfig?: Record<string, unknown>;
}

@ApiTags('studio')
@ApiBearerAuth()
@Controller('studio')
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Get('branding')
  branding(@CurrentUser() user: AuthUser) {
    return this.studio.getSettings(user.companyId);
  }

  @Get('settings')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  get(@CurrentUser() user: AuthUser) {
    return this.studio.getSettings(user.companyId);
  }

  @Put('settings')
  @Roles(RoleCode.SUPER_ADMIN)
  put(@CurrentUser() user: AuthUser, @Body() dto: UpdateStudioDto) {
    return this.studio.updateSettings(user, dto);
  }
}
