import "server-only";
import type { ChainKey } from "@/config/chains";

/**
 * DEX settings used by the on-chain price engine (and later by the Market tab, M5.5).
 * Factory addresses are the official deployments; checksums are verified by a unit test.
 */
export interface QuoteToken {
  address: string;
  decimals: number;
  /** Stablecoins are the USD anchor ($1). The wrapped native coin is priced against them first. */
  role: "stable" | "wrapped-native";
}

export interface DexConfig {
  name: string;
  protocol: "v2" | "v3";
  factory: string;
  /** v3 fee tiers to check (hundredths of a basis point). */
  fees?: number[];
}

export interface ChainDex {
  quotes: QuoteToken[];
  dexes: DexConfig[];
}

export const chainDex: Record<ChainKey, ChainDex> = {
  ethereum: {
    quotes: [
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, role: "stable" }, // USDC
      { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, role: "stable" }, // USDT
      { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, role: "wrapped-native" }, // WETH
    ],
    dexes: [
      { name: "Uniswap v2", protocol: "v2", factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" },
      {
        name: "Uniswap v3",
        protocol: "v3",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        fees: [500, 3000, 10000],
      },
    ],
  },
  bsc: {
    quotes: [
      { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, role: "stable" }, // USDT
      { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, role: "stable" }, // USDC
      { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18, role: "wrapped-native" }, // WBNB
    ],
    dexes: [
      { name: "PancakeSwap v2", protocol: "v2", factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" },
      {
        name: "PancakeSwap v3",
        protocol: "v3",
        factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
        fees: [100, 500, 2500, 10000],
      },
    ],
  },
};
