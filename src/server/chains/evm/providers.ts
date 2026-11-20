import "server-only";
import { type Chain, type PublicClient, type Transport, createPublicClient, fallback, http } from "viem";
import { bsc, mainnet } from "viem/chains";
import type { ChainConfig, ChainKey } from "@/config/chains";
import { serverEnv } from "@/server/env";

/**
 * Free blockchain providers, tried in order, each with a daily budget (zero-API-cost rule).
 *
 *   1. Alchemy free plan (budget in compute units, ~1/30 of the monthly allowance per day)
 *   2. Extra free providers from ETH_RPC_URLS / BSC_RPC_URLS (dRPC, Ankr, Chainstack, Infura…; budget in requests)
 *   3. Free public nodes (no budget; they rate-limit on their own)
 *
 * When a provider's budget for the day is used up it is skipped until midnight UTC, so no free plan
 * runs out and a busy day can't use up the month. Usage is kept in memory per server (shared store at launch).
 */

const viemChains: Record<ChainKey, Chain> = { ethereum: mainnet, bsc };

export interface Provider {
  /** Safe to show (host name), never the URL, which may contain a key. */
  name: string;
  url: string;
  kind: "alchemy" | "extra" | "public";
}

/** Alchemy compute units per method (alchemy.com/docs/reference/compute-unit-costs). */
const ALCHEMY_CU: Record<string, number> = {
  eth_blockNumber: 10,
  eth_chainId: 0,
  eth_call: 26,
  eth_getLogs: 60,
  alchemy_getTokenBalances: 20,
};
const DEFAULT_CU = 20;

export function alchemyUnits(method: string): number {
  return ALCHEMY_CU[method] ?? DEFAULT_CU;
}

/** "https://rpc.ankr.com/bsc/KEY" → "ankr.com". Keys live in paths or queries, never in host names. */
export function providerLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.split(".").slice(-2).join(".");
  } catch {
    return "custom";
  }
}

export function providersFor(chain: ChainConfig): Provider[] {
  const list: Provider[] = [];
  if (serverEnv.ALCHEMY_API_KEY && chain.alchemyNetwork) {
    list.push({
      name: "alchemy",
      kind: "alchemy",
      url: `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${serverEnv.ALCHEMY_API_KEY}`,
    });
  }
  const extra = chain.key === "ethereum" ? serverEnv.ETH_RPC_URLS : serverEnv.BSC_RPC_URLS;
  for (const url of extra) list.push({ name: providerLabel(url), kind: "extra", url });
  for (const url of chain.publicRpcUrls) list.push({ name: `public:${providerLabel(url)}`, kind: "public", url });
  return list;
}

// ---- Daily usage meter -------------------------------------------------------------------------

interface Usage {
  day: string;
  requests: number;
  units: number;
}

// One meter per server process. Next.js can load this module more than once (pages, API routes),
// so the map lives on globalThis to keep a single count.
const globalKey = Symbol.for("crypy.providerUsage");
const holder = globalThis as unknown as Record<symbol, Map<string, Usage> | undefined>;
const usage: Map<string, Usage> = (holder[globalKey] ??= new Map<string, Usage>());
const today = () => new Date().toISOString().slice(0, 10);

function usageFor(key: string): Usage {
  const day = today();
  let entry = usage.get(key);
  if (!entry || entry.day !== day) {
    entry = { day, requests: 0, units: 0 };
    usage.set(key, entry);
  }
  return entry;
}

/** Budgets are per provider account, so all chains of one provider share it. */
function budgetKey(provider: Provider): string {
  return provider.kind === "alchemy" ? "alchemy" : provider.name;
}

export function budgetExhausted(provider: Provider): boolean {
  if (provider.kind === "public") return false;
  const used = usageFor(budgetKey(provider));
  return provider.kind === "alchemy"
    ? used.units >= serverEnv.ALCHEMY_DAILY_CU
    : used.requests >= serverEnv.RPC_DAILY_REQUESTS;
}

export function recordUsage(provider: Provider, method: string): void {
  const used = usageFor(budgetKey(provider));
  used.requests += 1;
  used.units += provider.kind === "alchemy" ? alchemyUnits(method) : 0;
}

export class BudgetExhaustedError extends Error {
  constructor(provider: string) {
    super(`Daily budget used up for ${provider}`);
    this.name = "BudgetExhaustedError";
  }
}

/** Today's usage per provider, for the health page (names and numbers only). */
export function usageSnapshot(): { provider: string; requests: number; units?: number; limit: number | null }[] {
  const day = today();
  return [...usage.entries()]
    .filter(([, value]) => value.day === day)
    .map(([provider, value]) =>
      provider === "alchemy"
        ? { provider, requests: value.requests, units: value.units, limit: serverEnv.ALCHEMY_DAILY_CU }
        : provider.startsWith("public:")
          ? { provider, requests: value.requests, limit: null }
          : { provider, requests: value.requests, limit: serverEnv.RPC_DAILY_REQUESTS },
    );
}

/** Test helper: forget all usage. */
export function resetUsage(): void {
  usage.clear();
}

// ---- Transports ----------------------------------------------------------------------------------

/**
 * An HTTP transport that counts every request against its provider's daily budget and refuses
 * (so the fallback moves on) once the budget is used up. Concurrent requests are sent as one
 * JSON-RPC batch to save round trips.
 */
export function meteredHttp(provider: Provider, timeout = 8_000): Transport {
  const inner = http(provider.url, { timeout, retryCount: 0, batch: { batchSize: 20, wait: 10 } });
  return (options) => {
    const transport = inner(options);
    return {
      ...transport,
      async request(args: { method: string; params?: unknown }, requestOptions?: unknown) {
        if (budgetExhausted(provider)) throw new BudgetExhaustedError(provider.name);
        recordUsage(provider, args.method);
        return (transport.request as (a: typeof args, o?: unknown) => Promise<unknown>)(args, requestOptions);
      },
    } as ReturnType<Transport>;
  };
}

const clients = new Map<ChainKey, PublicClient>();

/** One client per chain over the provider rotation. */
export function getEvmClient(chain: ChainConfig): PublicClient {
  let client = clients.get(chain.key);
  if (!client) {
    client = createPublicClient({
      chain: viemChains[chain.key],
      batch: { multicall: { batchSize: 4_096 } },
      transport: fallback(
        providersFor(chain).map((provider) => meteredHttp(provider)),
        { rank: false, retryCount: 1 },
      ),
    }) as PublicClient;
    clients.set(chain.key, client);
  }
  return client;
}

/** A single-provider client, for health checks. */
export function clientFor(chain: ChainConfig, provider: Provider): PublicClient {
  return createPublicClient({ chain: viemChains[chain.key], transport: meteredHttp(provider, 5_000) }) as PublicClient;
}

/** The Alchemy provider for Alchemy-only methods (token index), if configured and within budget. */
export function alchemyProvider(chain: ChainConfig): Provider | null {
  return providersFor(chain).find((provider) => provider.kind === "alchemy") ?? null;
}
