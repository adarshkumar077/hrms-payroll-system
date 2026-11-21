import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Per-request nonce Content-Security-Policy (audit H1 / T12).
 *
 * Next.js reads the nonce from the request's CSP header and stamps it on its own <script> tags;
 * 'strict-dynamic' then trusts the chunks those scripts load. No 'unsafe-inline' for scripts.
 * The root layout reads headers(), so every page renders dynamically and gets a fresh nonce.
 *
 * External hosts actually used by the app (keep this list exact):
 * - connect-src https://nominatim.openstreetmap.org — reverse geocoding on /attendance/mark
 * - frame-src https://maps.google.com https://www.google.com — map embed on /attendance
 * - img-src STORAGE_PUBLIC_ORIGIN — S3/R2 bucket origin(s) serving presigned selfie URLs when
 *   the API runs with STORAGE_DRIVER=s3 (unset for the local driver: links are same-origin)
 * Static security headers (Referrer-Policy, Permissions-Policy, …) are in next.config.js.
 */
/** Comma/space separated origins; anything that is not a plain http(s) origin is dropped. */
function storageOrigins(): string[] {
  return (process.env.STORAGE_PUBLIC_ORIGIN ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((raw) => {
      try {
        const u = new URL(raw);
        return u.protocol === 'https:' || u.protocol === 'http:' ? [u.origin] : [];
      } catch {
        return [];
      }
    });
}

function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' only in `next dev` (React Refresh); never in production builds.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // React `style={}` attributes and Next's injected <style> need inline styles (not scripts).
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...storageOrigins()],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https://nominatim.openstreetmap.org', ...(isDev ? ['ws:', 'wss:'] : [])],
    'media-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ['https://maps.google.com', 'https://www.google.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  // Skip on plain-http deployments (same switch as the API's refresh cookie Secure flag).
  if (!isDev && process.env.COOKIE_SECURE !== 'false') parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/v1/* is proxied JSON; the API sends its own `default-src 'none'` CSP.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  // Block caching of internal docs paths (client also enforces auth)
  if (pathname.startsWith('/docs/')) {
    response.headers.set('Cache-Control', 'no-store');
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      // Skip prefetches: they don't render HTML and would waste a nonce.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
