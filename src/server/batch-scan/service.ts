import "server-only";
import { erc20Abi, getAddress } from "viem";
import { getChain } from "@/config/chains";
import { getOnchainPrices } from "@/server/chains/evm/prices";
import { getEvmClient } from "@/server/chains/evm/providers";
import { serverEnv } from "@/server/env";
import { recordOutcome } from "@/server/outcomes/record";
import { ScanManager } from "./jobs";
import { scanReaders } from "./readers";

/** The server's one scan manager (globalThis: Next.js may load this module more than once). */
const key = Symbol.for("crypy.scanManager");
const holder = globalThis as unknown as Record<symbol, ScanManager | undefined>;

const PRICE_TRIES = 3;

async function checkTokens(chainKey: string, tokens: string[]) {
  const chain = getChain(chainKey);
  if (!chain || tokens.length === 0) return { tokens, notOnChain: [] };
  try {
    const results = await getEvmClient(chain).multicall({
      allowFailure: true,
      contracts: tokens.map((token) => ({
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "decimals" as const,
      })),
    });
    // Only a clear "this contract has no decimals()" counts as not a token; a node problem keeps the token.
    const notOnChain = tokens.filter((_, i) => results[i]?.status === "failure");
    return { tokens: tokens.filter((t) => !notOnChain.includes(t)), notOnChain };
  } catch {
    return { tokens, notOnChain: [] };
  }
}

async function pricesFor(chainKey: string, tokens: string[]) {
  const chain = getChain(chainKey);
  if (!chain) return null;
  for (let attempt = 0; attempt < PRICE_TRIES; attempt++) {
    try {
      const quotes = await getOnchainPrices(
        getEvmClient(chain),
        chain,
        tokens.map((token) => ({ address: token, decimals: null })),
      );
      const prices: Record<string, number> = {};
      if (quotes.native) prices.native = quotes.native.usd;
      for (const [token, quote] of quotes.tokens) prices[token.toLowerCase()] = quote.usd;
      return prices;
    } catch {
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }
  return null;
}

export function scanManager(): ScanManager {
  let manager = holder[key];
  if (!manager) {
    manager = new ScanManager(
      {
        maxRunning: serverEnv.SCAN_MAX_RUNNING,
        maxQueued: serverEnv.SCAN_MAX_QUEUED,
        maxWallets: serverEnv.SCAN_MAX_WALLETS,
        dailyWallets: serverEnv.SCAN_DAILY_WALLETS,
      },
      {
        readersFor: (chainKey) => {
          const chain = getChain(chainKey);
          return chain ? scanReaders(chain) : [];
        },
        checkTokens,
        pricesFor,
        onFinished: ({ ms, complete, stillReading }) =>
          recordOutcome(
            "batch-balance",
            complete
              ? { outcome: "full", reasons: [] }
              : { outcome: "partial", reasons: stillReading.map((c) => `still being read: ${c}`) },
            ms,
          ),
      },
    );
    holder[key] = manager;
    const timer = setInterval(() => manager!.sweep(), 60_000);
    timer.unref?.();
  }
  return manager;
}
