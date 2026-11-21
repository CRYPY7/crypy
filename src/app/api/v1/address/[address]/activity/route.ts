import { type NextRequest } from "next/server";
import { getAddress } from "viem";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedActivity, formatCursor } from "@/server/services/activity";

/**
 * GET /api/v1/address/{address}/activity?cursor=bsc:123,ethereum:456 — the wallet's transfers on every supported
 * chain, newest first, with the cursor for older ones. Read-only, rate-limited, cached about a minute. Nothing stored.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("INVALID_INPUT");
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor !== null && !/^[a-z0-9]+:\d+(,[a-z0-9]+:\d+)*$/.test(cursor)) return fail("INVALID_INPUT");
  try {
    const report = await cachedActivity(getAddress(address.toLowerCase()), cursor);
    return ok({ ...report, next: formatCursor(report.chains) }, { sources: ["rpc", "alchemy"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
