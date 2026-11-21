import "server-only";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import { type ChainHoldings, buildChainHoldings } from "@/lib/portfolio/holdings";
import { registry } from "@/server/chains/registry";
import { logTiming } from "@/server/diagnostics";

export interface AddressOverview {
  chains: ChainHoldings[];
  /** Chains that couldn't be read right now. */
  unavailable: ChainKey[];
  /** False when the price provider failed: balances are shown, values are not. */
  pricesAvailable: boolean;
  totalUsd: number;
  fetchedAt: string;
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
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });

  const targets = liveChains.filter((chain) => chain.capabilities.tokenBalances && (!only || only.includes(chain.key)));
  // Each chain is priced as soon as its own balances arrive: a slow chain never holds up the others' prices.
  const MAX_PRICED = 300;
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((candidate) => candidate.family === chain.family);
      if (!adapter?.getBalances) throw new Error("Balances not supported");
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
