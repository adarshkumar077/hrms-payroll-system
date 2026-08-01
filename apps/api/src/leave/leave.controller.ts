import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { LeaveService } from './leave.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AdjustBalanceDto,
  ApplyLeaveDto,
  EncashLeaveDto,
  ReviewLeaveDto,
} from './dto/leave.dto';

@ApiTags('leave')
@ApiBearerAuth()
@Controller()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('leave/types')
  listTypes(@CurrentUser() user: AuthUser) {
    return this.leave.ensureDefaultTypes(user.companyId);
  }

  @Post('leave/types/seed')
  @Roles(RoleCode.CEO, RoleCode.HR)
  seedTypes(@CurrentUser() user: AuthUser) {
    return this.leave.ensureDefaultTypes(user.companyId);
  }

  @Get('me/leave/balances')
  myBalances(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.leave.myBalances(user, year ? Number(year) : undefined);
  }

  @Get('employees/:employeeId/leave/balances')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  empBalances(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.leave.balancesForEmployee(
      user.companyId,
      employeeId,
      year ? Number(year) : undefined,
    );
  }

  @Post('me/leave/apply')
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyLeaveDto) {
    return this.leave.apply(user, dto);
  }

  @Get('me/leave/applications')
  myApps(@CurrentUser() user: AuthUser) {
    return this.leave.myApplications(user);
  }

  @Put('me/leave/applications/:id/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.cancel(user, id);
  }

  @Get('leave/approvals')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  queue(@CurrentUser() user: AuthUser) {
    return this.leave.approvalQueue(user);
  }

  @Post('leave/approvals/:id/review')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewLeaveDto) {
    return this.leave.review(user, id, dto);
  }

  @Get('leave/calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('search') search?: string,
  ) {
    const f = from ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const t = to ?? new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);
    const scopedEmployeeId =
      employeeId ??
      (user.roles.some((r) => ['CEO', 'HR', 'MANAGER'].includes(r))
        ? undefined
        : user.employeeId ?? undefined);
    // Pure employees without a linked profile must not see company-wide leave data.
    if (
      !user.roles.some((r) => ['CEO', 'HR', 'MANAGER'].includes(r)) &&
      !scopedEmployeeId
    ) {
      return [];
    }
    return this.leave.calendar(
      user.companyId,
      f,
      t,
      scopedEmployeeId,
      status,
      department,
      search,
    );
  }

  @Get('leave/balance-sheet')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  balanceSheet(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.leave.balanceSheet(user.companyId, year ? Number(year) : undefined);
  }

  @Post('leave/accrual/run')
  @Roles(RoleCode.CEO, RoleCode.HR)
  runAccrual(@CurrentUser() user: AuthUser) {
    return this.leave.runMonthlyAccrual(user.companyId);
  }

  @Post('leave/carry-forward/run')
  @Roles(RoleCode.CEO, RoleCode.HR)
  runCarry(@CurrentUser() user: AuthUser, @Query('fromYear') fromYear?: string) {
    const y = fromYear ? Number(fromYear) : new Date().getFullYear() - 1;
    return this.leave.runCarryForward(user.companyId, y);
  }

  @Post('leave/adjust')
  @Roles(RoleCode.CEO, RoleCode.HR)
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustBalanceDto) {
    return this.leave.adjust(user, dto);
  }

  @Post('leave/encash/:employeeId')
  @Roles(RoleCode.CEO, RoleCode.HR)
  encash(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: EncashLeaveDto,
  ) {
    return this.leave.encashForEmployee(user, employeeId, dto);
  }

  @Get('employees/:employeeId/leave/ledger')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  ledger(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.leave.ledger(user.companyId, employeeId);
  }
}
