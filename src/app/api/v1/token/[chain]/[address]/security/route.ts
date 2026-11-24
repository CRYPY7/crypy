import { type NextRequest } from "next/server";
import { getChain } from "@/config/chains";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedTokenSecurity } from "@/server/services/lookups";
import { observe } from "@/server/outcomes/record";
import { classifyTokenSecurity } from "@/lib/outcomes/classify";

/**
 * GET /api/v1/token/{chain}/{address}/security — the token security report (facts, checks, counts, comparison).
 * Read-only, rate-limited, cached 5 minutes per token. Never a "safe" verdict.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ chain: string; address: string }> }) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const { chain, address } = await params;
  if (!getChain(chain) || !/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("INVALID_INPUT");
  try {
    const report = await observe("token-security", () => cachedTokenSecurity(chain, address), classifyTokenSecurity);
    if (!report) return fail("NOT_FOUND");
    return ok(report, { sources: ["rpc", "simulation", ...(report.facts.external ? ["goplus"] : []), "sourcify"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
