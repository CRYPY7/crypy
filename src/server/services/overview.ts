import "server-only";
import { chainDrill } from "@/server/fault";
import { cacheLife } from "next/cache";
import { type ChainConfig, type ChainKey, liveChains } from "@/config/chains";
import { type ChainHoldings, buildChainHoldings } from "@/lib/portfolio/holdings";
import { registry } from "@/server/chains/registry";
import { pricesFor } from "@/server/tokens/prices";
import { logTiming } from "@/server/diagnostics";
import { freshOrSaved } from "@/server/saved/fresh-or-saved";
import { readSavedOne, saveResults } from "@/server/saved/store";

export interface AddressOverview {
  chains: ChainHoldings[];
  /** Chains that couldn't be read right now. */
  unavailable: ChainKey[];
  /** False when the price provider failed: balances are shown, values are not. */
  pricesAvailable: boolean;
  totalUsd: number;
  fetchedAt: string;
  /**
   * Chains shown from their last full reading because a fresh read failed now (stabilization S2), with the time of
   * that reading (ISO). Their holdings are in `chains`; they are not in `unavailable`.
   */
  saved?: Partial<Record<ChainKey, string>>;
  /** Chains shown from their last reading while a slow fresh read finishes in the background (ISO time). */
  refreshing?: Partial<Record<ChainKey, string>>;
  /** B-035: chains whose token list is still being read in the background (the page looks again shortly). */
  completing?: ChainKey[];
}

const nativeNames: Record<ChainKey, string> = {
  ethereum: "Ether",
  bsc: "BNB",
  base: "Ether",
  arbitrum: "Ether",
  polygon: "POL",
};

/**
 * Balances and USD values on every live chain that supports balances. One chain failing never hides the
 * others. Cached briefly per address, so repeat visits and refreshes don't spend provider quota.
 */
/** `only`: which chains to scan (from the chain picker); all supported chains when omitted. */
export async function cachedAddressOverview(address: string, only?: readonly string[]): Promise<AddressOverview> {
  "use cache";
  const overview = await pageOverview(address, only);
  // A full, fresh answer is kept 30 minutes (refreshed in the background); one with a chain missing or shown from a
  // saved reading only for a second, so "Try again" and the page's own reload read again.
  if (overview.unavailable.length > 0 || overview.saved || overview.refreshing || overview.completing)
    cacheLife({ stale: 0, revalidate: 1, expire: 1 });
  else cacheLife({ stale: 30, revalidate: 60, expire: 1800 });
  return overview;
}

const CHECKS_KEEP_MS = 60_000;
const CHECKS_MAX = 2_000;
const forChecks: Map<string, { at: number; promise: Promise<AddressOverview> }> = ((
  globalThis as { __crypyOverviewForChecks?: Map<string, { at: number; promise: Promise<AddressOverview> }> }
).__crypyOverviewForChecks ??= new Map());

/**
 * The holdings that Approvals and Activity need inside their own cached functions (held tokens, spam tokens).
 *
 * Not a "use cache" function on purpose (R2, found on the server 2026-11-28): Next.js stores a cached function's
 * result only once every cached function it started has finished. Approvals and Activity start this without waiting
 * for it (so their answer isn't delayed), and when it was `cachedAddressOverview` a second request for the same
 * wallet waited for the whole balance read (4–6 s) even though the first request had answered in 0.3 s. Shared in
 * memory for a minute instead; the per-chain reads underneath are the same shared reads the pages use.
 */
export function overviewForChecks(
  address: string,
  only?: readonly string[],
  now = Date.now(),
): Promise<AddressOverview> {
  const key = `${address.toLowerCase()}|${only?.join(",") ?? "*"}`;
  const hit = forChecks.get(key);
  if (hit && now - hit.at < CHECKS_KEEP_MS) return hit.promise;
  if (forChecks.size >= CHECKS_MAX) {
    for (const [k, v] of forChecks) if (now - v.at >= CHECKS_KEEP_MS) forChecks.delete(k);
    if (forChecks.size >= CHECKS_MAX) forChecks.delete(forChecks.keys().next().value!);
  }
  const promise = pageOverview(address, only);
  forChecks.set(key, { at: now, promise });
  promise.catch(() => forChecks.delete(key));
  return promise;
}

/** For tests. */
export function resetOverviewForChecks(): void {
  forChecks.clear();
}

/**
 * For pages (stabilization S2): each chain is read fresh; a chain whose read fails, or takes longer than a moment,
 * shows its last saved reading (up to 7 days old) with its time, while the fresh read finishes in the background
 * and is saved. Readings without prices are never saved; a cut-off or well-known-only token list is saved as
 * incomplete, so it can fill a gap but never replace a complete reading. The health checks and the alerts checker
 * use `addressOverview` and always see the chains as they are now.
 */
