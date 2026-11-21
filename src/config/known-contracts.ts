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
  // PancakeSwap's own Permit2 deployment (developer.pancakeswap.finance): BNB Chain, Ethereum, Base, Arbitrum.
  "0x31c2f6fcff4f8759b3bd5bf0e1084a055615c768": { name: "PancakeSwap Permit2", kind: "permit" },
  // 0x AllowanceHolder for Cancun chains incl. Ethereum and BNB Chain (docs.0x.org, core concepts: contracts).
  "0x0000000000001ff3684f28c67538d4d072c22734": { name: "0x AllowanceHolder", kind: "aggregator" },
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
    "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb": { name: "PancakeSwap Universal Router", kind: "router" },
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { name: "Wrapped BNB (WBNB)", kind: "wrapped" },
    "0x55d398326f99059ff775485246999027b3197955": { name: "Tether USD (USDT)", kind: "token" },
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { name: "USD Coin (USDC)", kind: "token" },
    "0xe9e7cea3dedca5984780bafc599bd69add087d56": { name: "Binance-Peg BUSD (BUSD)", kind: "token" },
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { name: "Binance-Peg BTCB (BTCB)", kind: "token" },
    "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": { name: "PancakeSwap Token (CAKE)", kind: "token" },
  },
  // Base, Arbitrum, Polygon (2026-11-21): every address below was checked to have code on its chain. The Ethereum
  // Uniswap V3 router addresses hold unrelated code on Base, so they are listed only where they are Uniswap's.
  base: {
    ...shared,
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Universal Router", kind: "router" },
    "0x6ff5693b99212da76ad316178a184ab56d299b43": { name: "Uniswap Universal Router (v4)", kind: "router" },
    "0x2626664c2603336e57b271c5c0b26f421741e481": { name: "Uniswap V3 Router 2", kind: "router" },
    "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24": { name: "Uniswap V2 Router", kind: "router" },
    "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": { name: "Aerodrome Router", kind: "router" },
    "0x678aa4bf4e210cf2166753e054d5b7c31cc7fa86": { name: "PancakeSwap Smart Router v3", kind: "router" },
    "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb": { name: "PancakeSwap Universal Router", kind: "router" },
    "0x4200000000000000000000000000000000000006": { name: "Wrapped Ether (WETH)", kind: "wrapped" },
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { name: "USD Coin (USDC)", kind: "token" },
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": { name: "Tether USD (USDT)", kind: "token" },
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { name: "Dai Stablecoin (DAI)", kind: "token" },
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { name: "Coinbase Wrapped BTC (cbBTC)", kind: "token" },
  },
  arbitrum: {
    ...shared,
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Universal Router", kind: "router" },
    "0xa51afafe0263b40edaef0df8781ea9aa03e381a3": { name: "Uniswap Universal Router (v4)", kind: "router" },
    "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3 Router", kind: "router" },
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { name: "Uniswap V3 Router 2", kind: "router" },
    "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24": { name: "Uniswap V2 Router", kind: "router" },
    "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": { name: "SushiSwap Router", kind: "router" },
    "0xc873fecbd354f5a56e00e710b90ef4201db2448d": { name: "Camelot Router", kind: "router" },
    "0x32226588378236fd0c7c4053999f88ac0e5cac77": { name: "PancakeSwap Smart Router v3", kind: "router" },
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { name: "Wrapped Ether (WETH)", kind: "wrapped" },
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { name: "USD Coin (USDC)", kind: "token" },
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": { name: "Bridged USDC (USDC.e)", kind: "token" },
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { name: "Tether USD (USD₮0)", kind: "token" },
    "0x912ce59144191c1204e64559fe8253a0e49e6548": { name: "Arbitrum (ARB)", kind: "token" },
  },
  polygon: {
    // PancakeSwap's Permit2 isn't deployed on Polygon.
    ...Object.fromEntries(Object.entries(shared).filter(([a]) => a !== "0x31c2f6fcff4f8759b3bd5bf0e1084a055615c768")),
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Universal Router", kind: "router" },
    "0x1095692a6237d83c6a72f3f5efedb9a670c49223": { name: "Uniswap Universal Router (v4)", kind: "router" },
    "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3 Router", kind: "router" },
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { name: "Uniswap V3 Router 2", kind: "router" },
    "0xedf6066a2b290c185783862c7f4776a2c8077ad1": { name: "Uniswap V2 Router", kind: "router" },
    "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff": { name: "QuickSwap Router", kind: "router" },
    "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": { name: "SushiSwap Router", kind: "router" },
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": { name: "Wrapped POL (WPOL)", kind: "wrapped" },
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { name: "USD Coin (USDC)", kind: "token" },
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": { name: "Bridged USDC (USDC.e)", kind: "token" },
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { name: "Tether USD (USDT0)", kind: "token" },
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": { name: "Wrapped Ether (WETH)", kind: "token" },
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

/** Contracts people commonly approve (routers, aggregators, Permit2): checked for every token a wallet holds. */
export function knownSpenders(chain: string): string[] {
  return Object.entries(byChain[chain] ?? {})
    .filter(([, c]) => c.kind === "router" || c.kind === "aggregator" || c.kind === "permit")
    .map(([address]) => address);
}

/** Uniswap Permit2 (same address on every EVM chain): apps get their own allowances inside it. */
export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
/** Every Permit2 deployment CRYPY reads app allowances from (same interface). */
export const PERMIT2_CONTRACTS = [PERMIT2, "0x31c2f6fcff4f8759b3bd5bf0e1084a055615c768"] as const;
