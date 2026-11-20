/**
 * Shared asset helpers and evidence levels for the transaction intelligence engine.
 * Chain-family neutral: an asset is "native" or a token identifier; amounts are raw integer strings.
 */
import type { TxDetails, TransferStandard } from "@/lib/chains/types";

/**
 * How we know something, from strongest to weakest. Every action, change and route step carries one.
 * chain: read directly from blockchain state (status, value, fee, balances, allowances);
 * event: a standard event decoded deterministically (Transfer, Approval, Swap shape…);
 * protocol: a protocol action confirmed against the protocol itself (e.g. a pool its factory lists);
 * reported: a contract's own report of what it did (e.g. a router's "Swapped" event), not checked independently;
 * interpreted: a reasonable reading of the facts that isn't proven (e.g. "possible fee");
 * unknown: not identified.
 */
export type EvidenceLevel = "chain" | "event" | "protocol" | "reported" | "interpreted" | "unknown";

const strength: Record<EvidenceLevel, number> = {
  chain: 5,
  protocol: 4,
  event: 3,
  reported: 2,
  interpreted: 1,
  unknown: 0,
};

/** The weakest of several evidence levels (a conclusion is only as strong as its weakest input). */
export function weakest(...levels: EvidenceLevel[]): EvidenceLevel {
  return levels.reduce((a, b) => (strength[b] < strength[a] ? b : a), "chain" as EvidenceLevel);
}

export interface AssetAmount {
  /** "native" or the token contract address. */
  token: string;
  standard: TransferStandard | "native";
  /** Absolute raw amount (integer string). */
  raw: string;
  decimals: number | null;
  symbol: string;
  tokenId?: string;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function lower(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function nativeAsset(raw: bigint, symbol: string): AssetAmount {
  return { token: "native", standard: "native", raw: (raw < 0n ? -raw : raw).toString(), decimals: 18, symbol };
}

export function assetOf(
  tx: TxDetails,
  token: string,
  standard: AssetAmount["standard"],
  raw: bigint,
  tokenId?: string,
): AssetAmount {
  const info = tx.tokens[lower(token)];
  return {
    token,
    standard,
    raw: (raw < 0n ? -raw : raw).toString(),
    decimals: standard === "erc721" ? 0 : (info?.decimals ?? null),
    symbol: info?.symbol || info?.name || "",
    ...(tokenId !== undefined ? { tokenId } : {}),
  };
}

/** Asset for a token named by a protocol event ("native" or an address). */
export function protocolAsset(tx: TxDetails, token: string, raw: bigint, nativeSymbol: string): AssetAmount {
  return token === "native" ? nativeAsset(raw, nativeSymbol) : assetOf(tx, token, "erc20", raw);
}

/**
 * Native coin the sender received (or paid) inside contracts, measured from its balance before and after the block:
 * after − before + fee + value sent. Zero means nothing moved besides the fee and the value.
 * Null when the balances aren't available. Another transaction in the same block could also change the balance,
 * so callers present this as "measured across the block".
 */
export function internalNative(tx: TxDetails): bigint | null {
  const b = tx.nativeBalance;
  if (!b || tx.status !== "success" || lower(b.address) !== lower(tx.from) || tx.fee === null) return null;
  return BigInt(b.after) - BigInt(b.before) + BigInt(tx.fee) + BigInt(tx.value);
}
