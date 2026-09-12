import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';

class ChatDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  chat(@CurrentUser() user: AuthUser, @Body() body: ChatDto) {
    const message = body?.message?.trim();
    if (!message) throw new BadRequestException('Invalid request.');
    return this.ai.chat(user, message, {
      conversationId: body.conversationId,
      regenerate: body.regenerate,
    });
  }

  @Get('history')
  listHistory(@CurrentUser() user: AuthUser) {
    return this.ai.listHistory(user);
  }

  @Get('history/:id')
  getHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.getHistory(user, id);
  }

  @Delete('history/:id')
  deleteHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.deleteHistory(user, id);
  }

  @Get('chat/history')
  legacyHistory(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.ai.history(user.companyId, user.id, limit ? Number(limit) : 40);
  }

  @Get('prompts')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  prompts(@CurrentUser() user: AuthUser) {
    return this.ai.listPrompts(user.companyId);
  }

  @Post('prompts')
  @Roles(RoleCode.SUPER_ADMIN)
  createPrompt(
    @CurrentUser() user: AuthUser,
    @Body() body: { category: string; title: string; body: string },
  ) {
    return this.ai.upsertPrompt(user, body);
  }

  @Put('prompts/:id')
  @Roles(RoleCode.SUPER_ADMIN)
  updatePrompt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { category: string; title: string; body: string; isActive?: boolean },
  ) {
    return this.ai.upsertPrompt(user, { ...body, id });
  }

  @Delete('prompts/:id')
  @Roles(RoleCode.SUPER_ADMIN)
  deletePrompt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.deletePrompt(user.companyId, id);
  }

  @Get('console')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  console(@CurrentUser() user: AuthUser) {
    return this.ai.consoleAnalytics(user.companyId);
  }

  @Put('settings')
  @Roles(RoleCode.SUPER_ADMIN)
  settings(@CurrentUser() user: AuthUser, @Body() body: { systemPrompt?: string; model?: string }) {
    return this.ai.updateAiSettings(user, body);
  }

  @Get('predictions')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  predictions(@CurrentUser() user: AuthUser) {
    return this.ai.predictions(user.companyId);
  }

  @Post('resume/screen')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  screen(
    @CurrentUser() user: AuthUser,
    @Body() body: { candidateName: string; roleTarget: string; resumeText: string },
  ) {
    return this.ai.screenResume(user.companyId, user.id, body);
  }

  @Get('resume/screenings')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  screenings(@CurrentUser() user: AuthUser) {
    return this.ai.listScreenings(user.companyId);
  }

  @Get('payroll/anomalies')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
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
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  performance(@CurrentUser() user: AuthUser) {
    return this.ai.performanceInsights(user.companyId);
  }

  @Post('reports/:kind/summary')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
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
