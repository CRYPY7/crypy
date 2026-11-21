import { type NextRequest } from "next/server";
import { getAddress } from "viem";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedApprovals } from "@/server/services/approvals";
import { apiChains } from "@/server/services/chain-scope";

/**
 * GET /api/v1/address/{address}/approvals — a wallet's approvals on every supported chain, each allowance read
 * on-chain, with risks. Optional ?chains=used|all|bsc,ethereum narrows the chains (default: all). Read-only, rate-limited, cached about 20 seconds. Nothing is stored.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("INVALID_INPUT");
  try {
    const owner = getAddress(address.toLowerCase());
    const chains = await apiChains(owner, "approvals", request.nextUrl.searchParams.get("chains"));
    if (chains === null) return fail("INVALID_INPUT");
    const report = await cachedApprovals(owner, chains);
    return ok(report, { sources: ["rpc", "goplus"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
