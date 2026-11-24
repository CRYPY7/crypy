import "server-only";
import { countToday } from "@/server/health/counters";

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
    if (!allowed) countToday("rateLimit.refused", now);
    return {
      allowed,
      remaining: Math.max(0, limit - window.count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((window.resetAt - now) / 1000),
    };
  };
}

/**
 * The visitor's IP address as set by our own proxy, used only as a rate-limit key (never stored or logged).
 *
 * Security review (M9): the first `X-Forwarded-For` entry is whatever the visitor sent, so using it let anyone pick a
 * fresh key per request. Now, in order: `X-Real-IP` (nginx on the VPS sets it to the connecting address, replacing
 * any sent by the visitor; Vercel sets it too), else the **last** `X-Forwarded-For` entry (the one our proxy added).
 * IPv6 addresses count per /64 network, since one connection usually controls a whole /64.
 */
export function clientKey(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = realIp || forwarded;
  return ip ? normalizeIp(ip) : "unknown";
}

/** IPv4 as is; IPv6 reduced to its first four groups (the /64 network). Anything else is kept, capped in length. */
export function normalizeIp(ip: string): string {
  const value = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return mapped[1]!;
  if (!value.includes(":") || !/^[0-9a-f:.%a-z]+$/.test(value)) return value.slice(0, 64);
  const [head = "", tail = ""] = value.split("%")[0]!.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = value.includes("::") ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array<string>(Math.max(0, missing)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, "") || "0")
    .join(":")}::/64`;
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
/** Batch scan jobs: starting a scan (the job itself is limited by the scan manager's caps). */
export const scanStartLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
/** Batch scan jobs: progress checks (the page asks about once a second) and pause / resume / cancel. */
export const scanPollLimiter = createRateLimiter({ limit: 300, windowMs: 60_000 });
/**
 * Portfolio: one request per wallet (up to 20 wallets), so opening or refreshing a full portfolio is about 20 calls.
 * Its own budget, so it doesn't use up a visitor's searches.
 */
export const portfolioLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** M8: sign-in steps (one-time code, signature check). Low, since a person signs in rarely. */
export const authLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
/** M9 security review: "who is signed in?" (asked on page loads), so it can't be used to load the database freely. */
export const sessionLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
/** M8: a signed-in person's own data (watchlist, account). */
export const accountLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
