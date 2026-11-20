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
 * Two multicall rounds in total, whatever the number of tokens: (1) find pools for the native coin and every token,
 * plus any unknown token decimals; (2) read all pools. The native coin's price is computed first from the same
 * readings, then used for tokens quoted in the wrapped native coin.
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
  /** Unknown decimals (null) are read in the first round. */
  decimals: number | null;
}

interface PricedToken {
  address: string;
  decimals: number;
}

interface Candidate {
  token: PricedToken;
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

function candidatesFor(tokens: PricedToken[], config: ChainDex): Candidate[] {
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

async function discoverPools(
  client: PublicClient,
  candidates: Candidate[],
  blockNumber?: bigint,
): Promise<Candidate[]> {
  const results = await client.multicall({
    blockNumber,
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
async function readPools(client: PublicClient, pools: Candidate[], blockNumber?: bigint) {
  const calls = pools.flatMap((c) => [
    // Quote-side balance: the liquidity depth measure for both pool types.
    { address: c.quote.address as Hex, abi: erc20Abi, functionName: "balanceOf" as const, args: [c.pool!] as const },
    c.dex.protocol === "v2"
      ? { address: c.token.address as Hex, abi: erc20Abi, functionName: "balanceOf" as const, args: [c.pool!] as const }
      : { address: c.pool!, abi: v3PoolAbi, functionName: "slot0" as const },
  ]);
  const results = await client.multicall({
    blockNumber,
    allowFailure: true,
    batchSize: MULTICALL_BYTES,
    contracts: calls,
  });
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

/** USD prices for the native coin and the given tokens, from on-chain DEX pools (two rounds). */
export async function getOnchainPrices(
  client: PublicClient,
  chain: ChainConfig,
  tokens: TokenToPrice[],
  /** Read prices as they were at this block (needs a node that keeps old state). Default: latest. */
  blockNumber?: bigint,
): Promise<ChainPrices> {
  const config = chainDex[chain.key];
  const wrapped = config.quotes.find((q) => q.role === "wrapped-native")!;
  const stables = config.quotes.filter((q) => q.role === "stable");
  const quoteUsd = new Map<string, number>(stables.map((q) => [q.address.toLowerCase(), 1]));
  const isQuote = (address: string) => config.quotes.some((q) => q.address.toLowerCase() === address.toLowerCase());

  // Tokens to price (quote tokens are priced by the anchor rules). Shared objects: decimals filled after round 1.
  const seen = new Set<string>();
  const toPrice: PricedToken[] = [];
  const unknownDecimals: PricedToken[] = [];
  for (const token of tokens) {
    const key = token.address.toLowerCase();
    if (seen.has(key) || isQuote(key)) continue;
    seen.add(key);
    const entry = { address: getAddress(token.address), decimals: token.decimals ?? -1 };
    toPrice.push(entry);
    if (token.decimals === null) unknownDecimals.push(entry);
  }

  // Round 1: pools for the wrapped native coin (against stablecoins) and every token, plus unknown decimals.
  const nativeCandidates = candidatesFor([{ address: wrapped.address, decimals: wrapped.decimals }], {
    quotes: stables,
    dexes: config.dexes,
  });
  const tokenCandidates = candidatesFor(toPrice, config);
  const [pools, decimals] = await Promise.all([
    discoverPools(client, [...nativeCandidates, ...tokenCandidates], blockNumber),
    unknownDecimals.length === 0
      ? Promise.resolve([])
      : client.multicall({
          blockNumber,
          allowFailure: true,
          contracts: unknownDecimals.map((t) => ({
            address: t.address as Hex,
            abi: erc20Abi,
            functionName: "decimals" as const,
          })),
        }),
  ]);
  unknownDecimals.forEach((token, i) => {
    const result = decimals[i];
    const value = result?.status === "success" ? Number(result.result) : -1;
    token.decimals = Number.isInteger(value) && value >= 0 && value <= 36 ? value : -1;
  });

  // Round 2: read every pool that exists (tokens without readable decimals are skipped).
  const readings = await readPools(
    client,
    pools.filter((c) => c.token.decimals >= 0),
    blockNumber,
  );
  const wrappedKey = wrapped.address.toLowerCase();
  const native =
    bestPrices(
      readings.filter((r) => r.candidate.token.address.toLowerCase() === wrappedKey),
      quoteUsd,
    ).get(wrappedKey) ?? null;
  if (native) quoteUsd.set(wrappedKey, native.usd);

  const result = new Map<string, PriceQuote>();
  for (const stable of stables)
    result.set(stable.address.toLowerCase(), { usd: 1, depthUsd: Infinity, dex: "stablecoin" });
  if (native) result.set(wrappedKey, native);
  const tokenReadings = readings.filter((r) => r.candidate.token.address.toLowerCase() !== wrappedKey);
  for (const [key, quote] of bestPrices(tokenReadings, quoteUsd)) result.set(key, quote);
  return { native, tokens: result };
}
