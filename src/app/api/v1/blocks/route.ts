import { type NextRequest } from "next/server";
import { liveChains } from "@/config/chains";
import { registry } from "@/server/chains/registry";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";

/**
 * GET /api/v1/blocks?time=<unix seconds>  → the first block at or after that time on every chain
 * GET /api/v1/blocks?block=<n>&chain=<key> → that block's time
 * Read from real block headers. Read-only, rate-limited, nothing stored.
 */
export async function GET(request: NextRequest) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const q = request.nextUrl.searchParams;
  const time = q.get("time");
  const block = q.get("block");
  const adapterFor = (family: string) => registry.adapters.find((a) => a.family === family);
  try {
    if (time !== null) {
      if (!/^\d{1,11}$/.test(time)) return fail("INVALID_INPUT");
      const t = Number(time);
      const results = await Promise.allSettled(
        liveChains.map((c) => {
          const a = adapterFor(c.family);
          if (!a?.blockAtTime) throw new Error("unsupported");
          return a.blockAtTime(c, t);
        }),
      );
      return ok(
        {
          results: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
          unavailable: liveChains.filter((_, i) => results[i]?.status === "rejected").map((c) => c.key),
        },
        { sources: ["rpc"] },
      );
    }
    if (block !== null) {
      const chain = liveChains.find((c) => c.key === q.get("chain"));
      if (!chain || !/^\d{1,12}$/.test(block)) return fail("INVALID_INPUT");
      const result = await adapterFor(chain.family)?.blockTime?.(chain, Number(block));
      return result ? ok(result, { sources: ["rpc"] }) : fail("NOT_FOUND");
    }
    return fail("INVALID_INPUT");
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
