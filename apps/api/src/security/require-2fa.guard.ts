import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityService } from './security.service';

/** Blocks CEO/HR without TOTP when require_2fa_for_admins is on (except 2FA setup routes). */
@Injectable()
export class Require2faGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as
      | { id: string; companyId: string; roles?: string[]; totpEnabled?: boolean }
      | undefined;
    if (!user?.companyId) return true;

    const url: string = String(req.originalUrl ?? req.url ?? '');
    if (
      url.includes('/auth/2fa') ||
      url.includes('/auth/me') ||
      url.includes('/auth/logout') ||
      url.includes('/auth/password')
    ) {
      return true;
    }

    const roles = user.roles ?? [];
    const isAdmin = roles.some((r) => ['CEO', 'HR', 'ADMIN'].includes(r));
    if (!isAdmin) return true;

    const required = await this.security.getSettingBool(
      user.companyId,
      'security.require_2fa_for_admins',
      false,
    );
    if (!required) return true;

    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.id, companyId: user.companyId },
      select: { totpEnabled: true },
    });
    if (!dbUser?.totpEnabled) {
      throw new ForbiddenException(
        '2FA is required for Super Admin/HR. Complete setup via POST /auth/2fa/setup and /auth/2fa/confirm.',
      );
    }
    return true;
  }
}
