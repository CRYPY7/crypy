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
  // Base, Arbitrum, Polygon: factories checked on-chain 2026-11-21 (each lists a WETH/WPOL–USDC pool).
  base: {
    quotes: [
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, role: "stable" }, // USDC
      { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6, role: "stable" }, // USDT
      { address: "0x4200000000000000000000000000000000000006", decimals: 18, role: "wrapped-native" }, // WETH
    ],
    dexes: [
      {
        name: "Uniswap v3",
        protocol: "v3",
        factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        fees: [100, 500, 3000, 10000],
      },
      { name: "Uniswap v2", protocol: "v2", factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" },
      {
        name: "PancakeSwap v3",
        protocol: "v3",
        factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
        fees: [100, 500, 2500, 10000],
      },
    ],
  },
  arbitrum: {
    quotes: [
      { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, role: "stable" }, // USDC
      { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6, role: "stable" }, // USDT
      { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, role: "wrapped-native" }, // WETH
    ],
    dexes: [
      {
        name: "Uniswap v3",
        protocol: "v3",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        fees: [100, 500, 3000, 10000],
      },
      { name: "SushiSwap", protocol: "v2", factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4" },
    ],
  },
  polygon: {
    quotes: [
      { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, role: "stable" }, // USDC
      { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, role: "stable" }, // USDT
      { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, role: "wrapped-native" }, // WPOL
    ],
    dexes: [
      {
        name: "Uniswap v3",
        protocol: "v3",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        fees: [100, 500, 3000, 10000],
      },
      { name: "QuickSwap", protocol: "v2", factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32" },
    ],
  },
};

/**
 * Factories used to recognise liquidity pools in transactions (not for pricing, which stays on `dexes` to stay fast).
 * A pool counts as verified only when one of these factories lists it (getPair / getPool), because any contract can
 * claim a factory. All addresses were checked on-chain on 2026-11-20 (allPairsLength / owner answered).
 */
export const poolFactories: Record<ChainKey, { name: string; protocol: "v2" | "v3"; factory: string }[]> = {
  ethereum: [
    ...chainDex.ethereum.dexes.map(({ name, protocol, factory }) => ({ name, protocol, factory })),
    { name: "SushiSwap", protocol: "v2", factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac" },
    { name: "PancakeSwap v2", protocol: "v2", factory: "0x1097053Fd2ea711dad45caCcc45EfF7548fCB362" },
    { name: "PancakeSwap v3", protocol: "v3", factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" },
  ],
  bsc: [
    ...chainDex.bsc.dexes.map(({ name, protocol, factory }) => ({ name, protocol, factory })),
    { name: "Uniswap v2", protocol: "v2", factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" },
    { name: "Uniswap v3", protocol: "v3", factory: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7" },
    { name: "Biswap", protocol: "v2", factory: "0x858E3312ed3A876947EA49d572A7C42DE08af7EE" },
  ],
  base: [...chainDex.base.dexes.map(({ name, protocol, factory }) => ({ name, protocol, factory }))],
  arbitrum: [
    ...chainDex.arbitrum.dexes.map(({ name, protocol, factory }) => ({ name, protocol, factory })),
    { name: "Uniswap v2", protocol: "v2", factory: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9" },
    { name: "PancakeSwap v3", protocol: "v3", factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" },
  ],
  polygon: [
    ...chainDex.polygon.dexes.map(({ name, protocol, factory }) => ({ name, protocol, factory })),
    { name: "SushiSwap", protocol: "v2", factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4" },
    { name: "Uniswap v2", protocol: "v2", factory: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C" },
  ],
};
