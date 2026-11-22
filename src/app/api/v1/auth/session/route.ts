import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";
import { clientKey, sessionLimiter } from "@/server/rate-limit";

/** GET /api/v1/auth/session — who is signed in on this browser (wallet address only), or null. */
export async function GET(request: NextRequest) {
  const limit = sessionLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const user = await currentUser(request);
    return ok({ address: user?.address ?? null }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
