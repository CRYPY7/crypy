import { type NextRequest } from "next/server";
import { liveChains } from "@/config/chains";
import { usageSnapshot } from "@/server/chains/evm/providers";
import { registry } from "@/server/chains/registry";
import { fail, ok } from "@/server/http/response";
import { clientKey, healthLimiter } from "@/server/rate-limit";

/**
 * Live check that every supported chain answers: block height, response time, and which data providers
 * work (names only, never URLs or keys).
 */
export async function GET(request: NextRequest) {
  const limit = healthLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });

  const results = await Promise.all(
    liveChains.map(async (chain) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      try {
        if (!adapter) throw new Error("no adapter");
        const [head, providers] = await Promise.all([adapter.getHead(chain), adapter.checkProviders?.(chain)]);
        // The first working provider in order is the one live requests use.
        const usedProvider = providers?.find((provider) => provider.ok)?.name;
        return { ...head, ok: true as const, usedProvider, providers };
      } catch {
        return { chain: chain.key, ok: false as const };
      }
    }),
  );
  const allDown = results.every((r) => !r.ok);
  if (allDown) return fail("UPSTREAM_UNAVAILABLE");
  // Today's use of each provider's daily budget (names and counts only).
  return ok({ chains: results, usageToday: usageSnapshot() }, { sources: ["rpc"] });
}
