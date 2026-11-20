/** Live on-chain price checks. Run with: LIVE=1 pnpm test tests/unit/prices-live.test.ts */
import { describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { getEvmClient } from "@/server/chains/evm/providers";
import { getOnchainPrices } from "@/server/chains/evm/prices";

const live = process.env.LIVE === "1";

describe.skipIf(!live)("on-chain prices", () => {
  it("prices BNB and major BNB Chain tokens from PancakeSwap pools", async () => {
    const chain = getChain("bsc")!;
    const tokens = [
      { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 }, // BTCB
      { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 }, // ETH
      { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 }, // CAKE
    ];
    const prices = await getOnchainPrices(getEvmClient(chain), chain, tokens);
    console.info(
      "bsc",
      prices.native,
      [...prices.tokens].map(
        ([k, v]) => `${k.slice(0, 8)}=${v.usd.toFixed(4)} (${v.dex}, depth $${Math.round(v.depthUsd)})`,
      ),
    );
    expect(prices.native!.usd).toBeGreaterThan(50);
    for (const t of tokens) expect(prices.tokens.get(t.address.toLowerCase())?.usd).toBeGreaterThan(0);
  }, 60_000);

  it("prices ETH and major Ethereum tokens from Uniswap pools", async () => {
    const chain = getChain("ethereum")!;
    const tokens = [
      { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 }, // WBTC
      { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 }, // LINK
      { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 }, // PEPE
    ];
    const prices = await getOnchainPrices(getEvmClient(chain), chain, tokens);
    console.info(
      "eth",
      prices.native,
      [...prices.tokens].map(([k, v]) => `${k.slice(0, 8)}=${v.usd} (${v.dex}, depth $${Math.round(v.depthUsd)})`),
    );
    expect(prices.native!.usd).toBeGreaterThan(100);
    for (const t of tokens) expect(prices.tokens.get(t.address.toLowerCase())?.usd).toBeGreaterThan(0);
  }, 60_000);
});
