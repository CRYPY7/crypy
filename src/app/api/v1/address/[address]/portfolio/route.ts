import { type NextRequest } from "next/server";
import { getAddress } from "viem";
import { fail, ok } from "@/server/http/response";
import { clientKey, portfolioLimiter } from "@/server/rate-limit";
import { portfolioBalances, portfolioSafety } from "@/server/services/portfolio";
import { observe } from "@/server/outcomes/record";
import { classifyPortfolioBalances, classifyPortfolioSafety } from "@/lib/outcomes/classify";

/**
 * GET /api/v1/address/{address}/portfolio — one Portfolio wallet, in two parts (B-034), so its balances show at once:
 *  - default: balances on the chains it uses;
 *  - ?part=safety: how many approvals need attention, and held tokens GoPlus flags.
 * Read-only and rate-limited; nothing is stored. The visitor's list of wallets and labels stays in their browser.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("INVALID_INPUT");
  const part = request.nextUrl.searchParams.get("part");
  if (part !== null && part !== "safety") return fail("INVALID_INPUT");
  const limit = portfolioLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const wallet = getAddress(address.toLowerCase());
  try {
    if (part === "safety") {
      const report = await observe("portfolio-safety", () => portfolioSafety(wallet), classifyPortfolioSafety);
      return ok(report, { sources: ["rpc", "goplus"] });
    }
    const report = await observe("portfolio", () => portfolioBalances(wallet), classifyPortfolioBalances);
    return ok(report, { sources: ["rpc"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
