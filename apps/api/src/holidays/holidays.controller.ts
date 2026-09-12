import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { HolidaysService } from './holidays.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateHolidayDto, UpdateHolidayDto } from './dto/holiday.dto';

@ApiTags('holidays')
@ApiBearerAuth()
@Controller()
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get('holidays')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  list(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.holidays.list(user.companyId, year ? Number(year) : undefined);
  }

  @Post('holidays')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHolidayDto) {
    return this.holidays.create(user.companyId, user.id, dto);
  }

  @Put('holidays/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidays.update(user.companyId, user.id, id, dto);
  }

  @Delete('holidays/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
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
