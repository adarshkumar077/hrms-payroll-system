export function getApiBaseUrl(): string {
  // Browser always uses same-origin `/api/v1` (Next.js rewrites to the API on the server).
  // Works for localhost, your LAN address, and public tunnels —
  // never point the browser at localhost:3001 from another device.
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    if (!hostname) {
      return '/api/v1';
    }
    // Dev only: a phone stuck on a localhost bookmark would never reach the laptop API.
    // Set NEXT_PUBLIC_LAN_HOST (e.g. your laptop's LAN IP) to redirect it there.
    const lanHost = process.env.NEXT_PUBLIC_LAN_HOST;
    if (
      lanHost &&
      (hostname === '127.0.0.1' || hostname === 'localhost') &&
      /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    ) {
      const p = port || (protocol === 'https:' ? '443' : '80');
      const hostPort = p === '80' || p === '443' ? '' : `:${p}`;
      return `${protocol}//${lanHost}${hostPort}/api/v1`;
    }
    return `${origin}/api/v1`;
  }
  if (process.env.API_INTERNAL_URL) return `${process.env.API_INTERNAL_URL}/api/v1`;
  // Never ship a localhost NEXT_PUBLIC URL to browsers on the LAN.
  if (
    process.env.NEXT_PUBLIC_API_URL &&
    !/localhost|127\.0\.0\.1/i.test(process.env.NEXT_PUBLIC_API_URL)
  ) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return '/api/v1';
}

export type SessionUser = {
  id: string;
  companyId: string;
  loginId?: string | null;
  email?: string | null;
  mobile?: string | null;
  displayName: string;
  roles: string[];
  employeeId?: string | null;
  moduleAccess: string[];
  totpEnabled?: boolean;
  forcePasswordChange?: boolean;
};

/*
 * Session model (audit H1 / T12)
 * - Refresh token: httpOnly `eitf_rt` cookie set by the API (Path=/api/v1/auth, SameSite=Strict).
 *   Page JavaScript never sees it.
 * - Access token: this module variable only (memory). Lost on reload; restored by a silent
 *   POST /auth/refresh (see initSession), which PortalShell awaits before rendering pages.
 * - Display profile (no secrets): sessionStorage `eitf_user`, so synchronous getStoredUser()
 *   callers keep working. Never tokens.
 */
let accessToken: string | null = null;
let sessionPromise: Promise<SessionUser | null> | null = null;
const USER_KEY = 'eitf_user';
const LEGACY_LOCAL_KEYS = ['eitf_access_token', 'eitf_refresh_token', 'eitf_user'];
/** Headers for cookie-authenticated auth calls: opt into the web contract + CSRF guard. */
const WEB_AUTH_HEADERS = { 'X-Client': 'web', 'X-CSRF': '1' } as const;
export const PASSWORD_CHANGE_PATH = '/account/password';

function purgeLegacyStorage() {
  try {
    for (const k of LEGACY_LOCAL_KEYS) localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
}
if (typeof window !== 'undefined') purgeLegacyStorage();

export function getToken(): string | null {
  return accessToken;
}

export function setSession(token: string, user: SessionUser) {
  accessToken = token;
  writeStoredUser(user);
}

function writeStoredUser(user: SessionUser) {
  try {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage blocked */
  }
}

export function updateStoredUser(patch: Partial<SessionUser>) {
  const current = getStoredUser();
  if (!current) return null;
  const next = { ...current, ...patch };
  writeStoredUser(next);
  return next;
}

/** Local-only: forget the in-memory token and cached profile. Use logout() to end the session. */
export function clearSession() {
  accessToken = null;
  sessionPromise = null;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  purgeLegacyStorage();
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

type SessionResponse = {
  accessToken: string;
  user: SessionUser;
  forcePasswordChange?: boolean;
};

/** Store a login/refresh response (web contract: no refreshToken in body). */
export function acceptSession(data: SessionResponse): SessionUser {
  const user = {
    ...data.user,
    forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
  };
  setSession(data.accessToken, user);
  return user;
}

let refreshInFlight: Promise<SessionUser | null> | null = null;

async function doRefresh(): Promise<SessionUser | null> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...WEB_AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    throw new ApiError('Unable to reach the server. Please ensure the application backend is running.', 0);
  }
  if (res.status === 401 || res.status === 403) {
    clearSession();
    return null;
  }
  if (!res.ok) throw new ApiError('Could not restore your session. Please try again.', res.status);
  return acceptSession((await res.json()) as SessionResponse);
}

/**
 * Single-flight silent refresh using the httpOnly cookie. Concurrent callers share one request;
 * across tabs, the Web Locks API serialises refreshes so two tabs never spend the same
 * (single-use, rotating) refresh cookie at once.
 */
