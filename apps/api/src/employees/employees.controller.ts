import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { EmployeePayrollService } from './employee-payroll.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateEmployeeDto,
  ChangeUsernameDto,
  EmployeeQueryDto,
  ResetCredentialsDto,
  UpdateEmployeeDto,
  UpdateEmployeeStatusDto,
  UpdateMyProfileDto,
} from './dto/employee.dto';
import { PayrollConfigBodyDto } from './dto/payroll-config.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller()
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly employeePayroll: EmployeePayrollService,
  ) {}

  @Get('employees')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN, RoleCode.ADMIN)
  list(@CurrentUser() user: AuthUser, @Query() query: EmployeeQueryDto) {
    return this.employees.list(user.companyId, query);
  }

  @Post('employees')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Get('employees/next-code')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  nextCode(@CurrentUser() user: AuthUser) {
    return this.employees.suggestNextCode(user.companyId);
  }

  @Get('employees/check-code')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  checkCode(
    @CurrentUser() user: AuthUser,
    @Query('code') code: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.employees.isEmployeeCodeAvailable(user.companyId, code ?? '', excludeId);
  }

  @Get('employees/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN, RoleCode.ADMIN)
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.getById(user.companyId, id);
  }

  @Put('employees/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, dto);
  }

  @Patch('employees/:id/status')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ) {
    return this.employees.updateStatus(user, id, dto);
  }

  @Post('employees/:id/credentials/reset')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  resetCredentials(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ResetCredentialsDto,
  ) {
    return this.employees.resetCredentials(user, id, body);
  }

  @Get('employees/:id/login-info')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  loginInfo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.getLoginInfo(user, id);
  }

  @Patch('employees/:id/username')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  changeUsername(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeUsernameDto,
  ) {
    return this.employees.changeUsername(user, id, dto.username);
  }

  @Post('employees/:id/account/lock')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  lockAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.setAccountLock(user, id, true);
  }

  @Post('employees/:id/account/unlock')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  unlockAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.setAccountLock(user, id, false);
  }

  /** Soft-remove: deactivate employee + disable login. CEO/HR. */
  @Delete('employees/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    return this.employees.remove(user, id, reason);
  }

  @Get('me/profile')
  myProfile(@CurrentUser() user: AuthUser) {
    return this.employees.getMe(user);
  }

  @Get('me/salary-tracker')
  mySalaryTracker(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    return this.employeePayroll.salaryTracker(
      user,
      user.employeeId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('employees/:id/payroll-config')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  getPayrollConfig(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employeePayroll.getConfig(user, id);
  }

  @Put('employees/:id/payroll-config')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  upsertPayrollConfig(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PayrollConfigBodyDto,
  ) {
    return this.employeePayroll.upsertConfig(user, id, dto);
  }

  @Get('employees/:id/payroll-history')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  payrollHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employeePayroll.payrollHistory(user, id);
  }

  @Get('employees/:id/salary-tracker')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  salaryTracker(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.employeePayroll.salaryTracker(
      user,
      id,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Put('me/profile')
  updateMyProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateMyProfileDto) {
    return this.employees.updateMyProfile(user, dto);
  }
}
