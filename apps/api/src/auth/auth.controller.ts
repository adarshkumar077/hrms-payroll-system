import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AllowDuringPasswordChange } from './decorators/allow-during-password-change.decorator';
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
import {
  assertCsrfHeader,
  clearRefreshCookie,
  deliverSession,
  isWebClient,
  readRefreshToken,
} from './session-cookie';

/**
 * Session transport: see ./session-cookie.ts.
 * - Web sends `X-Client: web` on login → refresh token in httpOnly cookie, omitted from the body.
 * - Mobile sends nothing extra → refresh token in the body (unchanged contract).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private meta(req: Request) {
    return {
      ip: req.ip,
      ua: req.headers['user-agent'],
    };
  }

  /** Whether mobile OTP login is available (an SMS provider is configured). */
  @Public()
  @Get('otp/status')
  otpStatus() {
    return this.auth.otpStatus();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.auth.requestOtp(dto, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return deliverSession(req, res, this.config, await this.auth.verifyOtp(dto, this.meta(req)));
  }

  @Public()
  @Get('setup/status')
  setupStatus() {
    return this.auth.getSetupStatus();
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('setup/super-admin')
  async setupSuperAdmin(
    @Body() dto: SetupSuperAdminDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return deliverSession(
      req,
      res,
      this.config,
      await this.auth.setupSuperAdmin(dto, this.meta(req)),
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return deliverSession(req, res, this.config, await this.auth.loginPassword(dto, this.meta(req)));
  }

  @Public()
  @AllowDuringPasswordChange()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, source } = readRefreshToken(req, dto?.refreshToken);
    if (!token) throw new UnauthorizedException('Missing refresh token');
    // The cookie is an ambient credential: require the custom CSRF header too
    // (SameSite=Strict on the cookie is the second layer).
    if (source === 'cookie') assertCsrfHeader(req);
    try {
      const session = await this.auth.refresh(token, this.meta(req));
      // A cookie-based refresh is by definition the web client: rotate the cookie, omit from body.
      return deliverSession(req, res, this.config, session, source === 'cookie');
    } catch (err) {
      if (source === 'cookie' || isWebClient(req)) clearRefreshCookie(res, this.config);
      throw err;
    }
  }

  @ApiBearerAuth()
  @AllowDuringPasswordChange()
  @Post('logout')
  logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, source } = readRefreshToken(req, dto?.refreshToken);
    if (source === 'cookie') assertCsrfHeader(req);
    if (source === 'cookie' || isWebClient(req)) clearRefreshCookie(res, this.config);
    return this.auth.logout(user.id, token ?? undefined);
  }

  @ApiBearerAuth()
  @AllowDuringPasswordChange()
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
  @AllowDuringPasswordChange()
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
