import { type NextRequest } from "next/server";
import { getChain } from "@/config/chains";
import { getOnchainPrices } from "@/server/chains/evm/prices";
import { getEvmClient } from "@/server/chains/evm/providers";
import { fail, ok } from "@/server/http/response";
import { clientKey, sharedCacheLimiter } from "@/server/rate-limit";

const TOKEN = /^0x[0-9a-fA-F]{40}$/;
const MAX_TOKENS = 5;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; prices: Record<string, number> }>();

/**
 * GET /api/v1/batch-prices?chain=bsc&tokens=0x…,0x… — on-chain USD prices for the coin and up to 5 tokens, for scans
 * that run in the visitor's browser. Only token contracts are sent here, never the wallet list. Cached 60 s.
 */
export async function GET(request: NextRequest) {
  const limit = sharedCacheLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const chain = getChain(request.nextUrl.searchParams.get("chain") ?? "");
  const raw = request.nextUrl.searchParams.get("tokens") ?? "";
  const tokens = raw ? [...new Set(raw.split(",").map((t) => t.toLowerCase()))] : [];
  if (!chain || chain.family !== "evm" || chain.status !== "live" || tokens.length > MAX_TOKENS) {
    return fail("INVALID_INPUT");
  }
  if (tokens.some((t) => !TOKEN.test(t))) return fail("INVALID_INPUT");
  const key = `${chain.key}|${[...tokens].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return ok({ prices: hit.prices }, { sources: ["rpc"], cached: true });
  try {
    const quotes = await getOnchainPrices(
      getEvmClient(chain),
      chain,
      tokens.map((address) => ({ address, decimals: null })),
    );
    const prices: Record<string, number> = {};
    if (quotes.native) prices.native = quotes.native.usd;
    for (const [token, quote] of quotes.tokens) prices[token.toLowerCase()] = quote.usd;
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), prices });
    return ok({ prices }, { sources: ["rpc"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
