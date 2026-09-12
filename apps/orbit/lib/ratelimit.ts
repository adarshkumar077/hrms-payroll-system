// Dependency-free in-memory sliding-window rate limiter.
//
// NOTE: state lives in a process-local Map, so limits are enforced PER PROCESS.
// That's fine for this single-instance demo deployment; if Orbit ever runs
// multiple server instances (e.g. serverless, horizontally-scaled containers),
// swap the Map for a shared store (Redis `ZADD`/`ZREMRANGEBYSCORE` sliding
// window, or similar) so limits are enforced across processes.

const hits = new Map<string, number[]>();

/** Sliding-window rate limit check. Records this call as a hit. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = hits.get(key) || [];
  const recent = existing.filter((ts) => ts > windowStart);

  if (recent.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    hits.set(key, recent);
    return { ok: false, retryAfter };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfter: 0 };
}

type HeaderSource = Request | { get(name: string): string | null };

/** Derive a best-effort client IP from proxy headers (fallback "unknown").
 *  Pass a `Request` (API routes) or the `Headers` object from `headers()` (server actions). */
export function clientKey(req: HeaderSource): string {
  const h: { get(name: string): string | null } = req instanceof Request ? req.headers : req;
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
