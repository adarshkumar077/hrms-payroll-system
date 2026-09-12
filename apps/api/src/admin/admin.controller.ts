import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import {
  ChangeUserRoleDto,
  CreateManagedUserDto,
  ResetUserPasswordDto,
  UpdateManagedUserDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@Roles(RoleCode.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('login-sessions')
  listLoginSessions(
    @CurrentUser() user: AuthUser,
    @Query('filter') filter?: string,
    @Query('userId') userId?: string,
  ) {
    return this.admin.listLoginSessions(user, { filter, userId });
  }

  @Get('users')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  listUsers(@CurrentUser() user: AuthUser) {
    return this.admin.listUsers(user);
  }

  @Post('users')
  createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateManagedUserDto) {
    return this.admin.createUser(user, dto);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateManagedUserDto,
  ) {
    return this.admin.updateUser(user, id, dto);
  }

  @Post('users/:id/activate')
  activateUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.activateUser(user, id);
  }

  @Post('users/:id/deactivate')
  deactivateUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.deactivateUser(user, id);
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.admin.resetPassword(user, id, dto);
  }

  @Patch('users/:id/role')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    return this.admin.changeRole(user, id, dto);
  }

  @Delete('users/:id/permanent')
  permanentDelete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.permanentDeleteUser(user, id);
  }

  @Get('permissions')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  permissions(@CurrentUser() user: AuthUser) {
    return this.admin.listPermissions(user);
  }

  @Put('permissions')
  upsertPermission(
    @CurrentUser() user: AuthUser,
    @Body() body: { roleCode: RoleCode; moduleKey: string; access: string },
  ) {
    return this.admin.upsertPermission(user, body);
  }

  @Get('devices')
  devices(@CurrentUser() user: AuthUser) {
    return this.admin.listDevices(user);
  }

  @Post('sessions/:id/force-logout')
  forceLogout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.forceLogout(user, id);
  }

  @Get('login-logs')
  loginLogs(@CurrentUser() user: AuthUser) {
    return this.admin.listLoginLogs(user);
  }
}
