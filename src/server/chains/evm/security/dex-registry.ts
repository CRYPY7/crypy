import "server-only";
import type { ChainKey } from "@/config/chains";
import { chainDex } from "../dex";

/**
 * Exchanges used by token security (pool discovery, liquidity and the trade test), per chain.
 *
 * Adding an exchange:
 *  - another Uniswap-v2-style fork (same factory/router design): one entry here, nothing else;
 *  - a new exchange design (Uniswap v4, Curve, Solidly…): an entry with its protocol, plus a pool reader and a
 *    trade simulator registered for that protocol in pools.ts / trade.ts.
 * Every router was checked on-chain on 2026-11-20: factory() and WETH() match (tests/unit/security-live.test.ts).
 */
export type DexProtocol = "uniswap-v2" | "uniswap-v3";

export interface DexDeployment {
  name: string;
  protocol: DexProtocol;
  factory: string;
  /** Router used by the trade simulator (v2-style). */
  router?: string;
  /** v3 fee tiers to look for. */
  fees?: number[];
  /** v3: the position manager whose NFTs hold the pool's positions (its factory() is checked in the live test). */
  positionManager?: string;
  /** Found through a lead, not in this registry. */
  unlisted?: boolean;
}

export const dexDeployments: Record<ChainKey, DexDeployment[]> = {
  ethereum: [
    {
      name: "Uniswap v2",
      protocol: "uniswap-v2",
      factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    },
    {
      name: "SushiSwap",
      protocol: "uniswap-v2",
      factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
      router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    },
    {
      name: "PancakeSwap v2",
      protocol: "uniswap-v2",
      factory: "0x1097053Fd2ea711dad45caCcc45EfF7548fCB362",
      router: "0xEfF92A263d31888d860bD50809A8D171709b7b1c",
    },
    {
      name: "Uniswap v3",
      protocol: "uniswap-v3",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      fees: [500, 3000, 10000],
      positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    },
    {
      name: "PancakeSwap v3",
      protocol: "uniswap-v3",
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      fees: [500, 2500, 10000],
      positionManager: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    },
  ],
  bsc: [
    {
      name: "PancakeSwap v2",
      protocol: "uniswap-v2",
      factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
      router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    },
    {
      name: "Uniswap v2",
      protocol: "uniswap-v2",
      factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
      router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    },
    {
      name: "Biswap",
      protocol: "uniswap-v2",
      factory: "0x858E3312ed3A876947EA49d572A7C42DE08af7EE",
      router: "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8",
    },
    // Liquidity only (no trade test router registered): pools and their holders are still checked.
    { name: "ApeSwap", protocol: "uniswap-v2", factory: "0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6" },
    { name: "BabySwap", protocol: "uniswap-v2", factory: "0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da" },
    { name: "BakerySwap", protocol: "uniswap-v2", factory: "0x01bF7C66c6BD861915CdaaE475042d3c4BaE16A7" },
    { name: "MDEX", protocol: "uniswap-v2", factory: "0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8" },
    {
      name: "PancakeSwap v3",
      protocol: "uniswap-v3",
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      fees: [100, 500, 2500, 10000],
      positionManager: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    },
    {
      name: "Uniswap v3",
      protocol: "uniswap-v3",
      factory: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
      fees: [100, 500, 3000, 10000],
      positionManager: "0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613",
    },
  ],
  // Base, Arbitrum, Polygon (2026-11-21). Routers and position managers from the exchanges' own docs, checked on-chain
  // (router factory() and WETH(), manager factory()). The first v2 router on each chain is the trade test's "hop" to
  // a stablecoin. Uniswap's Ethereum position-manager address holds unrelated code on Base; Base has its own.
  base: [
    {
      name: "Uniswap v2",
      protocol: "uniswap-v2",
      factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
      router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    },
    {
      name: "Uniswap v3",
      protocol: "uniswap-v3",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      fees: [100, 500, 3000, 10000],
      positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    },
    {
      name: "PancakeSwap v3",
      protocol: "uniswap-v3",
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      fees: [100, 500, 2500, 10000],
      positionManager: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    },
  ],
  arbitrum: [
    {
      name: "SushiSwap",
      protocol: "uniswap-v2",
      factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
      router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    },
    {
      name: "Uniswap v2",
      protocol: "uniswap-v2",
      factory: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
      router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    },
    {
      name: "Uniswap v3",
      protocol: "uniswap-v3",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      fees: [100, 500, 3000, 10000],
      positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    },
    {
      name: "PancakeSwap v3",
      protocol: "uniswap-v3",
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      fees: [100, 500, 2500, 10000],
      positionManager: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    },
  ],
  polygon: [
    {
      name: "QuickSwap",
      protocol: "uniswap-v2",
      factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
      router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
    },
    {
      name: "SushiSwap",
      protocol: "uniswap-v2",
      factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
      router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    },
    {
      name: "Uniswap v2",
      protocol: "uniswap-v2",
      factory: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
      router: "0xedf6066a2b290C185783862C7F4776A2C8077AD1",
    },
    {
      name: "Uniswap v3",
      protocol: "uniswap-v3",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      fees: [100, 500, 3000, 10000],
      positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    },
  ],
};

/** Tokens a pool can be paired with (the price engine's quote tokens: stablecoins and the wrapped native coin). */
export const pairTokens = (chain: ChainKey) => chainDex[chain].quotes;
export const wrappedNative = (chain: ChainKey) => chainDex[chain].quotes.find((q) => q.role === "wrapped-native")!;

/** Trade test size: about $10 worth of the native coin, never more than 0.5% of the pool's native side. */
export const tradeTestSize: Record<ChainKey, bigint> = {
  ethereum: 5_000_000_000_000_000n, // 0.005 ETH
  bsc: 20_000_000_000_000_000n, // 0.02 BNB
  // About $10 of the coin, as on the other chains.
  base: 5_000_000_000_000_000n, // 0.005 ETH
  arbitrum: 5_000_000_000_000_000n, // 0.005 ETH
  polygon: 100_000_000_000_000_000_000n, // 100 POL (≈ $7.5 at $0.075)
};
