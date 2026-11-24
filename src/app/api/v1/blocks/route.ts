import { type NextRequest } from "next/server";
import { liveChains } from "@/config/chains";
import { registry } from "@/server/chains/registry";
import { fail, ok } from "@/server/http/response";
import { blocksLimiter, clientKey } from "@/server/rate-limit";
import { observe } from "@/server/outcomes/record";
import { classifyDone, classifyGas } from "@/lib/outcomes/classify";

/**
 * GET /api/v1/blocks?time=<unix seconds>  → the first block at or after that time on every chain
 * GET /api/v1/blocks?block=<n>&chain=<key> → that block's time
 * Read from real block headers. Read-only, rate-limited, nothing stored.
 */
export async function GET(request: NextRequest) {
  const limit = blocksLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const q = request.nextUrl.searchParams;
  const time = q.get("time");
  const block = q.get("block");
  const adapterFor = (family: string) => registry.adapters.find((a) => a.family === family);
  try {
    if (time !== null) {
      if (!/^\d{1,11}$/.test(time)) return fail("INVALID_INPUT");
      const t = Number(time);
      const results = await observe(
        "timestamp-block",
        () =>
          Promise.allSettled(
            liveChains.map((c) => {
              const a = adapterFor(c.family);
              if (!a?.blockAtTime) throw new Error("unsupported");
              return a.blockAtTime(c, t);
            }),
          ),
        (settled) =>
          classifyGas({
            chains: settled.filter((r) => r.status === "fulfilled"),
            unavailable: liveChains.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key),
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
      const result = await observe(
        "timestamp-block",
        async () => (await adapterFor(chain.family)?.blockTime?.(chain, Number(block))) ?? null,
        classifyDone,
      );
      return result ? ok(result, { sources: ["rpc"] }) : fail("NOT_FOUND");
    }
    return fail("INVALID_INPUT");
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
