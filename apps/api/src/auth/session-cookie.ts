import { ForbiddenException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

/**
 * Browser session transport (audit H1 / T12).
 *
 * - Web (opt-in via `X-Client: web`): the refresh token lives ONLY in an httpOnly cookie scoped to
 *   `/<prefix>/auth`; it is never put in the JSON body, so page JavaScript (and therefore an XSS
 *   payload) cannot read it. The access token is returned in the body and kept in memory only.
 * - Mobile / API clients (no `X-Client: web`): unchanged contract — `refreshToken` in the body,
 *   sent back in the body to /auth/refresh and /auth/logout. No cookie is set for them.
 *
 * CSRF: when the refresh token is taken from the cookie (the only ambient credential this API
 * honours), the request must also carry `X-CSRF: 1`. Browsers cannot attach a custom header to a
 * cross-site request without a CORS preflight, which the API's origin allowlist rejects; together
 * with `SameSite=Strict` this blocks cross-site refresh/logout. A double-submit token is not needed
 * because no other route accepts cookie authentication (all others require a bearer header).
 */
export const REFRESH_COOKIE = 'eitf_rt';
export const CSRF_HEADER = 'x-csrf';
export const CLIENT_HEADER = 'x-client';

type ConfigLike = { get<T = string>(key: string, fallback?: T): T | undefined };

export function refreshTtlDays(config: ConfigLike): number {
  const raw = String(config.get('JWT_REFRESH_TTL', '7d') ?? '7d');
  const n = raw.endsWith('d') ? Number(raw.slice(0, -1)) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export function refreshCookiePath(config: ConfigLike): string {
  const prefix = String(config.get('API_PREFIX', 'api/v1') ?? 'api/v1').replace(/^\/+|\/+$/g, '');
  return `/${prefix}/auth`;
}

/** Secure by default; set COOKIE_SECURE=false only for plain-http local dev. */
export function cookieSecure(config: ConfigLike): boolean {
  return String(config.get('COOKIE_SECURE', 'true') ?? 'true').toLowerCase() !== 'false';
}

export function refreshCookieOptions(config: ConfigLike): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: 'strict',
    path: refreshCookiePath(config),
    maxAge: refreshTtlDays(config) * 24 * 60 * 60 * 1000,
  };
}

export function isWebClient(req: Request): boolean {
  return String(req.headers[CLIENT_HEADER] ?? '').trim().toLowerCase() === 'web';
}

export function hasCsrfHeader(req: Request): boolean {
  return String(req.headers[CSRF_HEADER] ?? '').trim() === '1';
}

export function assertCsrfHeader(req: Request): void {
  if (!hasCsrfHeader(req)) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'CSRF_HEADER_REQUIRED',
      message: 'Missing X-CSRF header.',
    });
  }
}

/** Body wins (mobile); otherwise the httpOnly cookie (web). */
export function readRefreshToken(
  req: Request,
  bodyToken?: string | null,
): { token: string | null; source: 'body' | 'cookie' | null } {
  const fromBody = typeof bodyToken === 'string' ? bodyToken.trim() : '';
  if (fromBody) return { token: fromBody, source: 'body' };
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[REFRESH_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return { token: fromCookie, source: 'cookie' };
  return { token: null, source: null };
}

export function setRefreshCookie(res: Response, config: ConfigLike, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(res: Response, config: ConfigLike): void {
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions(config);
  res.clearCookie(REFRESH_COOKIE, opts);
}

/**
 * Shapes a session response for the caller. Web gets the refresh token as a cookie and the body
 * without `refreshToken`; everyone else gets the original body unchanged.
 */
export function deliverSession<T extends { refreshToken: string }>(
  req: Request,
  res: Response,
  config: ConfigLike,
  session: T,
  forceWeb = false,
): T | Omit<T, 'refreshToken'> {
  if (!forceWeb && !isWebClient(req)) return session;
  setRefreshCookie(res, config, session.refreshToken);
  const { refreshToken: _omit, ...rest } = session;
  return rest;
}
