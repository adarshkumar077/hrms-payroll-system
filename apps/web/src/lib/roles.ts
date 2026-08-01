import { SessionUser } from './api';

export type ViewMode = 'admin' | 'employee';

export function isCeo(user: SessionUser | null): boolean {
  return user?.roles.includes('CEO') ?? false;
}

export function isHr(user: SessionUser | null): boolean {
  return user?.roles.includes('HR') ?? false;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.roles.some((r) => r === 'CEO' || r === 'HR') ?? false;
}

/** Employee panel users who may access HR Assistant (not CEO/HR). */
export function isEmployeeUser(user: SessionUser | null): boolean {
  if (!user?.employeeId) return false;
  return !isAdmin(user);
}

export function isFinance(user: SessionUser | null): boolean {
  return user?.roles.includes('FINANCE') ?? false;
}

export function isManager(user: SessionUser | null): boolean {
  return user?.roles.includes('MANAGER') ?? false;
}

export function hasAnyRole(user: SessionUser | null, roles: string[]): boolean {
  return user?.roles.some((r) => roles.includes(r)) ?? false;
}

export function getPersonaLabel(user: SessionUser | null, viewMode: ViewMode): string {
  if (!user) return 'Guest';
  if (isCeo(user)) return 'Super Admin';
  if (viewMode === 'employee') return 'Employee';
  if (isHr(user)) return 'HR Admin';
  if (isFinance(user)) return 'Finance';
  if (isManager(user)) return 'Manager';
  return 'Employee';
}

const ROLE_LABELS: Record<string, string> = {
  CEO: 'Super Admin',
};

/** User-facing role name (internal role codes stay unchanged). */
export function formatRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function formatRoleList(roles: string[]): string {
  return roles.map(formatRoleLabel).join(' · ');
}
