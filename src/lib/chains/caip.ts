/**
 * Chain-agnostic identifiers (CAIP). Used in APIs, caches, logs and storage so that
 * any blockchain family can be added without changing stored data.
 *   CAIP-2  chain:   "eip155:1", "eip155:56", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
 *   CAIP-10 account: "eip155:56:0xabc…"
 *   CAIP-19 asset:   "eip155:1/erc20:0xa0b8…", "eip155:1/slip44:60"
 */
export type ChainId = `${string}:${string}`;
export type AccountId = `${ChainId}:${string}`;
export type AssetId = `${ChainId}/${string}:${string}`;

const NAMESPACE = /^[-a-z0-9]{3,8}$/;
const REFERENCE = /^[-_a-zA-Z0-9]{1,32}$/;

export function isChainId(value: string): value is ChainId {
  const [namespace, reference, ...rest] = value.split(":");
  return rest.length === 0 && NAMESPACE.test(namespace ?? "") && REFERENCE.test(reference ?? "");
}

export function accountId(chain: ChainId, address: string): AccountId {
  return `${chain}:${address}`;
}

export function parseAccountId(value: string): { chain: ChainId; address: string } | null {
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const chain = `${parts[0]}:${parts[1]}`;
  const address = parts[2] ?? "";
  if (!isChainId(chain) || !/^[-.%a-zA-Z0-9]{1,128}$/.test(address)) return null;
  return { chain, address };
}

export function assetId(chain: ChainId, namespace: string, reference: string): AssetId {
  return `${chain}/${namespace}:${reference}`;
}
