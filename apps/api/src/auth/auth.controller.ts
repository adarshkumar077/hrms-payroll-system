import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import {
  ChangePasswordDto,
  ChangeUsernameDto,
  CreateAdminUserDto,
  LoginPasswordDto,
  LogoutDto,
  RefreshTokenDto,
  RequestOtpDto,
  Setup2faDto,
  SetupSuperAdminDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { Roles } from './decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private meta(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
      ua: req.headers['user-agent'],
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto, this.meta(req));
  }

  @Public()
  @Get('setup/status')
  setupStatus() {
    return this.auth.getSetupStatus();
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('setup/super-admin')
  setupSuperAdmin(@Body() dto: SetupSuperAdminDto, @Req() req: Request) {
    return this.auth.setupSuperAdmin(dto, this.meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginPasswordDto, @Req() req: Request) {
    return this.auth.loginPassword(dto, this.meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    return this.auth.logout(user.id, dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id, user.companyId);
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2faStart(user.id, user.companyId);
  }

  @ApiBearerAuth()
  @Post('2fa/confirm')
  confirm2fa(@CurrentUser() user: AuthUser, @Body() dto: Setup2faDto) {
    return this.auth.setup2faConfirm(user.id, user.companyId, dto.totpCode);
  }

  @ApiBearerAuth()
  @Post('password/change')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(
      user.id,
      user.companyId,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
    );
  }

  @ApiBearerAuth()
  @Post('username/change')
  changeUsername(@CurrentUser() user: AuthUser, @Body() dto: ChangeUsernameDto) {
    return this.auth.changeUsername(user.id, user.companyId, dto.username, dto.currentPassword);
  }

  @ApiBearerAuth()
  @Get('admin-users')
  @Roles(RoleCode.SUPER_ADMIN)
  listAdminUsers(@CurrentUser() user: AuthUser) {
    return this.auth.listAdminUsers(user);
  }

  @ApiBearerAuth()
  @Post('admin-users')
  @Roles(RoleCode.SUPER_ADMIN)
  createAdminUser(@CurrentUser() user: AuthUser, @Body() dto: CreateAdminUserDto) {
    return this.auth.createAdminUser(user, dto);
  }

  @ApiBearerAuth()
  @Delete('admin-users/:id')
  @Roles(RoleCode.SUPER_ADMIN)
  deactivateAdminUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.deactivateAdminUser(user, id);
  }
}
