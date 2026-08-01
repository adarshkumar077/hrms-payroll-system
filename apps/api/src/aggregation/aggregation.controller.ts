import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { EssService } from './ess.service';
import { DashboardService } from './dashboard.service';
import { NotificationsService } from './notifications.service';
import { ApplyLeaveDto } from '../leave/dto/leave.dto';
import { MarkAttendanceDto } from '../attendance/dto/attendance.dto';
import { UpdateMyProfileDto } from '../employees/dto/employee.dto';
import { CreateAnnouncementDto, SendNotificationDto } from './dto/aggregation.dto';

@ApiTags('aggregation')
@ApiBearerAuth()
@Controller()
export class AggregationController {
  constructor(
    private readonly ess: EssService,
    private readonly dashboard: DashboardService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Module 19 ESS ----
  @Get('me')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  home(@CurrentUser() user: AuthUser) {
    return this.ess.home(user);
  }

  @Get('me/attendance')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO)
  myAttendance(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.ess.myAttendance(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  // Spec alias — same as existing me/attendance/mark
  @Post('me/attendance/punch')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR)
  punch(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.ess.markAttendance(user, dto);
  }

  @Post('me/leaves')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR)
  leaves(@CurrentUser() user: AuthUser, @Body() dto: ApplyLeaveDto) {
    return this.ess.applyLeave(user, dto);
  }

  @Get('me/payslips')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  payslips(@CurrentUser() user: AuthUser) {
    return this.ess.myPayslips(user);
  }

  @Get('me/reports')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO)
  reports(@CurrentUser() user: AuthUser) {
    return this.ess.myReports(user);
  }

  @Patch('me/profile')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  patchProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateMyProfileDto) {
    return this.ess.patchProfile(user, dto);
  }

  @Get('me/salary')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  salary(@CurrentUser() user: AuthUser) {
    return this.ess.mySalary(user);
  }

  @Get('me/deposits')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  deposits(@CurrentUser() user: AuthUser) {
    return this.ess.myDeposits(user);
  }

  @Get('me/loans')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  loans(@CurrentUser() user: AuthUser) {
    return this.ess.myLoans(user);
  }

  @Get('me/advances')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  advances(@CurrentUser() user: AuthUser) {
    return this.ess.myAdvances(user);
  }

  // ---- Module 23 Dashboards ----
  @Get('dashboard/employee')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  empDash(@CurrentUser() user: AuthUser) {
    return this.dashboard.employeeDashboard(user);
  }

  @Get('dashboard/employee/:id/approval')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  empOverride(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dashboard.employeeApprovalView(user, id);
  }

  @Get('dashboard/hr')
  @Roles(RoleCode.CEO, RoleCode.HR)
  hrDash(@CurrentUser() user: AuthUser) {
    return this.dashboard.hrDashboard(user.companyId);
  }

  @Get('dashboard/ceo')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  ceoDash(@CurrentUser() user: AuthUser, @Query('refresh') refresh?: string) {
    return this.dashboard.ceoDashboard(user.companyId, refresh === '1');
  }

  @Post('dashboard/ceo/refresh')
  @Roles(RoleCode.CEO, RoleCode.HR)
  refreshCeo(@CurrentUser() user: AuthUser) {
    return this.dashboard.refreshCeoMetrics(user.companyId);
  }

  // ---- Module 25 Notifications ----
  @Post('notifications/send')
  @Roles(RoleCode.CEO, RoleCode.HR)
  send(@CurrentUser() user: AuthUser, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user.companyId, dto, user.id);
  }

  @Get('notifications/mine')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  myNotifs(@CurrentUser() user: AuthUser) {
    return this.notifications.myNotifications(user);
  }

  @Get('notifications/:employeeId')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  forEmployee(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.notifications.listForEmployee(user.companyId, employeeId);
  }

  @Patch('notifications/:id/read')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO)
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('notifications/read-all')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user, undefined, true);
  }

  @Post('announcements')
  @Roles(RoleCode.CEO, RoleCode.HR)
  announce(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.notifications.createAnnouncement(user, dto);
  }

  @Get('announcements')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE, RoleCode.FINANCE)
  listAnnouncements(@CurrentUser() user: AuthUser) {
    return this.notifications.listAnnouncements(user.companyId);
  }

  @Post('notifications/wishes/run')
  @Roles(RoleCode.CEO, RoleCode.HR)
  wishes(@CurrentUser() user: AuthUser) {
    return this.notifications.runWishes(user.companyId);
  }
}
