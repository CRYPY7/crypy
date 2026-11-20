import "server-only";
import { type PublicClient, decodeErrorResult, decodeFunctionResult, encodeFunctionData, getAddress } from "viem";
import type { ChainKey } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { TradeFacts, TradeOutcome } from "@/lib/security/types";
import { dexDeployments, tradeTestSize, wrappedNative } from "./dex-registry";
import { type PoolReading, poolUsd } from "./pools";
import { FAILED_AT, KIND, RUNTIME, TESTER, TEST_RECEIVER, tradeTestAbi } from "./trade-test";

/**
 * Trade test: buy, transfer and sell inside one read-only eth_call (state override: test code and a test balance at a
 * throwaway address). Nothing is ever sent. One contract (CrypyTradeTestV3) handles both exchange designs:
 *   - uniswap-v2: through the pool's router;
 *   - uniswap-v3: the pool is called directly, so every v3 fork works without its router.
 * Pools paired with a stablecoin are tested by first swapping the native coin to that stablecoin through the chain's
 * main v2 exchange ("hop"). A new exchange design needs its own branch in the contract and an entry in KIND.
 */
const SIM_GAS = 30_000_000n;
/** Gives the test contract plenty of coin to spend (only inside the simulated call). */
const TEST_BALANCE = 10n ** 24n;
/** Pools worth less than this are treated as having no liquidity (dust). */
const MIN_POOL_USD = 20;
/** Never trade more than this share of the pool's quote side. */
const MAX_POOL_SHARE = 200n; // 1/200 = 0.5%

function reasonText(data: string): string | null {
  if (!data || data === "0x") return null;
  try {
    const decoded = decodeErrorResult({ abi: [], data: data as `0x${string}` });
    const arg = decoded.args?.[0];
    if (decoded.errorName === "Error" && typeof arg === "string") return sanitizeTokenText(arg, 120) || null;
    if (decoded.errorName === "Panic") return `Panic ${String(arg)}`;
  } catch {
    // Custom error: show its selector only.
  }
  return data.slice(0, 10);
}

/** 1 − received / expected, as a fraction (0 when nothing was taken; null if it can't be measured). */
export function taxOf(received: bigint, expected: bigint): number | null {
  if (expected <= 0n) return null;
  if (received >= expected) return 0;
  return Number(((expected - received) * 1_000_000n) / expected) / 1_000_000;
}

type Sim = Omit<TradeFacts, "venue" | "amountIn" | "nativeSymbol">;

async function simulate(
  client: PublicClient,
  p: {
    kind: number;
    router: string | null;
    pool: string;
    token: string;
    quote: string;
    wrapped: string;
    hopRouter: string | null;
    amountIn: bigint;
  },
): Promise<Sim> {
  const zero = "0x0000000000000000000000000000000000000000";
  const result = await client.call({
    to: TESTER,
    gas: SIM_GAS,
    data: encodeFunctionData({
      abi: tradeTestAbi,
      functionName: "run",
      args: [
        {
          kind: p.kind,
          router: getAddress(p.router ?? zero),
          pool: getAddress(p.pool),
          token: getAddress(p.token),
          quote: getAddress(p.quote),
          wrapped: getAddress(p.wrapped),
          hopRouter: getAddress(p.hopRouter ?? zero),
          amountIn: p.amountIn,
          receiver: TEST_RECEIVER,
        },
      ],
    }),
    stateOverride: [{ address: TESTER, code: RUNTIME, balance: TEST_BALANCE }],
  });
  const r = decodeFunctionResult({ abi: tradeTestAbi, functionName: "run", data: result.data! });
  const step = FAILED_AT[r.failedAt] ?? "error";
  // Failing to get the stablecoin is CRYPY's own route, not the token's behaviour.
  const outcome = (step === "hop-failed" ? "error" : step) as TradeOutcome;
  const bought = r.buyReceived > 0n;
  const rejected = outcome === "sell-failed" && r.sellArrived > 0n ? taxOf(r.sellArrived, r.sellAmount) : null;
  return {
    outcome,
    buyTax: bought ? taxOf(r.buyReceived, r.buyExpected) : null,
    transferTax:
      r.transferSent > 0n && outcome !== "transfer-failed" ? taxOf(r.transferReceived, r.transferSent) : null,
    sellTax: outcome === "ok" ? taxOf(r.sellReceived, r.sellExpected) : rejected,
    reason: rejected !== null ? null : reasonText(r.reason),
    feeRejected: rejected,
  };
}

