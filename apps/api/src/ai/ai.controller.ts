import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  private assertEmployeeAssistantAccess(user: AuthUser) {
    if (user.roles.includes(RoleCode.CEO) || user.roles.includes(RoleCode.HR)) {
      throw new ForbiddenException('Permission denied.');
    }
    if (!user.employeeId) {
      throw new ForbiddenException('Permission denied.');
    }
  }

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() body: { message: string }) {
    this.assertEmployeeAssistantAccess(user);
    const message = body?.message?.trim();
    if (!message) throw new BadRequestException('Invalid request.');
    return this.ai.chat(user.companyId, user.id, message, user.employeeId);
  }

  @Get('chat/history')
  history(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    this.assertEmployeeAssistantAccess(user);
    return this.ai.history(user.companyId, user.id, limit ? Number(limit) : 40);
  }

  @Get('predictions')
  @Roles(RoleCode.CEO, RoleCode.HR)
  predictions(@CurrentUser() user: AuthUser) {
    return this.ai.predictions(user.companyId);
  }

  @Post('resume/screen')
  @Roles(RoleCode.CEO, RoleCode.HR)
  screen(
    @CurrentUser() user: AuthUser,
    @Body() body: { candidateName: string; roleTarget: string; resumeText: string },
  ) {
    return this.ai.screenResume(user.companyId, user.id, body);
  }

  @Get('resume/screenings')
  @Roles(RoleCode.CEO, RoleCode.HR)
  screenings(@CurrentUser() user: AuthUser) {
    return this.ai.listScreenings(user.companyId);
  }

  @Get('payroll/anomalies')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  anomalies(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.ai.payrollAnomalies(
      user.companyId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('performance/insights')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  performance(@CurrentUser() user: AuthUser) {
    return this.ai.performanceInsights(user.companyId);
  }

  @Post('reports/:kind/summary')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
  summary(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.ai.reportSummary(
      user.companyId,
      kind,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }
}
