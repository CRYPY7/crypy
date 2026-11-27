import "server-only";
import { type ChainConfig, liveChains } from "@/config/chains";
import { runInBackground } from "@/server/background";
import { registry } from "@/server/chains/registry";
import { alchemyProvider } from "@/server/chains/evm/providers";
import { type FetchDiscoveryPage, alchemyDiscoveryFetcher, discoverTokens } from "@/server/chains/evm/wallet-discovery";
import { logTiming } from "@/server/diagnostics";
import { readSavedOne, saveResults } from "@/server/saved/store";

/**
 * R2 activity map (INFRASTRUCTURE_DESIGN.md §5.2, §7): the chains where a wallet holds tokens, found with one
 * discovery request and stored, so pages, Approvals and Activity know where to look without asking every chain again.
 *
 * - Fresh for FRESH_MS; after that the stored map is still used at once while a new discovery runs in the background.
 * - Kept 30 days after the last lookup (`pruneSaved`), in memory in front of the database.
 * - Coins, sent transactions and contract code are NOT part of the map: they come from the search lookups, which are
 *   fresh on every visit, so a wallet that just started using a chain is never missed by safety pages.
 * - Chains whose holdings couldn't be confirmed are `unknown`; callers treat them as used (better scanned than missed).
 */
export interface WalletChains {
  /** Chain keys where the wallet held at least one token. */
  tokens: string[];
  /** Chain keys whose token holdings couldn't be checked. */
  unknown: string[];
  /** "alchemy": one discovery request; "rpc": the well-known-token check per chain (fallback). */
  source: "alchemy" | "rpc" | "mixed";
  checkedAt: string;
}

export const FRESH_MS = 6 * 3_600_000;
/** A first discovery waits at most this long; whatever isn't answered by then counts as unknown (scanned). */
export const FIRST_WAIT_MS = 2_000;
const RPC_CHECK_MS = 1_500;
const MEMORY_MAX = 20_000;

const memory: Map<string, WalletChains> = ((
  globalThis as { __crypyWalletChains?: Map<string, WalletChains> }
).__crypyWalletChains ??= new Map());
const running: Map<string, Promise<WalletChains>> = ((
  globalThis as { __crypyWalletChainsRunning?: Map<string, Promise<WalletChains>> }
).__crypyWalletChainsRunning ??= new Map());

/** For tests. */
export function resetWalletChains(): void {
  memory.clear();
  running.clear();
}

function remember(key: string, map: WalletChains) {
  memory.delete(key);
  memory.set(key, map);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

function candidateChains(): ChainConfig[] {
  return liveChains.filter((chain) => chain.capabilities.tokenBalances);
}

export interface DiscoverDeps {
  fetchPage?: FetchDiscoveryPage | null;
  holdsCommon?: (chain: ChainConfig, address: string) => Promise<boolean>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error("timeout")), ms))),
  ]).finally(() => clearTimeout(timer));
}

/** One discovery, now. Exported for tests (`deps` replaces the network). */
export async function discoverWalletChains(address: string, deps: DiscoverDeps = {}): Promise<WalletChains> {
  const started = Date.now();
  const chains = candidateChains();
  const tokens = new Set<string>();
  const unknown = new Set<string>();
  let usedAlchemy = false;
  let usedRpc = false;

  // 1. One request for every chain Alchemy indexes.
  const indexed = chains.filter((chain) => chain.alchemyNetwork);
  let rest = chains.filter((chain) => !chain.alchemyNetwork);
  const alchemy = indexed[0] ? alchemyProvider(indexed[0]) : null;
  const fetchPage = deps.fetchPage === undefined ? (alchemy ? alchemyDiscoveryFetcher(alchemy) : null) : deps.fetchPage;
  if (indexed.length > 0 && fetchPage) {
    try {
      const found = await discoverTokens(
        address,
        indexed.map((chain) => chain.alchemyNetwork!),
        fetchPage,
      );
      usedAlchemy = true;
      for (const chain of indexed) {
        if (found.held.has(chain.alchemyNetwork!)) tokens.add(chain.key);
        else if (found.unknown.has(chain.alchemyNetwork!)) rest.push(chain); // check it the other way
      }
    } catch {
      rest = chains; // discovery failed: the per-chain check for every chain
    }
  } else rest = chains;

  // 2. The well-known-token check (one multicall per chain) where discovery couldn't answer.
  const holdsCommon =
    deps.holdsCommon ??
    (async (chain: ChainConfig, owner: string) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      if (!adapter?.holdsCommonToken) throw new Error("not supported");
      return adapter.holdsCommonToken(chain, owner);
    });
  await Promise.all(
    rest.map(async (chain) => {
      usedRpc = true;
      try {
        if (await withTimeout(holdsCommon(chain, address), RPC_CHECK_MS)) tokens.add(chain.key);
        // Discovery listed more entries than it read: a "no" from the well-known list doesn't prove the chain is empty.
        else if (chain.alchemyNetwork && usedAlchemy) unknown.add(chain.key);
      } catch {
        unknown.add(chain.key);
      }
    }),
  );
  const map: WalletChains = {
    tokens: chains.filter((c) => tokens.has(c.key)).map((c) => c.key),
    unknown: chains.filter((c) => unknown.has(c.key) && !tokens.has(c.key)).map((c) => c.key),
    source: usedAlchemy && usedRpc ? "mixed" : usedAlchemy ? "alchemy" : "rpc",
    checkedAt: new Date().toISOString(),
  };
  logTiming(
    `wallet discovery (${map.source}): tokens on ${map.tokens.join(",") || "none"}` +
      `${map.unknown.length ? `, unknown ${map.unknown.join(",")}` : ""}, ${Date.now() - started} ms`,
  );
  return map;
}

/** Starts (or joins) a discovery for this wallet and stores the result. */
function refresh(key: string, address: string, background: boolean): Promise<WalletChains> {
  const existing = running.get(key);
  if (existing) return existing;
  const task = (background ? runInBackground(() => discoverWalletChains(address)) : discoverWalletChains(address))
    .then((map) => {
      // A map with every chain unknown says nothing: not stored, so the next visit tries again.
      if (map.unknown.length < candidateChains().length) {
        remember(key, map);
        void saveResults("wallet-chains", key, [{ chain: "*", data: map }]);
      }
      return map;
    })
    .finally(() => running.delete(key));
  task.catch(() => {});
  running.set(key, task);
  return task;
}

function everythingUnknown(): WalletChains {
  return {
    tokens: [],
    unknown: candidateChains().map((c) => c.key),
    source: "rpc",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * The wallet's activity map: memory, then the database, then a discovery. Stored maps older than FRESH_MS are used
 * at once and refreshed in the background. A first discovery is awaited at most FIRST_WAIT_MS. Never throws.
 */
export async function walletChains(address: string, now = Date.now()): Promise<WalletChains> {
  const key = address.toLowerCase();
  let map = memory.get(key);
  if (!map) {
    const saved = await readSavedOne<WalletChains>("wallet-chains", key, "*", now).catch(() => undefined);
    if (saved) {
      map = saved.data;
      remember(key, map);
    }
  }
  if (map) {
    if (now - Date.parse(map.checkedAt) > FRESH_MS) void refresh(key, address, true).catch(() => {});
    return map;
  }
  try {
    return await withTimeout(refresh(key, address, false), FIRST_WAIT_MS);
  } catch {
    return everythingUnknown();
  }
}
