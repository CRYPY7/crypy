import { type NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedResolve } from "@/server/services/lookups";

const query = z.string().trim().min(1).max(200);

/** GET /api/v1/search/resolve?q=<address or tx hash> → what it is and where it lives. */
export async function GET(request: NextRequest) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = query.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return fail("INVALID_INPUT");

  try {
    const result = await cachedResolve(parsed.data);
    if (result.status === "invalid" || result.status === "bad-checksum") return ok(result, { sources: [] });
    if (result.status === "unavailable") return fail("UPSTREAM_UNAVAILABLE");
    return ok(result, { sources: ["rpc"] });
  } catch {
    return fail("INTERNAL");
  }
}
