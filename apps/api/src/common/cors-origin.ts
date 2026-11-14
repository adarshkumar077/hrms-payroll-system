export interface CorsOriginOptions {
  isProd: boolean;
  /** Raw CORS_ORIGINS value (comma separated). */
  corsOrigins?: string;
  publicAppUrl?: string;
}

function safeOrigin(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function isCorsOriginAllowed(origin: string | undefined, opts: CorsOriginOptions): boolean {
  if (!origin) return true;
  const publicOrigin = safeOrigin(opts.publicAppUrl);
  let configured = (opts.corsOrigins ?? opts.publicAppUrl ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (opts.isProd) configured = configured.filter((o) => o !== '*');
  else if (configured.includes('*')) return true;
  if (configured.includes(origin)) return true;
  if (publicOrigin && publicOrigin === origin) return true;
  if (opts.isProd) return false;

  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (
    host.endsWith('.trycloudflare.com') ||
    host.endsWith('.cfargotunnel.com') ||
    /\.ngrok[^.]*\.(app|io|dev)$/.test(host)
  )
    return true;
  return (
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
  );
}

/**
 * Default trust: only loopback / link-local / private-network hops (nginx, cloudflared,
 * Docker bridge). Express then walks X-Forwarded-For from the right, skipping those hops,
 * and stops at the first public address, so req.ip is the real client and a client-supplied
 * X-Forwarded-For prefix is ignored. Works for both "nginx -> api" and
 * "Cloudflare Tunnel -> nginx -> api" without counting hops.
 */
export const DEFAULT_TRUST_PROXY = ['loopback', 'linklocal', 'uniquelocal'];

/** Parse TRUST_PROXY: number, 'true'/'false', or comma-separated subnet / preset list. */
export function parseTrustProxy(raw?: string): number | boolean | string[] {
  const v = (raw ?? '').trim();
  if (!v) return [...DEFAULT_TRUST_PROXY];
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
