import "server-only";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import { type ChainHoldings, buildChainHoldings } from "@/lib/portfolio/holdings";
import { registry } from "@/server/chains/registry";

export interface AddressOverview {
  chains: ChainHoldings[];
  /** Chains that couldn't be read right now. */
  unavailable: ChainKey[];
  /** False when the price provider failed: balances are shown, values are not. */
  pricesAvailable: boolean;
  totalUsd: number;
  fetchedAt: string;
}

const nativeNames: Record<ChainKey, string> = { ethereum: "Ether", bsc: "BNB" };

/**
 * Balances and USD values on every live chain that supports balances. One chain failing never hides the
 * others. Cached briefly per address, so repeat visits and refreshes don't spend provider quota.
 */
export async function cachedAddressOverview(address: string): Promise<AddressOverview> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });

  const targets = liveChains.filter((chain) => chain.capabilities.tokenBalances);
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((candidate) => candidate.family === chain.family);
      if (!adapter?.getBalances) throw new Error("Balances not supported");
      return { chain, balances: await adapter.getBalances(chain, address) };
    }),
  );

  const loaded = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const unavailable = targets.filter((_, i) => settled[i]?.status === "rejected").map((chain) => chain.key);

  // Prices from our own on-chain engine, per chain. A chain whose prices fail still shows balances.
  const MAX_PRICED = 300;
  const priced = await Promise.all(
    loaded.map(async ({ chain, balances }) => {
      const adapter = registry.adapters.find((candidate) => candidate.family === chain.family);
      const tokens = balances.tokens
        .filter((token) => token.info)
        .slice(0, MAX_PRICED)
        .map((token) => ({ address: token.address, decimals: token.info!.decimals }));
      try {
        return { chain, balances, prices: (await adapter?.getUsdPrices?.(chain, tokens)) ?? null };
      } catch {
        return { chain, balances, prices: null };
      }
    }),
  );

  const chains = priced.map(({ chain, balances, prices }) =>
    buildChainHoldings(
      balances,
      { symbol: chain.nativeSymbol, name: nativeNames[chain.key], priceKey: "native" },
      prices,
      (token) => token.toLowerCase(),
    ),
  );
  const pricesAvailable = priced.some((entry) => entry.prices !== null) || priced.length === 0;

  return {
    chains,
    unavailable,
    pricesAvailable,
    totalUsd: chains.reduce((sum, chain) => sum + chain.totalUsd, 0),
    fetchedAt: new Date().toISOString(),
  };
}
