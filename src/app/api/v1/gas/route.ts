import { type NextRequest } from "next/server";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedGas } from "@/server/services/gas";

/** GET /api/v1/gas — current fees on every supported chain (shared cache, ~10 s). Read-only. */
export async function GET(request: NextRequest) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    return ok(await cachedGas(), { sources: ["rpc"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
