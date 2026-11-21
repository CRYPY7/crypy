/**
 * Token approvals of one wallet on one chain (M6). Family-neutral facts: a chain-family adapter supplies them,
 * lib/approvals/evaluate.ts turns them into risks. Every allowance here was read on-chain; outside sources (GoPlus)
 * only point to where to look, and their flags are kept apart and labelled.
 */
export type ApprovalKind =
  | "token" // ERC-20 allowance
  | "nft-all" // ERC-721 / ERC-1155 approval for all items of a collection
  | "permit2"; // an app's allowance inside Permit2 (the token itself is approved to Permit2)

export type SpenderType = "wallet" | "delegated" | "contract";

export interface SpenderFacts {
  address: string;
  /** null: couldn't be read. "delegated": an EIP-7702 wallet (a person's wallet with code). */
  type: SpenderType | null;
  /** From CRYPY's own list of known contracts only. */
  name: string | null;
  /** Source published and matching on Sourcify; null when not checked. */
  sourceVerified: boolean | null;
  /** GoPlus's view of the spender (second opinion, labelled). null when GoPlus didn't answer or doesn't know it. */
  goplus: { malicious: boolean; doubt: boolean; trusted: boolean } | null;
  /** When the spender contract was created (unix seconds), as GoPlus reports it; null when unknown. */
  createdAt: number | null;
  /** The contract name GoPlus reports (a label only, shown as GoPlus's; never used to trust a spender). */
  goplusName: string | null;
}

export interface ApprovalFact {
  kind: ApprovalKind;
  token: { address: string; symbol: string; name: string; decimals: number | null };
  spender: SpenderFacts;
  /** Raw allowance (token, permit2); null for nft-all. */
  allowance: string | null;
  unlimited: boolean;
  /** permit2 only: when the allowance expires (unix seconds). */
  expiresAt: number | null;
  /** permit2 only: the Permit2 contract holding this allowance (Uniswap's or PancakeSwap's). */
  permit2: string | null;
  /** What the wallet holds: raw token amount, or NFT count. null when unreadable. */
  balance: string | null;
  priceUsd: number | null;
  /** min(allowance, balance) × price; null without a price. NFTs: null. */
  atRiskUsd: number | null;
  /** Last time this approval changed, when known (GoPlus or recent logs). */
  lastChange: { at: number | null; tx: string | null } | null;
  /** How CRYPY found it. */
  foundBy: ("goplus" | "known-spenders" | "recent-logs" | "permit2")[];
}

export interface ApprovalsFacts {
  chain: string;
  owner: string;
  block: string;
  checkedAt: number;
  approvals: ApprovalFact[];
  /** Which discovery sources answered this time. */
  sources: { goplus: "ok" | "partial" | "unavailable"; recentLogs: boolean; knownSpenders: boolean };
}
