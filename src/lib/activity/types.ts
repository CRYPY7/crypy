/**
 * Wallet activity (M7): coin, token and NFT transfers to or from one address. Family-neutral: a chain-family
 * adapter supplies transfers, lib/activity/evaluate.ts adds spam and look-alike (address poisoning) flags.
 */
export type TransferKind = "coin" | "token" | "nft";
export type Direction = "in" | "out" | "self";

export interface Transfer {
  /** Unique within a chain (source id, or hash:logIndex). */
  id: string;
  chain: string;
  hash: string;
  block: number;
  /** Block time, unix seconds; null when it couldn't be read. */
  time: number | null;
  direction: Direction;
  kind: TransferKind;
  /** A coin moved by a contract inside a transaction (an "internal" transfer). */
  internal: boolean;
  from: string;
  to: string;
  /** Token or NFT contract; null for the chain's coin. */
  asset: { address: string | null; symbol: string; decimals: number | null; tokenId: string | null };
  /** Raw amount (smallest unit); for NFTs the number of items; null when unknown. */
  amount: string | null;
  /** Today's value (on-chain price × amount); null without a price. */
  valueNowUsd: number | null;
}

export type ActivitySource =
  | "history" // full history from the transfer index (Alchemy), newest first
  | "recent" // no index: the last few hours, read from the chain for held tokens only
  | "unavailable";

export interface ChainActivity {
  chain: string;
  source: ActivitySource;
  /** Older transfers exist: pass this block as the cursor to continue (inclusive). null = no more. */
  next: number | null;
  /** The oldest transfer ever (history only, first page only). */
  first: { block: number; time: number | null } | null;
  /** Internal transfers (coins moved by contracts) are included on this chain. */
  internalIncluded: boolean;
}

export interface ActivityFacts {
  owner: string;
  checkedAt: number;
  chains: ChainActivity[];
  transfers: Transfer[];
}
