import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  BiometricWebhookDto,
  CorrectAttendanceDto,
  MarkAttendanceDto,
} from './dto/attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('me/attendance/mark')
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.attendance.mark(user, dto);
  }

  @Get('me/attendance/summary')
  mySummary(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.attendance.mySummary(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('attendance/console')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.ADMIN)
  console(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.attendance.console(
      user.companyId,
      date ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Get('attendance/monthly')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.ADMIN, RoleCode.MANAGER)
  monthly(
    @CurrentUser() user: AuthUser,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const now = new Date();
    return this.attendance.monthlyGrid(
      user.companyId,
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Put('attendance/:employeeId/:date')
  @Roles(RoleCode.CEO, RoleCode.HR)
  correct(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.attendance.correct(user, employeeId, date, dto);
  }

  @Get('attendance/counters')
  @Roles(RoleCode.CEO, RoleCode.HR)
  counters(@CurrentUser() user: AuthUser) {
    return this.attendance.counters(user.companyId);
  }

  @Get('attendance/biometric-devices')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.ADMIN)
  devices(@CurrentUser() user: AuthUser) {
    return this.attendance.biometricDevices(user.companyId);
  }

  @Get('attendance/team')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  team(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.attendance.teamAttendance(
      user,
      date ?? new Date().toISOString().slice(0, 10),
    );
  }

  /** ESSL / biometric webhook — protect with device secret in later hardening */
  @Public()
  @Post('integrations/biometric/:companyId/webhook')
  biometricWebhook(@Param('companyId') companyId: string, @Body() dto: BiometricWebhookDto) {
    return this.attendance.biometricWebhook(companyId, dto);
  }
}
