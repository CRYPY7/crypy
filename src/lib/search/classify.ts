/**
 * Recognises what a user pasted into the universal search.
 * Format check only: it never contacts a server. Live lookups are added in M2.
 */
export type SearchKind = "evm-address" | "evm-tx" | "empty" | "invalid";

export interface SearchClassification {
  kind: SearchKind;
  /** Trimmed input, safe to display. */
  value: string;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const MAX_INPUT_LENGTH = 200;

export function classifySearch(raw: string): SearchClassification {
  const value = raw.trim().slice(0, MAX_INPUT_LENGTH);
  if (value.length === 0) return { kind: "empty", value };
  if (EVM_TX_HASH.test(value)) return { kind: "evm-tx", value };
  if (EVM_ADDRESS.test(value)) return { kind: "evm-address", value };
  return { kind: "invalid", value };
}
