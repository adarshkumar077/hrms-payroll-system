import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { CompanyService } from './company.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  UpdateCompanyDto,
  UpdatePolicyDto,
  UpdateSettingsBulkDto,
  UpsertSettingDto,
} from './dto/company.dto';

@ApiTags('company')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.ADMIN)
  getCompany(@CurrentUser() user: AuthUser) {
    return this.company.getCompany(user.companyId);
  }

  /** Read-only company details for all authenticated roles (employee card) */
  @Get('details')
  getDetails(@CurrentUser() user: AuthUser) {
    return this.company.getCompanyPublic(user.companyId);
  }

  @Put()
  @Roles(RoleCode.CEO, RoleCode.HR)
  updateCompany(@CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyDto) {
    return this.company.updateCompany(user.companyId, user.id, dto);
  }

  @Put('logo')
  @Roles(RoleCode.CEO, RoleCode.HR)
  updateLogo(@CurrentUser() user: AuthUser, @Body() body: { logoUrl: string }) {
    return this.company.updateCompany(user.companyId, user.id, { logoUrl: body.logoUrl });
  }

  @Get('settings')
  @Roles(RoleCode.CEO, RoleCode.HR)
  getSettings(@CurrentUser() user: AuthUser, @Query('group') group?: string) {
    return this.company.getSettings(user.companyId, group);
  }

  /** Employees may read non-sensitive settings that affect their UI (attendance rules, etc.) */
  @Get('settings/public')
  getPublicSettings(@CurrentUser() user: AuthUser, @Query('group') group?: string) {
    return this.company.getPublicSettings(user.companyId, group);
  }

  @Put('settings')
  @Roles(RoleCode.CEO, RoleCode.HR)
  updateSettingsBulk(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsBulkDto) {
    return this.company.updateSettingsBulk(user.companyId, user.id, dto.settings);
  }

  @Put('settings/:key')
  @Roles(RoleCode.CEO, RoleCode.HR)
  upsertSetting(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
  ) {
    return this.company.upsertSetting(
      user.companyId,
      user.id,
      key,
      dto.value,
      dto.label,
      dto.group,
    );
  }

  @Get('policies')
  getPolicies(@CurrentUser() user: AuthUser) {
    return this.company.getPolicies(user.companyId);
  }

  @Put('policies/:code')
  @Roles(RoleCode.CEO, RoleCode.HR)
  updatePolicy(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.company.updatePolicy(user.companyId, user.id, code, dto);
  }
}
