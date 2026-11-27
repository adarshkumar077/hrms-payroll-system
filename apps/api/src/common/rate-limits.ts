/**
 * Per-IP rate limits. Every person in an office behind one router shares a single public IP, so
 * per-IP ceilings must allow the whole office's normal morning sign-in. Brute force against an
 * individual account is stopped separately (account lockout, per-mobile OTP limits, 5 wrong codes).
 * Override with environment variables; read once at startup.
 */
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const RATE_LIMITS = {
  /** All API requests, per IP per minute. */
  generalPerMinute: Math.max(60, envInt('THROTTLE_LIMIT_PER_MINUTE', 1200)),
  /** Password login attempts, per IP per minute. */
  loginPerMinute: envInt('AUTH_LOGIN_LIMIT_PER_MINUTE', 60),
  /** Token refreshes, per IP per minute (each open tab refreshes about every 15 minutes). */
  refreshPerMinute: envInt('AUTH_REFRESH_LIMIT_PER_MINUTE', 120),
  /** OTP requests, per IP per minute. */
  otpRequestPerMinute: envInt('OTP_REQUEST_LIMIT_PER_MINUTE', 30),
  /** OTP verifications, per IP per minute. */
  otpVerifyPerMinute: envInt('OTP_VERIFY_LIMIT_PER_MINUTE', 60),
  /** OTP requests, per IP per hour (stored in the database, survives restarts). */
  otpRequestPerIpPerHour: envInt('OTP_MAX_PER_IP_PER_HOUR', 300),
} as const;
