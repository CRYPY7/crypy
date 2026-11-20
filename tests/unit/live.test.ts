/**
 * Live checks against real BNB Chain and Ethereum nodes. Skipped by default (they need the network).
 * Run with:  LIVE=1 pnpm test tests/unit/live.test.ts
 */
import { describe, expect, it } from "vitest";
import { registry } from "@/server/chains/registry";
import { getChain } from "@/config/chains";
import { buildChainHoldings } from "@/lib/portfolio/holdings";
import { resolveSearch } from "@/server/services/resolve";

const live = process.env.LIVE === "1";

describe.skipIf(!live)("live blockchain data", () => {
  it("finds USDT as a token on Ethereum", async () => {
    const result = await resolveSearch("0xdAC17F958D2ee523a2206206994597C13D831ec7", registry);
    // The same address may also be in use on the other chain, so look for this chain's entry.
    const choice = result.status === "address" ? result.choices.find((c) => c.chain === "ethereum") : undefined;
    expect(choice).toMatchObject({ kind: "token", path: "/token/ethereum/0xdAC17F958D2ee523a2206206994597C13D831ec7" });
  }, 30_000);

  it("finds USDT as a token on BNB Chain", async () => {
    const result = await resolveSearch("0x55d398326f99059fF775485246999027B3197955", registry);
    // The same address may also be in use on the other chain, so look for this chain's entry.
    const choice = result.status === "address" ? result.choices.find((c) => c.chain === "bsc") : undefined;
    expect(choice).toMatchObject({ kind: "token", path: "/token/bsc/0x55d398326f99059fF775485246999027B3197955" });
  }, 30_000);

  it("treats a made-up transaction hash as not found", async () => {
    const result = await resolveSearch(`0x${"0123456789abcdef".repeat(4)}`, registry);
    expect(result.status).toBe("not-found");
  }, 30_000);

  /** A large exchange wallet that holds many tokens on both chains (public, well known). */
  const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

  for (const key of ["ethereum", "bsc"] as const) {
    it(`reads real balances and USD values on ${key}`, async () => {
      const chain = getChain(key)!;
      const adapter = registry.adapters.find((candidate) => candidate.family === chain.family)!;
      const balances = await adapter.getBalances!(chain, WHALE);
      // With an Alchemy key the full list is read; without one, only well-known tokens.
      expect(["full", "truncated", "common-only"]).toContain(balances.coverage);
      expect(balances.tokens.length).toBeGreaterThan(0);
      const prices = await adapter.getUsdPrices!(
        chain,
        balances.tokens.filter((t) => t.info).map((t) => ({ address: t.address, decimals: t.info!.decimals })),
      );
      const holdings = buildChainHoldings(
        balances,
        { symbol: chain.nativeSymbol, name: chain.name, priceKey: "native" },
        prices,
        (token) => token.toLowerCase(),
      );
      expect(holdings.totalUsd).toBeGreaterThan(1_000_000);
      console.info(
        key,
        balances.coverage,
        `${holdings.visible.length} visible, ${holdings.hidden.length} hidden, ${holdings.unpricedCount} unpriced`,
        holdings.visible
          .slice(0, 4)
          .map((h) => `${h.symbol}=$${Math.round(h.valueUsd ?? 0).toLocaleString("en")}`)
          .join(" "),
      );
    }, 60_000);
  }
});
