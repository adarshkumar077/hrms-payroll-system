import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode, ShiftChangeStatus } from '@prisma/client';
import { ShiftsService } from './shifts.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AssignShiftDto,
  BulkAssignShiftDto,
  CreateShiftDto,
  ReviewShiftChangeDto,
  ShiftChangeRequestDto,
  UpdateShiftDto,
} from './dto/shift.dto';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller()
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get('shifts')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.ADMIN)
  list(@CurrentUser() user: AuthUser) {
    return this.shifts.listShifts(user.companyId);
  }

  @Post('shifts/seed-defaults')
  @Roles(RoleCode.CEO, RoleCode.HR)
  seed(@CurrentUser() user: AuthUser) {
    return this.shifts.ensureDefaultShifts(user.companyId);
  }

  @Post('shifts')
  @Roles(RoleCode.CEO, RoleCode.HR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShiftDto) {
    return this.shifts.createShift(user.companyId, user.id, dto);
  }

  @Put('shifts/:id')
  @Roles(RoleCode.CEO, RoleCode.HR)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.updateShift(user.companyId, user.id, id, dto);
  }

  @Get('shifts/roster')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  roster(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from ?? new Date().toISOString().slice(0, 10);
    const t = to ?? f;
    return this.shifts.roster(user.companyId, f, t);
  }

  @Post('shifts/assign')
  @Roles(RoleCode.CEO, RoleCode.HR)
  assign(@CurrentUser() user: AuthUser, @Body() dto: AssignShiftDto) {
    return this.shifts.assign(user.companyId, user.id, dto);
  }

  @Post('shifts/assign/bulk')
  @Roles(RoleCode.CEO, RoleCode.HR)
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkAssignShiftDto) {
    return this.shifts.bulkAssign(user.companyId, user.id, dto);
  }

  @Get('me/shift')
  myShift(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.shifts.myShift(user, date);
  }

  @Post('me/shift-change')
  requestChange(@CurrentUser() user: AuthUser, @Body() dto: ShiftChangeRequestDto) {
    return this.shifts.requestChange(user, dto);
  }

  @Get('shift-changes')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  listChanges(@CurrentUser() user: AuthUser, @Query('status') status?: ShiftChangeStatus) {
    return this.shifts.listChangeRequests(user.companyId, status);
  }

  @Post('shift-changes/:id/review')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewShiftChangeDto,
  ) {
    return this.shifts.reviewChange(user, id, dto);
  }
}