export async function runTradeTest(
  client: PublicClient,
  chain: ChainKey,
  token: string,
  readings: PoolReading[],
  nativeSymbol: string,
  nativeUsd: number | null,
  stableSymbol: (address: string) => string,
): Promise<TradeFacts> {
  const base = {
    venue: null,
    amountIn: null,
    nativeSymbol,
    buyTax: null,
    sellTax: null,
    transferTax: null,
    reason: null,
  };
  if (readings.length === 0) return { ...base, outcome: "no-pool" };
  const wrapped = wrappedNative(chain);
  const hop = (dexDeployments[chain] ?? []).find((d) => d.router && !d.unlisted)?.router ?? null;
  const supported = (r: PoolReading) =>
    !r.pool.dex.unlisted &&
    (r.pool.dex.protocol === "uniswap-v2" ? !!r.pool.dex.router : r.pool.dex.protocol === "uniswap-v3") &&
    (r.pool.quote.role === "wrapped-native" || (r.pool.quote.role === "stable" && hop !== null));
  const valued = readings
    .filter(supported)
    .map((r) => ({ r, usd: poolUsd(r, nativeUsd) ?? (r.pool.quote.role === "wrapped-native" ? 0 : -1) }))
    .sort((a, b) =>
      b.usd !== a.usd
        ? b.usd - a.usd
        : b.r.quoteReserve > a.r.quoteReserve
          ? 1
          : b.r.quoteReserve < a.r.quoteReserve
            ? -1
            : 0,
    );
  const best = valued[0]?.r;
  if (!best) return { ...base, outcome: "unsupported-pool" };
  const stable = best.pool.quote.role === "stable";
  const venue = {
    dex: best.pool.dex.name,
    protocol: best.pool.dex.protocol,
    pool: best.pool.address,
    router: best.pool.dex.protocol === "uniswap-v2" ? best.pool.dex.router! : null,
    via: stable ? stableSymbol(best.pool.quote.address) : null,
  };
  const usd = poolUsd(best, nativeUsd);
  if (best.tokenReserve === 0n || (usd !== null ? usd < MIN_POOL_USD : best.quoteReserve < 10n ** 15n))
    return { ...base, venue, outcome: "no-liquidity" };
  // Test size: about $10 of the native coin, at most 0.5% of the pool's quote side.
  const size = tradeTestSize[chain] ?? 10n ** 16n;
  let cap = best.quoteReserve / MAX_POOL_SHARE;
  if (stable) {
    if (nativeUsd === null || nativeUsd <= 0) return { ...base, venue, outcome: "error" };
    const quoteUsd = Number(best.quoteReserve) / 10 ** best.pool.quote.decimals;
    cap = BigInt(Math.floor((quoteUsd / Number(MAX_POOL_SHARE) / nativeUsd) * 1e18));
  }
  const amountIn = cap < size ? cap : size;
  if (amountIn <= 0n) return { ...base, venue, outcome: "no-liquidity" };
  try {
    const sim = await simulate(client, {
      kind: KIND[best.pool.dex.protocol],
      router: venue.router,
      pool: best.pool.address,
      token,
      quote: best.pool.quote.address,
      wrapped: wrapped.address,
      hopRouter: stable ? hop : null,
      amountIn,
    });
    return { ...base, ...sim, venue, amountIn: amountIn.toString() };
  } catch {
    return { ...base, venue, amountIn: amountIn.toString(), outcome: "error" };
  }
}
