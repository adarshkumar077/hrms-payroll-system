import { SessionUser } from './api';

export type ViewMode = 'admin' | 'employee';

export function isSuperAdmin(user: SessionUser | null): boolean {
  return user?.roles.includes('SUPER_ADMIN') ?? false;
}

/** @deprecated use isSuperAdmin */
export const isCeo = isSuperAdmin;

export function isHr(user: SessionUser | null): boolean {
  return user?.roles.includes('HR') ?? false;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'HR') ?? false;
}

/** HR and Super Admin may mark / edit / correct any employee's attendance. */
export function canManageAttendance(user: SessionUser | null): boolean {
  return user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR') ?? false;
}

export function isOpsAdmin(user: SessionUser | null): boolean {
  return user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN') ?? false;
}

export function canAccessCrm(user: SessionUser | null): boolean {
  return isOpsAdmin(user) || isHr(user);
}

export function isEmployeeUser(user: SessionUser | null): boolean {
  if (!user?.employeeId) return false;
  return user.roles.includes('EMPLOYEE') && !isAdmin(user);
}

export function hasAnyRole(user: SessionUser | null, roles: string[]): boolean {
  return user?.roles.some((r) => roles.includes(r)) ?? false;
}

export function getPersonaLabel(user: SessionUser | null, viewMode: ViewMode): string {
  if (!user) return 'Guest';
  if (isSuperAdmin(user)) return 'Super Admin';
  if (isOpsAdmin(user) && !isHr(user)) return 'Admin';
  if (viewMode === 'employee') return 'Employee';
  if (isHr(user)) return 'HR';
  return 'Employee';
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  EMPLOYEE: 'Employee',
};

export function formatRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function formatRoleList(roles: string[]): string {
  return roles.map(formatRoleLabel).join(' · ');
}
