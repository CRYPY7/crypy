import "server-only";

/**
 * Fixed-window rate limiter. Protects free API quotas from bots and abuse.
 * In-memory per server instance for now (free); a shared Redis store can replace it
 * later without changing callers.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}) {
  const windows = new Map<string, Window>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      if (windows.size >= maxKeys) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
      }
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    const allowed = window.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - window.count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((window.resetAt - now) / 1000),
    };
  };
}

/** Best-effort client IP from proxy headers. Used only as a rate-limit key; never stored. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export const searchLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
/**
 * Endpoints answered from one shared cache (Gas Tracker): nearly free per call, and an open page polls every 12 s,
 * so they get their own, larger budget instead of using up a visitor's searches.
 */
export const sharedCacheLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
/** Timestamp & Block Converter: each lookup reads block headers on every chain. Its own budget. */
export const blocksLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
export const healthLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
export const pageLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
/** Batch Balance Scanner: one request = up to 100 addresses on one chain; a full 500 × 2 scan is 10 requests. */
export const batchLimiter = createRateLimiter({ limit: 40, windowMs: 60_000 });
