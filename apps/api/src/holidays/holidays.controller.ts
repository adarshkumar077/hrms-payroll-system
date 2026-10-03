import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { HolidaysService } from './holidays.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateHolidayDto,
  HolidayImportDto,
  QuickAttendanceDto,
  UpdateHolidayDto,
} from './dto/holiday.dto';

@ApiTags('holidays')
@ApiBearerAuth()
@Controller()
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get('holidays')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  list(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('paid') paid?: string,
    @Query('q') q?: string,
  ) {
    return this.holidays.list(user.companyId, {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      status,
      paid,
      q,
    });
  }

  @Post('holidays')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHolidayDto) {
    return this.holidays.create(user.companyId, user.id, dto);
  }

  @Post('holidays/quick')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  quick(@CurrentUser() user: AuthUser, @Body() dto: QuickAttendanceDto) {
    return this.holidays.quickUpsert(user.companyId, user.id, dto);
  }

  @Post('holidays/import')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  importRows(@CurrentUser() user: AuthUser, @Body() dto: HolidayImportDto) {
    return this.holidays.importRows(user.companyId, user.id, dto);
  }

  @Get('holidays/audit')
  @Roles(RoleCode.SUPER_ADMIN)
  audit(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.holidays.auditTrail(user, limit ? Number(limit) : 100);
  }

  @Put('holidays/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidays.update(user.companyId, user.id, id, dto);
  }

  @Delete('holidays/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.holidays.remove(user.companyId, user.id, id);
  }

  @Get('me/holidays')
  myCalendar(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    if (!user.employeeId) return { holidays: [], weeklyOffDays: [0], paidSaturday: false };
    return this.holidays.calendarForEmployee(
      user.companyId,
      user.employeeId,
      year ? Number(year) : undefined,
    );
  }

  @Get('employees/:employeeId/holidays')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  employeeCalendar(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.holidays.calendarForEmployee(
      user.companyId,
      employeeId,
      year ? Number(year) : undefined,
    );
  }
}
