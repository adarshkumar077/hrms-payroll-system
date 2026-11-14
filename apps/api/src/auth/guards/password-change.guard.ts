import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from '../decorators/allow-during-password-change.decorator';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Runs right after JwtAuthGuard. `req.user.forcePasswordChange` is read from the database on every
 * request by JwtStrategy.validate, so the block lifts as soon as the password is changed (no new
 * token needed).
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { forcePasswordChange?: boolean } | undefined;
    if (!user?.forcePasswordChange) return true;

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE_KEY, targets)) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      code: PASSWORD_CHANGE_REQUIRED,
      message: 'You must change your password before continuing.',
    });
  }
}
