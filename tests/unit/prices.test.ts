import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { chainDex } from "@/server/chains/evm/dex";
import { MIN_DEPTH_USD, bestPrices, v2Price, v3Price } from "@/server/chains/evm/prices";

describe("on-chain price maths", () => {
  it("reads v2 prices from pool balances with different decimals", () => {
    // 2 tokens (18 dec) against 1,000 USDC (6 dec) → $500 per token
    expect(v2Price(2n * 10n ** 18n, 1_000n * 10n ** 6n, 18, 6)).toBe(500);
    expect(v2Price(0n, 1n, 18, 18)).toBeNull();
  });

  it("reads v3 prices whichever side of the pool the token is on", () => {
    // sqrtPriceX96 for raw ratio 4 (token1 per token0) → token0 is worth 4 token1, token1 is worth 0.25 token0
    const sqrt = 2n * 2n ** 96n;
    const low = "0x0000000000000000000000000000000000000001";
    const high = "0x0000000000000000000000000000000000000002";
    expect(v3Price(sqrt, low, high, 18, 18)).toBeCloseTo(4);
    expect(v3Price(sqrt, high, low, 18, 18)).toBeCloseTo(0.25);
    // Decimals: token 18, quote 6, raw ratio 4e-12 → 4 quote units per token
    const sqrtSmall = BigInt(Math.round(Math.sqrt(4e-12) * 2 ** 96));
    expect(v3Price(sqrtSmall, low, high, 18, 6)).toBeCloseTo(4, 3);
    expect(v3Price(0n, low, high, 18, 18)).toBeNull();
  });

  it("uses the deepest pool and ignores pools below the minimum depth", () => {
    const usdc = { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, role: "stable" as const };
    const token = { address: "0x1111111111111111111111111111111111111111", decimals: 18 };
    const dex = { name: "Test DEX", protocol: "v2" as const, factory: "0x0" };
    const quoteUsd = new Map([[usdc.address.toLowerCase(), 1]]);
    const prices = bestPrices(
      [
        { candidate: { token, quote: usdc, dex }, priceInQuote: 999, quoteAmount: MIN_DEPTH_USD - 1 }, // scam pool: too shallow
        { candidate: { token, quote: usdc, dex }, priceInQuote: 2, quoteAmount: 10_000 },
        {
          candidate: { token, quote: usdc, dex: { ...dex, name: "Deep DEX" } },
          priceInQuote: 2.1,
          quoteAmount: 90_000,
        },
      ],
      quoteUsd,
    );
    expect(prices.get(token.address)).toEqual({ usd: 2.1, depthUsd: 90_000, dex: "Deep DEX" });
  });

  it("has valid checksummed DEX and quote addresses", () => {
    for (const config of Object.values(chainDex)) {
      for (const address of [...config.quotes.map((q) => q.address), ...config.dexes.map((d) => d.factory)]) {
        expect(getAddress(address)).toBe(address);
      }
      expect(config.quotes.filter((q) => q.role === "wrapped-native")).toHaveLength(1);
    }
  });
});