export async function pageOverview(address: string, only?: readonly string[]): Promise<AddressOverview> {
  const targets = balanceChains(only);
  const results = await Promise.all(
    targets.map((chain) =>
      freshOrSaved<ChainHoldings>(
        `balances|${address.toLowerCase()}|${chain.key}`,
        () => readChainHoldings(chain, address),
        () => readSavedOne<ChainHoldings>("balances", address, chain.key),
        (holdings) => {
          if (holdings.pricesRead === false) return;
          void saveResults("balances", address, [
            { chain: holdings.chain, data: holdings, quality: holdings.coverage === "full" ? 2 : 1 },
          ]);
        },
      ),
    ),
  );
  const chains: ChainHoldings[] = [];
  const unavailable: ChainKey[] = [];
  const saved: Partial<Record<ChainKey, string>> = {};
  const refreshing: Partial<Record<ChainKey, string>> = {};
  const completing: ChainKey[] = [];
  results.forEach((result, i) => {
    const key = targets[i]!.key;
    if (result.kind === "failed") return unavailable.push(key);
    chains.push(result.value);
    if (result.kind === "saved") (result.refreshing ? refreshing : saved)[key] = result.savedAt;
    else if (result.value.completing) completing.push(key);
  });
  return {
    chains,
    unavailable,
    pricesAvailable: chains.length === 0 || chains.some((c) => c.pricesRead !== false),
    totalUsd: chains.reduce((sum, chain) => sum + chain.totalUsd, 0),
    fetchedAt: new Date().toISOString(),
    ...(Object.keys(saved).length ? { saved } : {}),
    ...(Object.keys(refreshing).length ? { refreshing } : {}),
    ...(completing.length ? { completing } : {}),
  };
}

/** The same without the page cache, for the background alerts checker (runs outside page requests). */
export async function addressOverview(address: string, only?: readonly string[]): Promise<AddressOverview> {
  const targets = balanceChains(only);
  const settled = await Promise.allSettled(targets.map((chain) => readChainHoldings(chain, address)));
  const chains = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const unavailable = targets.filter((_, i) => settled[i]?.status === "rejected").map((chain) => chain.key);
  return {
    chains,
    unavailable,
    pricesAvailable: chains.length === 0 || chains.some((c) => c.pricesRead !== false),
    totalUsd: chains.reduce((sum, chain) => sum + chain.totalUsd, 0),
    fetchedAt: new Date().toISOString(),
  };
}

function balanceChains(only?: readonly string[]): ChainConfig[] {
  return liveChains.filter((chain) => chain.capabilities.tokenBalances && (!only || only.includes(chain.key)));
}

/** Well-known tokens are priced first, so a wallet with thousands of airdrops never loses their prices. */
const MAX_PRICED = 300;

/** One chain's balances and prices, read now. Each chain is priced as soon as its own balances arrive. */
export async function readChainHoldings(chain: ChainConfig, address: string): Promise<ChainHoldings> {
  const adapter = registry.adapters.find((candidate) => candidate.family === chain.family);
  if (!adapter?.getBalances) throw new Error("Balances not supported");
  await chainDrill(chain.key, address);
  const started = Date.now();
  const balances = await adapter.getBalances(chain, address);
  const listed = Date.now();
  const common = new Set(chain.commonTokens.map((t) => t.toLowerCase()));
  const tokens = balances.tokens
    .filter((token) => token.info)
    .sort((a, b) => Number(common.has(b.address.toLowerCase())) - Number(common.has(a.address.toLowerCase())))
    .slice(0, MAX_PRICED)
    .map((token) => ({ address: token.address, decimals: token.info!.decimals }));
  // Stored prices first; only tokens without a recent price (or recent "no price") are priced live (R1 part 2).
  const prices = adapter.getUsdPrices
    ? await pricesFor(chain.key, tokens, (missing) => adapter.getUsdPrices!(chain, missing), { keepTokens: common })
    : null;
  logTiming(
    `overview ${chain.key}: balances ${listed - started} ms (${balances.tokens.length} tokens, ${balances.coverage}), ` +
      `prices ${Date.now() - listed} ms (${tokens.length} tokens)`,
  );
  return {
    ...buildChainHoldings(
      balances,
      { symbol: chain.nativeSymbol, name: nativeNames[chain.key as ChainKey], priceKey: "native" },
      prices,
      (token) => token.toLowerCase(),
    ),
    pricesRead: prices !== null,
    readMs: { balances: listed - started, prices: Date.now() - listed },
  };
}
