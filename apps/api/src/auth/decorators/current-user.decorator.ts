import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  id: string;
  companyId: string;
  email?: string | null;
  mobile?: string | null;
  displayName: string;
  roles: string[];
  employeeId?: string | null;
  moduleAccess: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
