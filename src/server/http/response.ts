import "server-only";

/**
 * Every API response uses the same envelope. Messages are codes, not English text,
 * so the browser shows them in the user's language.
 */
export type ErrorCode =
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL"
  /** M8: no valid sign-in session. */
  | "UNAUTHORIZED"
  /** M8: a state-changing request that didn't come from CRYPY's own pages. */
  | "FORBIDDEN"
  /** M8: e.g. the watchlist is full, or the item is already watched. */
  | "CONFLICT";

export interface ApiMeta {
  sources: string[];
  fetchedAt: string;
  cached?: boolean;
}

export type ApiResult<T> =
  { ok: true; data: T; meta: ApiMeta } | { ok: false; error: { code: ErrorCode; retryable: boolean } };

const noStore = { "Cache-Control": "no-store" };

export function ok<T>(data: T, meta: Omit<ApiMeta, "fetchedAt"> & { fetchedAt?: string }, init?: ResponseInit) {
  const body: ApiResult<T> = { ok: true, data, meta: { fetchedAt: new Date().toISOString(), ...meta } };
  return Response.json(body, { ...init, headers: { ...noStore, ...init?.headers } });
}

const statusFor: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
};

export function fail(code: ErrorCode, headers?: HeadersInit) {
  const body: ApiResult<never> = {
    ok: false,
    error: { code, retryable: code === "RATE_LIMITED" || code === "UPSTREAM_UNAVAILABLE" },
  };
  return Response.json(body, { status: statusFor[code], headers: { ...noStore, ...headers } });
}
