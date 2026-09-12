export function getApiBaseUrl(): string {
  // Browser always uses same-origin `/api/v1` (Next.js rewrites to the API).
  // That way http://localhost:3000 and https://*.trycloudflare.com both work;
  // never point the browser at localhost:3001 from a public URL.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/v1`;
  }
  if (process.env.API_INTERNAL_URL) return `${process.env.API_INTERNAL_URL}/api/v1`;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
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

function friendlyMessage(status: number, body: { message?: string | string[] }): string {
  const raw = body.message;
  const apiMessage = Array.isArray(raw) ? raw.join(', ') : raw;
  // Prefer API message for client errors (including login failures)
  if (apiMessage && status >= 400 && status < 500) return apiMessage;
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
      return apiMessage ?? 'A record with this value already exists.';
    case 503:
      return 'Server temporarily unavailable.';
    default:
      return status >= 500 ? 'Something went wrong. Please try again.' : (apiMessage ?? 'Request failed.');
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  if (auth) {
    const token = getToken();
    if (token) h.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...rest, headers: h }).catch(() => {
    throw new ApiError('Unable to reach the server. Please ensure the application backend is running.', 0);
  });
  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';
    let body: { message?: string | string[]; requestId?: string } = {};
    if (contentType.includes('application/json')) {
      body = (await res.json().catch(() => ({}))) as typeof body;
    } else {
      const text = await res.text().catch(() => '');
      if (/internal server error/i.test(text)) {
        throw new ApiError('Server error. Please refresh the page or try again shortly.', res.status);
      }
    }
    // Do not wipe session on unauthenticated calls (e.g. failed login)
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
