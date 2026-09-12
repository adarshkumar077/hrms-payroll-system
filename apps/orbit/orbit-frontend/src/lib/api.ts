// API client for the Laravel backend. Sanctum bearer token kept in localStorage.
// In dev, Vite proxies /api → http://127.0.0.1:8000 (see vite.config.ts).
// In prod, set VITE_API_URL to the Laravel host (or leave blank if served same-origin).

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "";

const TOKEN_KEY = "orbit_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  status: number;
  body?: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event("orbit:unauthorized"));
    }
    throw new ApiError(res.status, (data && (data.message || data.error)) || `HTTP ${res.status}`, data);
  }
  return data as T;
}

// Flattens Laravel-style validation errors ({ message, errors: { field: [msgs] } })
// into a simple { field: firstMessage } map for form display.
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && err.body && typeof err.body === "object" && err.body.errors && typeof err.body.errors === "object") {
    for (const [field, msgs] of Object.entries(err.body.errors as Record<string, unknown>)) {
      if (Array.isArray(msgs) && msgs.length > 0) {
        out[field] = String(msgs[0]);
      } else if (typeof msgs === "string") {
        out[field] = msgs;
      }
    }
  }
  return out;
}

export const apiGet = <T = any>(p: string) => api<T>(p);
export const apiPost = <T = any>(p: string, body?: any) => api<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T = any>(p: string, body?: any) => api<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T = any>(p: string) => api<T>(p, { method: "DELETE" });

// ── formatting (mirrors lib/format.ts) ──
export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
export const inrLakh = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return inr(n);
};
export const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
