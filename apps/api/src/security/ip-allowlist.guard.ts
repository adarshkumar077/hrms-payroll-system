import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SecurityService } from './security.service';

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    const fwd = req.headers?.['x-forwarded-for'];
    const ip =
      (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) ||
      req.ip ||
      req.socket?.remoteAddress;

    // Authenticated: use user company
    if (req.user?.companyId) {
      const list = await this.security.getIpAllowlist(req.user.companyId);
      this.security.assertIpAllowed(ip, list);
      return true;
    }

    // Public auth: check first active company allowlist (or body.companyId)
    if (isPublic) {
      const companyId = req.body?.companyId as string | undefined;
      if (companyId) {
        const list = await this.security.getIpAllowlist(companyId);
        this.security.assertIpAllowed(ip, list);
      }
      return true;
    }

    return true;
  }
}
