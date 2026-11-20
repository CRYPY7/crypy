import "server-only";
import { type PublicClient, decodeErrorResult, decodeFunctionResult, encodeFunctionData, getAddress } from "viem";
import type { ChainKey } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { TradeFacts, TradeOutcome } from "@/lib/security/types";
import { type DexProtocol, tradeTestSize, wrappedNative } from "./dex-registry";
import type { PoolReading } from "./pools";
import { FAILED_AT, RUNTIME_V2, TESTER, TEST_RECEIVER, tradeTestAbi } from "./trade-test-v2";

/**
 * Trade simulators per exchange design. Each one buys, transfers and sells inside a read-only eth_call
 * (state override: test code + a test balance at a throwaway address). Nothing is ever sent.
 * Add a simulator for a new design (e.g. "uniswap-v3") here; the rest of the engine picks it up.
 */
type Simulator = (
  client: PublicClient,
  args: { router: string; token: string; wrapped: string; amountIn: bigint },
) => Promise<Omit<TradeFacts, "venue" | "amountIn" | "nativeSymbol">>;

const SIM_GAS = 30_000_000n;
/** Gives the test contract plenty of coin to spend (only inside the simulated call). */
const TEST_BALANCE = 10n ** 24n;

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

const simulateUniswapV2: Simulator = async (client, { router, token, wrapped, amountIn }) => {
  const result = await client.call({
    to: TESTER,
    gas: SIM_GAS,
    data: encodeFunctionData({
      abi: tradeTestAbi,
      functionName: "run",
      args: [getAddress(router), getAddress(token), getAddress(wrapped), amountIn, TEST_RECEIVER],
    }),
    stateOverride: [{ address: TESTER, code: RUNTIME_V2, balance: TEST_BALANCE }],
  });
  const r = decodeFunctionResult({ abi: tradeTestAbi, functionName: "run", data: result.data! });
  const outcome = (FAILED_AT[r.failedAt] ?? "error") as TradeOutcome;
  const bought = r.buyReceived > 0n;
  return {
    outcome,
    buyTax: bought ? taxOf(r.buyReceived, r.buyExpected) : null,
    transferTax:
      r.transferSent > 0n && outcome !== "transfer-failed" ? taxOf(r.transferReceived, r.transferSent) : null,
    sellTax: outcome === "ok" ? taxOf(r.sellReceived, r.sellExpected) : null,
    reason: reasonText(r.reason),
  };
};

const simulators: Partial<Record<DexProtocol, Simulator>> = {
  "uniswap-v2": simulateUniswapV2,
};

/** Pools below this native-side amount are treated as having no liquidity (dust). */
const MIN_NATIVE_SIDE = 10n ** 15n;

export async function runTradeTest(
  client: PublicClient,
  chain: ChainKey,
  token: string,
  readings: PoolReading[],
  nativeSymbol: string,
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
  const candidates = readings
    .filter(
      (r) =>
        r.pool.quote.role === "wrapped-native" && r.pool.dex.router && simulators[r.pool.dex.protocol] !== undefined,
    )
    .sort((a, b) => (b.quoteReserve > a.quoteReserve ? 1 : b.quoteReserve < a.quoteReserve ? -1 : 0));
  const best = candidates[0];
  if (!best) return { ...base, outcome: "unsupported-pool" };
  const venue = {
    dex: best.pool.dex.name,
    protocol: best.pool.dex.protocol,
    pool: best.pool.address,
    router: best.pool.dex.router!,
  };
  if (best.quoteReserve < MIN_NATIVE_SIDE || best.tokenReserve === 0n)
    return { ...base, venue, outcome: "no-liquidity" };
  const size = tradeTestSize[chain] ?? 10n ** 16n;
  const amountIn = best.quoteReserve / 200n < size ? best.quoteReserve / 200n : size;
  try {
    const sim = await simulators[best.pool.dex.protocol]!(client, {
      router: venue.router,
      token,
      wrapped: wrapped.address,
      amountIn,
    });
    return { ...base, ...sim, venue, amountIn: amountIn.toString() };
  } catch {
    return { ...base, venue, amountIn: amountIn.toString(), outcome: "error" };
  }
}
