import type { NextRequest } from "next/server";
import { clearedSessionCookie, sameOrigin, sessionToken } from "@/server/auth/request";
import { signOut } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { authLimiter, clientKey } from "@/server/rate-limit";

/** POST /api/v1/auth/sign-out — ends this session and clears the cookie. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = authLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    await signOut(sessionToken(request));
  } catch {
    // The cookie is cleared either way.
  }
  return ok({ signedOut: true }, { sources: [] }, { headers: { "Set-Cookie": clearedSessionCookie(request) } });
}
