import type { ChainConfig, ChainFamily, ChainKey } from "@/config/chains";

/** Token amount without precision loss: raw integer as a string + decimals. */
export interface Amount {
  raw: string;
  decimals: number;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: Amount;
}

export type AddressKind = "account" | "token" | "contract";

export interface AddressLookup {
  chain: ChainKey;
  kind: AddressKind;
  /** Has sent at least one transaction (accounts) — a cheap "has been used" signal. */
  hasActivity: boolean;
  /** EIP-7702: an account that has delegated its code to a contract. */
  delegated?: boolean;
  token?: TokenInfo;
  /** Native coin balance (ETH, BNB…), read with the lookup. */
  nativeBalance?: Amount;
}

/**
 * Whether an address is in use on a chain: it has code, has sent a transaction or holds the native coin.
 * (A wallet that only ever received tokens counts as unused here; the address page also checks tokens.)
 */
export function isActiveLookup(lookup: AddressLookup): boolean {
  return (
    lookup.kind !== "account" ||
    lookup.hasActivity ||
    Boolean(lookup.delegated) ||
    (lookup.nativeBalance !== undefined && BigInt(lookup.nativeBalance.raw) > 0n)
  );
}

export type TxStatus = "success" | "reverted" | "pending";

export interface TxLookup {
  chain: ChainKey;
  hash: string;
  status: TxStatus;
  blockNumber: string | null;
  from: string;
  to: string | null;
}

/** A token or NFT contract seen in a transaction. Text is sanitized; `decimals` is null for NFTs or unreadable contracts. */
export interface TxToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number | null;
}

export type TransferStandard = "erc20" | "erc721" | "erc1155" | "wrap" | "unwrap";

/** One asset movement found in the transaction's event logs. Amounts are raw integers as strings. */
export interface TxTransfer {
  standard: TransferStandard;
  token: string;
  from: string;
  to: string;
  amount: string;
  tokenId?: string;
}

/** A permission granted or removed by this transaction (from Approval / ApprovalForAll events). */
export interface TxApproval {
  /** "amount": ERC-20 allowance; "all": NFT operator for a whole collection; "nft": one NFT (amount = token id). */
  kind: "amount" | "all" | "nft";
  token: string;
  owner: string;
  spender: string;
  /** Raw amount for "amount"; token id for "nft"; "1"/"0" for "all" (granted / removed). */
  amount: string;
  unlimited: boolean;
  revoke: boolean;
}

/** Everything the transaction page shows. Plain, serializable data (cached on the server). */
export interface TxDetails extends TxLookup {
  /** Unix seconds of the block, null while pending. */
  timestamp: number | null;
  confirmations: number | null;
  nonce: number;
  /** "legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" or the raw type. */
  type: string;
  /** Native coin sent with the transaction (wei). */
  value: string;
  gasLimit: string;
  gasUsed: string | null;
  /** Price actually paid per gas unit (wei). */
  gasPrice: string | null;
  /** gasUsed × gasPrice (wei). */
  fee: string | null;
  /** Part of the fee destroyed by the base fee (wei); null when the chain has no base fee. */
  burnt: string | null;
  createdContract: string | null;
  toIsContract: boolean | null;
  input: { bytes: number; preview: string; truncated: boolean };
  /** Decoded call data (see modules/tools/tx-decoder); null for plain coin transfers and contract creation. */
  call: import("@/modules/tools/tx-decoder/decode").DecodeResult | null;
  logCount: number;
  /** Events that aren't standard token events (counted, not interpreted). */
  otherEvents: number;
  transfers: TxTransfer[];
  approvals: TxApproval[];
  /** True when the transaction emitted more events than we read. */
  logsTruncated: boolean;
  tokens: Record<string, TxToken>;
  /** Failed transactions only: the contract's error message, "none" if it gave none, null if it couldn't be read. */
  revertReason: string | null;
  /** Current USD prices (not historical): "native" and lower-case token addresses. */
  prices: Record<string, number>;
  /** USD prices at the transaction's block, when the node still has that state; null otherwise. Never mixed with `prices`. */
  pricesAtTx: Record<string, number> | null;
  /** Technical details for the Advanced view. */
  technical: {
    /** Chain identifier as the chain defines it (EVM chain id). CAIP-2 is on the chain config. */
    chainId: number;
    blockHash: string | null;
    index: number | null;
    /** Base fee of the block (wei); null when the chain has none or the tx is pending. */
    baseFee: string | null;
    /** Effective tip per gas (wei) = price paid − base fee. */
    priorityFee: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
  };
  /** Every event in the receipt, original order (capped). `data` is shortened for display. */
  events: { index: number; address: string; topics: string[]; data: string; dataBytes: number }[];
  /** Pending only: true when the sender already used this nonce in another transaction (so this one can't confirm). */
  nonceUsed: boolean | null;
  /** Unix ms when the server read this data. */
  checkedAt: number;
}

export interface ChainHead {
  chain: ChainKey;
  blockNumber: string;
  latencyMs: number;
}

/** One token held by an address, as read from the chain. `info` is null when the contract didn't answer. */
export interface RawTokenBalance {
  address: string;
  balance: Amount;
  info: { name: string; symbol: string; decimals: number } | null;
}

/**
 * How complete a token list is:
 * full — every token the provider knows for this address;
 * truncated — the address holds more tokens than we list (very large wallets);
 * common-only — only well-known tokens were checked (full list unavailable).
 */
export type BalanceCoverage = "full" | "truncated" | "common-only";

export interface ChainBalances {
  chain: ChainKey;
  native: Amount;
  tokens: RawTokenBalance[];
  coverage: BalanceCoverage;
}

/** Provider label: "alchemy", a host name such as "ankr.com", or "public:<host>". */
export type ProviderName = string;

/** Health of one data provider. Never includes URLs or keys. */
export interface ProviderCheck {
  name: ProviderName;
  ok: boolean;
  latencyMs?: number;
  notConfigured?: boolean;
}

export interface ParsedAddress {
  /** Canonical form (checksummed for EVM). */
  normalized: string;
  /** true/false when the input carried a checksum (mixed case), null when it did not. */
  checksumValid: boolean | null;
}

/**
 * Everything chain-specific lives behind this interface. Pages, services and tools
 * talk only to adapters, so a new blockchain family is one new adapter.
 */
export interface ChainFamilyAdapter {
  family: ChainFamily | string;
  parseAddress(input: string): ParsedAddress | null;
  parseTxId(input: string): string | null;
  explorerUrl(chain: ChainConfig, kind: "address" | "tx" | "token", id: string): string;
  getHead(chain: ChainConfig): Promise<ChainHead>;
  /** Native and token balances (chains with the tokenBalances capability). */
  getBalances?(chain: ChainConfig, address: string): Promise<ChainBalances>;
  /** USD prices for the native coin and tokens (keys: "native" and lower-case token addresses). */
  getUsdPrices?(
    chain: ChainConfig,
    tokens: { address: string; decimals: number }[],
  ): Promise<Map<string, { usd: number }>>;
  /** Optional: tests each configured provider separately (health page). */
  checkProviders?(chain: ChainConfig): Promise<ProviderCheck[]>;
  lookupAddress(chain: ChainConfig, address: string): Promise<AddressLookup>;
  lookupTransaction(chain: ChainConfig, hash: string): Promise<TxLookup | null>;
  /** Full details for the transaction page; null when the chain doesn't know the hash. */
  getTransactionDetails?(chain: ChainConfig, hash: string): Promise<TxDetails | null>;
}
