import { SessionUser } from './api';
import { isAdmin, isCeo, isHr } from './roles';

/** Post-login landing path by role. */
export function getHomePathForUser(user: SessionUser): string {
  return '/dashboard';
}

export function getDashboardTitle(user: SessionUser | null): string {
  if (!user) return 'Dashboard';
  if (isCeo(user)) return 'Super Admin Dashboard';
  if (isHr(user) && !isCeo(user)) return 'HR Dashboard';
  if (isAdmin(user)) return 'Admin Dashboard';
  return 'Employee Dashboard';
}
