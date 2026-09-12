/** Primary Super Admin identities that must never be downgraded by non-super users. */
export const PROTECTED_SUPER_ADMIN_LOGIN_IDS = new Set(['SUPERADMIN', 'superadmin']);
export const PROTECTED_SUPER_ADMIN_EMAILS = new Set(['superadmin@company.com']);

export function isProtectedSuperAdminLoginId(loginId?: string | null): boolean {
  if (!loginId) return false;
  return PROTECTED_SUPER_ADMIN_LOGIN_IDS.has(loginId.trim().toLowerCase());
}

export function isProtectedSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return PROTECTED_SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function isProtectedSuperAdmin(user: {
  loginId?: string | null;
  email?: string | null;
}): boolean {
  return (
    isProtectedSuperAdminLoginId(user.loginId) || isProtectedSuperAdminEmail(user.email)
  );
}

export const PROTECTED_SUPER_ADMIN_MSG =
  'The primary Super Admin account is protected and cannot be modified by others.';
