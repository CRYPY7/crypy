import "server-only";
import { type Hex, type PublicClient, erc20Abi, getAddress, parseAbi, zeroAddress } from "viem";
import type { ChainConfig } from "@/config/chains";
import { type ChainDex, type DexConfig, type QuoteToken, chainDex } from "./dex";

/**
 * CRYPY's own price engine (zero-API-cost rule): USD prices read from DEX pools on-chain.
 *
 * For each token: find its pools against the chain's quote tokens (stablecoins and the wrapped native coin)
 * on the configured DEXes, read each pool's price, and use the pool with the deepest quote-side liquidity.
 * Stablecoins anchor $1; the wrapped native coin is priced from its stablecoin pools first.
 * A pool with less than MIN_DEPTH_USD of quote tokens is ignored, so tiny scam pools can't set a price.
 * Two multicall rounds in total, whatever the number of tokens.
 */
export const MIN_DEPTH_USD = 5_000;
/** Calldata bytes per multicall request (a few hundred calls each). */
const MULTICALL_BYTES = 24_000;

const v2FactoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);
const v3FactoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

export interface PriceQuote {
  usd: number;
  /** Quote-side liquidity of the pool used, in USD (one side of the pool). */
  depthUsd: number;
  dex: string;
}

export interface TokenToPrice {
  address: string;
  decimals: number;
}

interface Candidate {
  token: TokenToPrice;
  quote: QuoteToken;
  dex: DexConfig;
  pool?: Hex;
}

/** Price of `token` in `quote` units from a v2 pool's balances. */
export function v2Price(tokenBalance: bigint, quoteBalance: bigint, tokenDecimals: number, quoteDecimals: number) {
  if (tokenBalance === 0n) return null;
  const t = Number(tokenBalance) / 10 ** tokenDecimals;
  const q = Number(quoteBalance) / 10 ** quoteDecimals;
  return t > 0 ? q / t : null;
}

/**
 * Price of `token` in `quote` units from a v3 pool's sqrtPriceX96.
 * Pool tokens are sorted by address: token0 < token1; sqrtPriceX96² / 2^192 = amount1 / amount0 (raw units).
 */
