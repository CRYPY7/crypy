/**
 * Names for well-known contracts, kept in our own code (no label API). Only widely documented, official
 * deployments are listed; `tests/unit/tx-live.test.ts` checks each one is a contract on its chain.
 * A name is a label to help people read a transaction. It is never a safety verdict.
 */
export type KnownKind = "router" | "aggregator" | "permit" | "wrapped" | "token" | "burn" | "entrypoint";

/** Protocols whose own summary events we read, and only when this exact contract emitted them. */
export type ReportingProtocol = "kyberswap" | "erc4337";

export interface KnownContract {
  name: string;
  kind: KnownKind;
  /** This contract's summary events (e.g. "Swapped") are read as reports from it. */
  reports?: ReportingProtocol;
}

const shared: Record<string, KnownContract> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": { name: "Uniswap Permit2", kind: "permit" },
  "0x111111125421ca6dc452d289314280a0f8842a65": { name: "1inch Aggregation Router v6", kind: "aggregator" },
  "0x1111111254eeb25477b68fb85ed929f73a960582": { name: "1inch Aggregation Router v5", kind: "aggregator" },
  // Same address on Ethereum and BNB Chain (KyberSwap docs: MetaAggregationRouterV2).
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": {
    name: "KyberSwap Aggregation Router",
    kind: "aggregator",
    reports: "kyberswap",
  },
  // ERC-4337 EntryPoint v0.6 and v0.7 (same address on every EVM chain).
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789": {
    name: "ERC-4337 EntryPoint v0.6",
    kind: "entrypoint",
    reports: "erc4337",
  },
  "0x0000000071727de22e5e9d8baf0edac6f37da032": {
    name: "ERC-4337 EntryPoint v0.7",
    kind: "entrypoint",
    reports: "erc4337",
  },
};

/** Addresses that can't hold keys: tokens sent here are gone for good. Same on every EVM chain. */
export const burnAddresses: Record<string, KnownContract> = {
  "0x0000000000000000000000000000000000000000": { name: "Null address", kind: "burn" },
  "0x000000000000000000000000000000000000dead": { name: "Burn address (0x…dEaD)", kind: "burn" },
};

const byChain: Record<string, Record<string, KnownContract>> = {
  ethereum: {
    ...shared,
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": { name: "Uniswap V2 Router", kind: "router" },
    "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3 Router", kind: "router" },
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { name: "Uniswap V3 Router 2", kind: "router" },
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Universal Router", kind: "router" },
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af": { name: "Uniswap Universal Router (v4)", kind: "router" },
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff": { name: "0x Exchange Proxy", kind: "aggregator" },
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { name: "Wrapped Ether (WETH)", kind: "wrapped" },
    "0xdac17f958d2ee523a2206206994597c13d831ec7": { name: "Tether USD (USDT)", kind: "token" },
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { name: "USD Coin (USDC)", kind: "token" },
    "0x6b175474e89094c44da98b954eedeac495271d0f": { name: "Dai Stablecoin (DAI)", kind: "token" },
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { name: "Wrapped BTC (WBTC)", kind: "token" },
  },
  bsc: {
    ...shared,
    "0x10ed43c718714eb63d5aa57b78b54704e256024e": { name: "PancakeSwap Router v2", kind: "router" },
    "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": { name: "PancakeSwap Smart Router v3", kind: "router" },
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { name: "Wrapped BNB (WBNB)", kind: "wrapped" },
    "0x55d398326f99059ff775485246999027b3197955": { name: "Tether USD (USDT)", kind: "token" },
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { name: "USD Coin (USDC)", kind: "token" },
    "0xe9e7cea3dedca5984780bafc599bd69add087d56": { name: "Binance-Peg BUSD (BUSD)", kind: "token" },
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { name: "Binance-Peg BTCB (BTCB)", kind: "token" },
    "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": { name: "PancakeSwap Token (CAKE)", kind: "token" },
  },
};

export function knownContract(chain: string, address: string | null | undefined): KnownContract | null {
  if (!address) return null;
  const key = address.toLowerCase();
  return burnAddresses[key] ?? byChain[chain]?.[key] ?? null;
}

/** For tests: every listed contract per chain (burn addresses excluded). */
export function knownContractsFor(chain: string): string[] {
  return Object.keys(byChain[chain] ?? {});
}
