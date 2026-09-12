import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/decorators/current-user.decorator';

const PRIVILEGED = ['SUPER_ADMIN', 'HR', 'ADMIN'] as const;

export function isPrivileged(user: AuthUser): boolean {
  return user.roles.some((r) => (PRIVILEGED as readonly string[]).includes(r));
}

export function isHrOrAbove(user: AuthUser): boolean {
  return user.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r));
}

/** Employees may only access their own employeeId unless privileged. */
export function assertEmployeeScope(user: AuthUser, employeeId: string, message?: string) {
  if (isPrivileged(user)) return;
  if (!user.employeeId || user.employeeId !== employeeId) {
    throw new ForbiddenException(message ?? 'You can only access your own employee data');
  }
}

/** Non-privileged users must have a linked employee profile. */
export function requireLinkedEmployee(user: AuthUser) {
  if (isPrivileged(user)) return user.employeeId;
  if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
  return user.employeeId;
}