export function v3Price(
  sqrtPriceX96: bigint,
  token: string,
  quote: string,
  tokenDecimals: number,
  quoteDecimals: number,
) {
  if (sqrtPriceX96 === 0n) return null;
  const ratio = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // raw token1 per raw token0
  const tokenIsToken0 = token.toLowerCase() < quote.toLowerCase();
  const rawQuotePerRawToken = tokenIsToken0 ? ratio : 1 / ratio;
  const price = rawQuotePerRawToken * 10 ** (tokenDecimals - quoteDecimals);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function candidatesFor(tokens: TokenToPrice[], config: ChainDex): Candidate[] {
  const out: Candidate[] = [];
  for (const token of tokens) {
    for (const quote of config.quotes) {
      if (quote.address.toLowerCase() === token.address.toLowerCase()) continue;
      for (const dex of config.dexes) {
        if (dex.protocol === "v2") out.push({ token, quote, dex });
        else for (const fee of dex.fees ?? []) out.push({ token, quote, dex: { ...dex, fees: [fee] } });
      }
    }
  }
  return out;
}

async function discoverPools(client: PublicClient, candidates: Candidate[]): Promise<Candidate[]> {
  const results = await client.multicall({
    allowFailure: true,
    batchSize: MULTICALL_BYTES,
    contracts: candidates.map((c) =>
      c.dex.protocol === "v2"
        ? {
            address: c.dex.factory as Hex,
            abi: v2FactoryAbi,
            functionName: "getPair" as const,
            args: [c.token.address as Hex, c.quote.address as Hex] as const,
          }
        : {
            address: c.dex.factory as Hex,
            abi: v3FactoryAbi,
            functionName: "getPool" as const,
            args: [c.token.address as Hex, c.quote.address as Hex, c.dex.fees![0]!] as const,
          },
    ),
  });
  return candidates.flatMap((c, i) => {
    const r = results[i];
    return r?.status === "success" && r.result !== zeroAddress ? [{ ...c, pool: r.result as Hex }] : [];
  });
}

/** Reads every found pool and returns, per token, its price in quote units and the quote-side depth. */
async function readPools(client: PublicClient, pools: Candidate[]) {
  const calls = pools.flatMap((c) => [
    // Quote-side balance: the liquidity depth measure for both pool types.
    { address: c.quote.address as Hex, abi: erc20Abi, functionName: "balanceOf" as const, args: [c.pool!] as const },
    c.dex.protocol === "v2"
      ? { address: c.token.address as Hex, abi: erc20Abi, functionName: "balanceOf" as const, args: [c.pool!] as const }
      : { address: c.pool!, abi: v3PoolAbi, functionName: "slot0" as const },
  ]);
  const results = await client.multicall({ allowFailure: true, batchSize: MULTICALL_BYTES, contracts: calls });
  return pools.flatMap((c, i) => {
    const quoteBal = results[i * 2];
    const second = results[i * 2 + 1];
    if (quoteBal?.status !== "success" || second?.status !== "success") return [];
    const quoteBalance = quoteBal.result as bigint;
    const price =
      c.dex.protocol === "v2"
        ? v2Price(second.result as bigint, quoteBalance, c.token.decimals, c.quote.decimals)
        : v3Price(
            (second.result as readonly [bigint, ...unknown[]])[0],
            c.token.address,
            c.quote.address,
            c.token.decimals,
            c.quote.decimals,
          );
    if (price === null) return [];
    return [{ candidate: c, priceInQuote: price, quoteAmount: Number(quoteBalance) / 10 ** c.quote.decimals }];
  });
}

/** Picks, per token, the pool with the deepest quote side (in USD) above the minimum. */
export function bestPrices(
  readings: { candidate: Candidate; priceInQuote: number; quoteAmount: number }[],
  quoteUsd: Map<string, number>,
): Map<string, PriceQuote> {
  const best = new Map<string, PriceQuote>();
  for (const { candidate, priceInQuote, quoteAmount } of readings) {
    const usdPerQuote = quoteUsd.get(candidate.quote.address.toLowerCase());
    if (usdPerQuote === undefined) continue;
    const depthUsd = quoteAmount * usdPerQuote;
    if (depthUsd < MIN_DEPTH_USD) continue;
    const key = candidate.token.address.toLowerCase();
    const current = best.get(key);
    if (!current || depthUsd > current.depthUsd) {
      best.set(key, { usd: priceInQuote * usdPerQuote, depthUsd, dex: candidate.dex.name });
    }
  }
  return best;
}

export interface ChainPrices {
  /** Price of the native coin (from the wrapped native token). */
  native: PriceQuote | null;
  /** Keyed by lower-case token address. */
  tokens: Map<string, PriceQuote>;
}

/** USD prices for the native coin and the given tokens, from on-chain DEX pools. */
export async function getOnchainPrices(
  client: PublicClient,
  chain: ChainConfig,
  tokens: TokenToPrice[],
): Promise<ChainPrices> {
  const config = chainDex[chain.key];
  const wrapped = config.quotes.find((q) => q.role === "wrapped-native")!;
  const stables = config.quotes.filter((q) => q.role === "stable");
  const quoteUsd = new Map<string, number>(stables.map((q) => [q.address.toLowerCase(), 1]));

  // Round 1+2 for the wrapped native coin against stablecoins only.
  const nativeConfig: ChainDex = { quotes: stables, dexes: config.dexes };
  const nativeReadings = await readPools(
    client,
    await discoverPools(
      client,
      candidatesFor([{ address: wrapped.address, decimals: wrapped.decimals }], nativeConfig),
    ),
  );
  const native = bestPrices(nativeReadings, quoteUsd).get(wrapped.address.toLowerCase()) ?? null;
  if (native) quoteUsd.set(wrapped.address.toLowerCase(), native.usd);

  const result = new Map<string, PriceQuote>();
  for (const stable of stables)
    result.set(stable.address.toLowerCase(), { usd: 1, depthUsd: Infinity, dex: "stablecoin" });
  if (native) result.set(wrapped.address.toLowerCase(), native);

  const toPrice = tokens
    .filter((t) => !result.has(t.address.toLowerCase()))
    .map((t) => ({ address: getAddress(t.address), decimals: t.decimals }));
  if (toPrice.length > 0) {
    const readings = await readPools(client, await discoverPools(client, candidatesFor(toPrice, config)));
    for (const [key, quote] of bestPrices(readings, quoteUsd)) result.set(key, quote);
  }
  return { native, tokens: result };
}
