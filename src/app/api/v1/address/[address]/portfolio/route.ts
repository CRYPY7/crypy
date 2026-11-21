import { type NextRequest } from "next/server";
import { getAddress } from "viem";
import { fail, ok } from "@/server/http/response";
import { clientKey, portfolioLimiter } from "@/server/rate-limit";
import { portfolioWallet } from "@/server/services/portfolio";

/**
 * GET /api/v1/address/{address}/portfolio — one Portfolio wallet: balances on the chains it uses, how many approvals
 * need attention, and held tokens GoPlus flags. Read-only and rate-limited; nothing is stored. The visitor's list of
 * wallets and labels stays in their browser.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("INVALID_INPUT");
  const limit = portfolioLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const report = await portfolioWallet(getAddress(address.toLowerCase()));
    return ok(report, { sources: ["rpc", "goplus"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
