import { type NextRequest } from "next/server";
import { z } from "zod";
import { getChain } from "@/config/chains";
import { MAX_BATCH_ADDRESSES, MAX_BATCH_TOKENS, readBatchBalances } from "@/server/chains/evm/batch";
import { getOnchainPrices } from "@/server/chains/evm/prices";
import { getEvmClient } from "@/server/chains/evm/providers";
import { fail, ok } from "@/server/http/response";
import { batchLimiter, clientKey } from "@/server/rate-limit";

const MAX_BODY_BYTES = 16_384;
const PRICES_MS = 4_000;
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const body = z.object({
  chain: z.string().max(32),
  addresses: z.array(address).min(1).max(MAX_BATCH_ADDRESSES),
  tokens: z.array(address).max(MAX_BATCH_TOKENS).default([]),
  /** Keeps every batch of one scan on the same block (decimal). */
  block: z
    .string()
    .regex(/^\d{1,12}$/)
    .optional(),
  /** First batch of a scan also returns on-chain USD prices for the native coin and the tokens. */
  prices: z.boolean().optional(),
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * POST /api/v1/batch-balances — balances of up to 100 public addresses on one chain, read directly from the chain.
 * Read-only. The address list is not stored or logged; labels never leave the browser.
 */
export async function POST(request: NextRequest) {
  const limit = batchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return fail("INVALID_INPUT");
  let json: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail("INVALID_INPUT");
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_INPUT");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return fail("INVALID_INPUT");
  const chain = getChain(parsed.data.chain);
  if (!chain || chain.family !== "evm" || chain.status !== "live" || !chain.capabilities.tokenBalances) {
    return fail("INVALID_INPUT");
  }
  const addresses = [...new Set(parsed.data.addresses.map((a) => a.toLowerCase()))];
  const tokens = [...new Set(parsed.data.tokens.map((a) => a.toLowerCase()))];

  try {
    const client = getEvmClient(chain);
    const [result, quotes] = await Promise.all([
      readBatchBalances(client, addresses, tokens, parsed.data.block ? BigInt(parsed.data.block) : undefined),
      parsed.data.prices
        ? withTimeout(
            getOnchainPrices(
              client,
              chain,
              tokens.map((token) => ({ address: token, decimals: null })),
            ),
            PRICES_MS,
          )
        : null,
    ]);
    let prices: Record<string, number> | undefined;
    if (quotes) {
      prices = {};
      if (quotes.native) prices.native = quotes.native.usd;
      for (const [token, quote] of quotes.tokens) prices[token.toLowerCase()] = quote.usd;
    }
    return ok({ chain: chain.key, ...result, ...(prices ? { prices } : {}) }, { sources: ["rpc"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
