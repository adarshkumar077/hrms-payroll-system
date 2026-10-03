export function getApiBaseUrl(): string {
  // Browser always uses same-origin `/api/v1` (Next.js rewrites to the API on the server).
  // Works for http://localhost:3000, http://192.168.1.69:3000, and public tunnels —
  // never point the browser at localhost:3001 from another device.
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    if (!hostname) {
      return 'http://192.168.1.69:3000/api/v1';
    }
    // Mobile UA stuck on a localhost bookmark would never reach the laptop API.
    if (
      (hostname === '127.0.0.1' || hostname === 'localhost') &&
      /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    ) {
      const p = port || (protocol === 'https:' ? '443' : '80');
      const hostPort = p === '80' || p === '443' ? '' : `:${p}`;
      return `${protocol}//192.168.1.69${hostPort}/api/v1`;
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

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('eitf_access_token');
}

export function setSession(accessToken: string, refreshToken: string, user: SessionUser) {
  localStorage.setItem('eitf_access_token', accessToken);
  localStorage.setItem('eitf_refresh_token', refreshToken);
  localStorage.setItem('eitf_user', JSON.stringify(user));
}

export function updateStoredUser(patch: Partial<SessionUser>) {
  const current = getStoredUser();
  if (!current) return null;
  const next = { ...current, ...patch };
  localStorage.setItem('eitf_user', JSON.stringify(next));
  return next;
}

export function clearSession() {
  localStorage.removeItem('eitf_access_token');
  localStorage.removeItem('eitf_refresh_token');
  localStorage.removeItem('eitf_user');
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('eitf_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
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
  // Cover Nest --watch recompiles (~5–15s) without infinite loops.
  const maxRetries = Math.max(0, Math.min(options.retries ?? 3, 4));
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

async function apiOnce<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, retries: _retries, timeoutMs = 12_000, signal, ...rest } = options;
  const h = new Headers(headers);
  if (rest.body != null && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getToken();
    if (token) h.set('Authorization', `Bearer ${token}`);
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

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';
    let body: { message?: string | string[]; requestId?: string } = {};
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
      clearSession();
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    throw new ApiError(friendlyMessage(res.status, body), res.status, body.requestId);
  }
  return res.json() as Promise<T>;
}
