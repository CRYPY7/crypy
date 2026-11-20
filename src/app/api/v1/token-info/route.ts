import { type NextRequest } from "next/server";
import { z } from "zod";
import { getChain } from "@/config/chains";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedTokenLookup } from "@/server/services/lookups";

const query = z.object({ chain: z.string().max(32), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

/** GET /api/v1/token-info?chain=&address= → the token's name, symbol and decimals, or `token: null` if it isn't one. */
export async function GET(request: NextRequest) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = query.safeParse({
    chain: request.nextUrl.searchParams.get("chain") ?? "",
    address: request.nextUrl.searchParams.get("address") ?? "",
  });
  if (!parsed.success || !getChain(parsed.data.chain)) return fail("INVALID_INPUT");
  try {
    const lookup = await cachedTokenLookup(parsed.data.chain, parsed.data.address);
    const token =
      lookup?.kind === "token" && lookup.token
        ? { name: lookup.token.name, symbol: lookup.token.symbol, decimals: lookup.token.decimals }
        : null;
    return ok(
      { chain: parsed.data.chain, address: parsed.data.address, kind: lookup?.kind ?? null, token },
      {
        sources: ["rpc"],
      },
    );
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
