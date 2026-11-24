import "server-only";
import { assertChainUp } from "@/server/fault";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import { type ChainHoldings, buildChainHoldings } from "@/lib/portfolio/holdings";
import { registry } from "@/server/chains/registry";
import { logTiming } from "@/server/diagnostics";
import { readSaved, saveResults } from "@/server/saved/store";

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
  const fresh = await addressOverview(address, only);
  const overview = await withSavedChains(address, fresh);
  // A full answer is kept 30 minutes (refreshed in the background); one with a chain missing or from saved only
  // for a second (shared by requests at the same moment), so "Try again" and the next visit read again.
  if (overview.unavailable.length > 0 || overview.saved) cacheLife({ stale: 0, revalidate: 1, expire: 1 });
  else cacheLife({ stale: 30, revalidate: 60, expire: 1800 });
  return overview;
}

/**
 * Saves each chain's reading (with prices) and fills chains that failed now from their last reading (up to 7 days
 * old), marked with its time. A complete reading is never replaced by an incomplete one. Only for pages: the health checks and the alerts checker
 * use `addressOverview` and always see the chains as they are now.
 */
export async function withSavedChains(address: string, fresh: AddressOverview): Promise<AddressOverview> {
  // Readings without prices are never saved; a cut-off or well-known-only token list is saved as incomplete, so it
  // can fill a gap but never replace a complete reading.
  const usable = fresh.chains.filter((c) => c.pricesRead !== false);
  void saveResults(
    "balances",
    address,
    usable.map((c) => ({ chain: c.chain, data: c, quality: c.coverage === "full" ? 2 : 1 })),
  );
  if (fresh.unavailable.length === 0) return fresh;
  const saved = await readSaved<ChainHoldings>("balances", address, fresh.unavailable);
  if (saved.size === 0) return fresh;
  const chains = [...fresh.chains, ...[...saved.values()].map((s) => s.data)];
  return {
    ...fresh,
    chains,
    unavailable: fresh.unavailable.filter((c) => !saved.has(c)),
    totalUsd: chains.reduce((sum, chain) => sum + chain.totalUsd, 0),
    saved: Object.fromEntries([...saved].map(([chain, s]) => [chain, s.savedAt])),
  };
}

/** The same without the page cache, for the background alerts checker (runs outside page requests). */
export async function addressOverview(address: string, only?: readonly string[]): Promise<AddressOverview> {
  const targets = liveChains.filter((chain) => chain.capabilities.tokenBalances && (!only || only.includes(chain.key)));
  // Each chain is priced as soon as its own balances arrive: a slow chain never holds up the others' prices.
  const MAX_PRICED = 300;
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((candidate) => candidate.family === chain.family);
      if (!adapter?.getBalances) throw new Error("Balances not supported");
      assertChainUp(chain.key, address);
      const started = Date.now();
      const balances = await adapter.getBalances(chain, address);
      const listed = Date.now();
      // Well-known tokens are priced first, so a wallet with thousands of airdrops never loses their prices.
      const common = new Set(chain.commonTokens.map((t) => t.toLowerCase()));
      const tokens = balances.tokens
        .filter((token) => token.info)
        .sort((a, b) => Number(common.has(b.address.toLowerCase())) - Number(common.has(a.address.toLowerCase())))
        .slice(0, MAX_PRICED)
        .map((token) => ({ address: token.address, decimals: token.info!.decimals }));
      let prices: Awaited<ReturnType<NonNullable<typeof adapter.getUsdPrices>>> | null = null;
      try {
        prices = (await adapter.getUsdPrices?.(chain, tokens)) ?? null;
      } catch {
        prices = null;
      }
      logTiming(
        `overview ${chain.key}: balances ${listed - started} ms (${balances.tokens.length} tokens, ${balances.coverage}), ` +
          `prices ${Date.now() - listed} ms (${tokens.length} tokens)`,
      );
      return { chain, balances, prices };
    }),
  );

  const priced = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const unavailable = targets.filter((_, i) => settled[i]?.status === "rejected").map((chain) => chain.key);

  const chains = priced.map(({ chain, balances, prices }) => ({
    ...buildChainHoldings(
      balances,
      { symbol: chain.nativeSymbol, name: nativeNames[chain.key], priceKey: "native" },
      prices,
      (token) => token.toLowerCase(),
    ),
    pricesRead: prices !== null,
  }));
  const pricesAvailable = priced.some((entry) => entry.prices !== null) || priced.length === 0;

  return {
    chains,
    unavailable,
    pricesAvailable,
    totalUsd: chains.reduce((sum, chain) => sum + chain.totalUsd, 0),
    fetchedAt: new Date().toISOString(),
  };
}
