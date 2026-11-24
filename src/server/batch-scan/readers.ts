import "server-only";
import type { ChainConfig } from "@/config/chains";
import { type ChunkResult, type Reader, ReadError } from "@/lib/batch-scan/engine";
import { readBatchBalances } from "@/server/chains/evm/batch";
import {
  BudgetExhaustedError,
  type Provider,
  ProviderCoolingDownError,
  clientFor,
  isTooManyRequests,
  providersFor,
  requestsToday,
} from "@/server/chains/evm/providers";
import { serverEnv } from "@/server/env";

/**
 * Server readers for batch scans: one per node provider of a chain, Alchemy excluded (its daily units are kept for
 * what only Alchemy does on pages: token lists, history, old blocks). Scans get a fixed share of each provider so
 * pages keep theirs (BATCH_SCANNER_DESIGN.md §7):
 *   - at most SCAN_IN_FLIGHT scan requests at once per provider, across all scans on this server;
 *   - extra providers: scans stop at SCAN_DAILY_SHARE of the provider's daily request budget.
 * A provider that is full answers "slow down" to the engine, which then uses another one or waits.
 */
export const SCAN_IN_FLIGHT = 2;
export const SCAN_DAILY_SHARE = 0.4;
/** One multicall request per chunk (100 wallets × 6 assets ≈ 60 KB of calldata) instead of viem's 1 KB pieces. */
const MULTICALL_BYTES = 96_000;

const inFlightKey = Symbol.for("crypy.scanInFlight");
const holder = globalThis as unknown as Record<symbol, Map<string, number> | undefined>;
const inFlight: Map<string, number> = (holder[inFlightKey] ??= new Map());

/** Whether scans may use this provider right now; exported for tests. */
export function scanCanUse(provider: Provider): boolean {
  if ((inFlight.get(provider.url) ?? 0) >= SCAN_IN_FLIGHT) return false;
  if (provider.kind === "extra" && requestsToday(provider) >= serverEnv.RPC_DAILY_REQUESTS * SCAN_DAILY_SHARE) {
    return false;
  }
  return true;
}

export function toReadError(error: unknown): ReadError {
  if (error instanceof ReadError) return error;
  if (error instanceof BudgetExhaustedError) return new ReadError("rate-limited", 10 * 60_000);
  if (error instanceof ProviderCoolingDownError) return new ReadError("rate-limited", 30_000);
  if (isTooManyRequests(error)) {
    const header = (error as { headers?: Headers }).headers?.get?.("retry-after");
    const seconds = Number(header);
    return new ReadError("rate-limited", Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5_000);
  }
  // Timeouts and "too big" answers both mean: try a smaller batch (the engine splits on "timeout").
  const text =
    error instanceof Error ? `${error.name} ${error.message} ${(error as { details?: string }).details ?? ""}` : "";
  if (
    /timeout|timed out|took too long|entity too large|\b413\b|payload|response size|out of gas|gas limit|exceeds/i.test(
      text,
    )
  ) {
    return new ReadError("timeout");
  }
  return new ReadError("failed");
}

export function scanReaders(chain: ChainConfig): Reader[] {
  return providersFor(chain)
    .filter((provider) => provider.kind !== "alchemy")
    .map((provider) => ({
      id: provider.name,
      async read(addresses, tokens, block): Promise<ChunkResult> {
        if (!scanCanUse(provider)) {
          // Full for scans: rest briefly unless it's the daily share (then until tomorrow's budget, capped).
          const daily = provider.kind === "extra" && !((inFlight.get(provider.url) ?? 0) >= SCAN_IN_FLIGHT);
          throw new ReadError("rate-limited", daily ? 10 * 60_000 : 1_000);
        }
        inFlight.set(provider.url, (inFlight.get(provider.url) ?? 0) + 1);
        try {
          const client = clientFor(chain, provider);
          const result = await readBatchBalances(
            client,
            addresses,
            tokens,
            block === undefined ? undefined : BigInt(block),
            MULTICALL_BYTES,
          );
          return result;
        } catch (error) {
          throw toReadError(error);
        } finally {
          inFlight.set(provider.url, Math.max(0, (inFlight.get(provider.url) ?? 1) - 1));
        }
      },
    }));
}