export function refreshSession(): Promise<SessionUser | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!refreshInFlight) {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    const run = locks?.request ? locks.request('eitf-session-refresh', () => doRefresh()) : doRefresh();
    refreshInFlight = (run as Promise<SessionUser | null>).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Called once per page load: returns the signed-in user (restoring the access token) or null. */
export function initSession(): Promise<SessionUser | null> {
  if (accessToken) return Promise.resolve(getStoredUser());
  if (!sessionPromise) {
    sessionPromise = refreshSession().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/** Ends the server session (revokes the refresh cookie) and clears local state. */
export async function logout(): Promise<void> {
  try {
    const h = new Headers({ ...WEB_AUTH_HEADERS, 'Content-Type': 'application/json' });
    if (accessToken) h.set('Authorization', `Bearer ${accessToken}`);
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: h,
      body: '{}',
    });
  } catch {
    /* best effort — local state is cleared regardless */
  }
  clearSession();
}

function redirectToLogin() {
  clearSession();
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

function redirectToPasswordChange() {
  updateStoredUser({ forcePasswordChange: true });
  if (typeof window !== 'undefined' && window.location.pathname !== PASSWORD_CHANGE_PATH) {
    window.location.href = `${PASSWORD_CHANGE_PATH}?required=true`;
  }
}

/**
 * fetch() with the in-memory bearer token for non-JSON calls (downloads, multipart uploads).
 * On 401 it refreshes once and retries; if that fails it signs the user out.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!accessToken) await initSession().catch(() => null);
  const send = () => {
    const h = new Headers(init.headers);
    if (accessToken) h.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers: h });
  };
  let res = await send();
  if (res.status === 401) {
    const user = await refreshSession().catch(() => null);
    if (!user) {
      redirectToLogin();
      return res;
    }
    res = await send();
    if (res.status === 401) redirectToLogin();
  }
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => ({}));
    if ((body as { code?: string }).code === 'PASSWORD_CHANGE_REQUIRED') redirectToPasswordChange();
  }
  return res;
}

export class ApiError extends Error {
  status: number;
  requestId?: string;
  code?: string;

  constructor(message: string, status: number, requestId?: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

function friendlyMessage(status: number, body: { message?: string | string[]; requestId?: string }): string {
  const raw = body.message;
  const apiMessage = Array.isArray(raw) ? raw.join(', ') : raw?.trim();
  if (apiMessage && apiMessage.toLowerCase() !== 'something went wrong. please try again.') {
    return apiMessage;
  }
  switch (status) {
    case 400:
      return 'Invalid request.';
    case 401:
      return 'Invalid User ID/Email or Password.';
    case 403:
      return 'Permission denied.';
    case 404:
      return 'Record not found.';
    case 409:
      return 'A record with this value already exists.';
    case 503:
      return 'Server temporarily unavailable.';
    default:
      if (status >= 500) {
        return body.requestId
          ? `Server error (ref ${body.requestId}). Please try again or contact support.`
          : 'Server error. Please try again.';
      }
      return apiMessage || 'Request failed.';
  }
}

export type ApiOptions = RequestInit & {
  auth?: boolean;
  /** Extra automatic retries on transient outages. Default 1 (bounded — never infinite). */
  retries?: number;
  /** Per-attempt timeout in ms. Default 12000. */
  timeoutMs?: number;
};

export function isConnectionError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.status === 0 ||
      err.status === 502 ||
      err.status === 503 ||
      err.status === 504 ||
      ((err.status === 500 || err.status === 502) &&
        /restarting or unreachable|failed to proxy|econnrefused|internal server error/i.test(
          err.message,
        )) ||
      /restarting or unreachable|unable to reach the server|failed to proxy|econnrefused|timed out/i.test(
        err.message,
      ))
  );
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  // Default 1 retry covers brief Nest restarts without multiplying soft-poll traffic.
  const maxRetries = Math.max(0, Math.min(options.retries ?? 1, 4));
  const delaysMs = [1200, 2500, 4000, 5000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiOnce<T>(path, options);
    } catch (err) {
      lastErr = err;
      if (!isConnectionError(err) || attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delaysMs[Math.min(attempt, delaysMs.length - 1)]));
    }
  }
  throw lastErr;
}

async function apiOnce<T>(path: string, options: ApiOptions = {}, isRetry = false): Promise<T> {
  const { auth = true, headers, retries: _retries, timeoutMs = 12_000, signal, ...rest } = options;
  const h = new Headers(headers);
  if (rest.body != null && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }
  const isAuthRoute = path.startsWith('/auth/');
  if (isAuthRoute) {
    // Opt into the web contract: login/refresh set the httpOnly cookie instead of returning the token.
    for (const [k, v] of Object.entries(WEB_AUTH_HEADERS)) h.set(k, v);
  }
  if (auth) {
    if (!accessToken && typeof window !== 'undefined') await initSession().catch(() => null);
    if (accessToken) h.set('Authorization', `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...rest,
      ...(isAuthRoute ? { credentials: 'include' as RequestCredentials } : {}),
      headers: h,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Check your connection and try again.', 0);
    }
    throw new ApiError(
      'Unable to reach the server. Please ensure the application backend is running.',
      0,
    );
  }
  clearTimeout(timer);
  signal?.removeEventListener('abort', onAbort);

  if (res.status === 401 && auth && !isRetry && typeof window !== 'undefined') {
    // Access token expired or missing: one single-flight refresh, then retry this call once.
    const user = await refreshSession().catch(() => null);
    if (user) return apiOnce<T>(path, options, true);
    redirectToLogin();
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';
    let body: { message?: string | string[]; requestId?: string; code?: string } = {};
    if (contentType.includes('application/json')) {
      body = (await res.json().catch(() => ({}))) as typeof body;
    } else {
      const text = await res.text().catch(() => '');
      if (/internal server error|econnrefused|failed to proxy/i.test(text)) {
        throw new ApiError(
          'Backend is restarting or unreachable. Wait a few seconds, then refresh.',
          res.status,
        );
      }
      if (text.trim()) {
        throw new ApiError(text.slice(0, 300), res.status);
      }
    }
    if (res.status === 401 && auth && typeof window !== 'undefined') {
      redirectToLogin();
    }
    if (res.status === 403 && body.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      redirectToPasswordChange();
    }
    throw new ApiError(friendlyMessage(res.status, body), res.status, body.requestId, body.code);
  }
  return res.json() as Promise<T>;
}
