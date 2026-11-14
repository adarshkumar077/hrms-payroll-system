import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_PASSWORD_CHANGE_KEY = 'allowDuringPasswordChange';

/**
 * Marks a route as usable while the user still has `forcePasswordChange` set
 * (change-password, logout, refresh, auth/me). Every other authenticated route returns
 * 403 { code: 'PASSWORD_CHANGE_REQUIRED' } until the password is changed.
 */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);
