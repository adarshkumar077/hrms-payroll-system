export interface BootstrapAdmin {
  loginId: string;
  email: string;
  password: string;
  displayName: string;
}

export type BootstrapAdminResult =
  | { kind: 'create'; admin: BootstrapAdmin }
  | { kind: 'skip'; reason: string };

const DEV_DEFAULT: BootstrapAdmin = {
  loginId: 'admin@eitf.in',
  email: 'admin@eitf.in',
  password: 'Admin@123',
  displayName: 'Super Admin',
};

export const MIN_PROD_PASSWORD_LENGTH = 12;

/** Pure resolver: decides which bootstrap admin (if any) to create from env. */
export function resolveBootstrapAdmin(
  env: Record<string, string | undefined>,
): BootstrapAdminResult {
  const isProd = env.NODE_ENV === 'production';
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  const loginId = env.BOOTSTRAP_ADMIN_LOGIN_ID?.trim();

  if (isProd) {
    if (!email || !password) {
      return {
        kind: 'skip',
        reason:
          'BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set in production; no user created. ' +
          'Create the first admin via POST /api/v1/auth/setup/super-admin, or set both env vars and restart.',
      };
    }
    if (password.length < MIN_PROD_PASSWORD_LENGTH) {
      return {
        kind: 'skip',
        reason: `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PROD_PASSWORD_LENGTH} characters; no user created.`,
      };
    }
  }

  const resolvedEmail = email || DEV_DEFAULT.email;
  return {
    kind: 'create',
    admin: {
      loginId: loginId || resolvedEmail,
      email: resolvedEmail,
      password: password || DEV_DEFAULT.password,
      displayName: DEV_DEFAULT.displayName,
    },
  };
}
