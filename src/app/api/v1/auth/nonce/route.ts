import type { NextRequest } from "next/server";
import { sameOrigin } from "@/server/auth/request";
import { createNonce } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { authLimiter, clientKey } from "@/server/rate-limit";

/** POST /api/v1/auth/nonce — a one-time code for the sign-in message (valid 10 minutes, usable once). */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = authLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const { nonce, expiresAt } = await createNonce();
    return ok({ nonce, expiresAt: expiresAt.toISOString() }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
