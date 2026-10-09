import { Body, Controller, Get, Param, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  BiometricWebhookDto,
  CorrectAttendanceDto,
  ManualMarkDto,
  MarkAttendanceDto,
} from './dto/attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  private file(file: { filename: string; content: string | Buffer; contentType: string }) {
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    return new StreamableFile(buf, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

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

  @Get('me/attendance/calendar')
  myCalendar(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.attendance.myCalendar(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('attendance/console')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  console(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.attendance.console(
      user.companyId,
      date ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Get('attendance/monthly')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
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

  /** Excel-style sheet for one employee (or all if HR omits employeeId) */
  @Get('attendance/sheet')
  sheet(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.attendance.attendanceSheet(user, {
      employeeId: employeeId || undefined,
      year: year ? Number(year) : now.getFullYear(),
      month: month ? Number(month) : now.getMonth() + 1,
    });
  }

  /** Export Attendance Sheet as .xlsx — one employee (employeeId) or all (scope=all). */
  @Get('attendance/sheet/export/excel')
  async exportSheetExcel(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('scope') scope?: string,
  ) {
    const now = new Date();
    const exportScope = scope === 'all' ? 'all' : 'one';
    const file = await this.attendance.exportSheetExcel(user, {
      employeeId: employeeId || undefined,
      year: year ? Number(year) : now.getFullYear(),
      month: month ? Number(month) : now.getMonth() + 1,
      scope: exportScope,
    });
    return this.file(file);
  }

  @Get('attendance/records/:employeeId/:date')
  recordDetail(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
  ) {
    return this.attendance.recordDetail(user, employeeId, date);
  }

  @Post('attendance/system-logout/run')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  runSystemLogout() {
    return this.attendance.applySystemLogouts(new Date());
  }

  @Get('attendance/audit')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  audit(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.auditLogs(user, { employeeId, from, to });
  }

  @Post('attendance/manual')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  manualMark(@CurrentUser() user: AuthUser, @Body() dto: ManualMarkDto) {
    return this.attendance.manualMark(user, dto);
  }

  @Put('attendance/:employeeId/:date')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  correct(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.attendance.correct(user, employeeId, date, dto);
  }

  @Get('attendance/counters')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  counters(@CurrentUser() user: AuthUser) {
    return this.attendance.counters(user.companyId);
  }

  @Get('attendance/biometric-devices')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  devices(@CurrentUser() user: AuthUser) {
    return this.attendance.biometricDevices(user.companyId);
  }

  @Get('attendance/team')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
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
