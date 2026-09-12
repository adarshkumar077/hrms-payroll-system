import { RoleCode } from '@prisma/client';

/** Only 4 roles exist in the enterprise system. */
export const R = {
  SUPER_ADMIN: RoleCode.SUPER_ADMIN,
  ADMIN: RoleCode.ADMIN,
  HR: RoleCode.HR,
  EMPLOYEE: RoleCode.EMPLOYEE,
} as const;

/** Full system access */
export const SUPER_ONLY = [R.SUPER_ADMIN] as RoleCode[];

/** Operational control (Admin + Super Admin) */
export const ADMIN_OPS = [R.SUPER_ADMIN, R.ADMIN] as RoleCode[];

/** HR operations */
export const HR_OPS = [R.SUPER_ADMIN, R.ADMIN, R.HR] as RoleCode[];

/** Any authenticated staff including employees */
export const ALL_ROLES = [R.SUPER_ADMIN, R.ADMIN, R.HR, R.EMPLOYEE] as RoleCode[];

export function isSuperAdmin(roles: string[]) {
  return roles.includes(R.SUPER_ADMIN);
}

export function isAdminRole(roles: string[]) {
  return roles.includes(R.ADMIN) || roles.includes(R.SUPER_ADMIN);
}

export function isHrRole(roles: string[]) {
  return roles.includes(R.HR) || roles.includes(R.ADMIN) || roles.includes(R.SUPER_ADMIN);
}
