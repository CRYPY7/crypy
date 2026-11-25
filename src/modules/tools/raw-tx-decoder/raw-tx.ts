import {
  type Hex,
  formatEther,
  formatGwei,
  getAddress,
  fromRlp,
  isHex,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
} from "viem";

/**
 * Raw transaction & RLP decoder (U4), in the browser: reads a signed (or unsigned) raw transaction as wallets and
 * nodes pass it around (eth_sendRawTransaction), shows every field, the hash it will have, and the address that signed
 * it. Any other RLP data is shown as its tree. Nothing is sent: decoding never broadcasts.
 */
export type RawTxError = "empty" | "hex" | "rlp" | "too-large";

export interface TxField {
  key: string;
  value: string;
  /** Extra plain-language reading (ether, gwei). */
  note?: string;
}

export type RawDecoded =
  | {
      kind: "transaction";
      type: string;
      chainId: number | null;
      signed: boolean;
      from: string | null;
      hash: Hex | null;
      to: string | null;
      data: Hex | null;
      fields: TxField[];
    }
  | { kind: "rlp"; tree: RlpNode };

export type RlpNode = { bytes: Hex } | { list: RlpNode[] };
type RecursiveArray<T> = T | readonly RecursiveArray<T>[];

const MAX_INPUT = 400_000;

export async function decodeRaw(
  raw: string,
): Promise<{ ok: true; value: RawDecoded } | { ok: false; error: RawTxError }> {
  const text = raw.trim().replace(/\s+/g, "");
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MAX_INPUT) return { ok: false, error: "too-large" };
  const hex = (text.startsWith("0x") ? text : `0x${text}`) as Hex;
  if (!isHex(hex) || hex.length % 2 !== 0) return { ok: false, error: "hex" };

  try {
    const tx = parseTransaction(hex);
    const signed = tx.r !== undefined && tx.s !== undefined;
    const from = signed
      ? await recoverTransactionAddress({ serializedTransaction: hex as never }).catch(() => null)
      : null;
    const fields: TxField[] = [];
    const add = (key: string, value: unknown, note?: string) => {
      if (value === undefined || value === null) return;
      fields.push({ key, value: show(value), ...(note ? { note } : {}) });
    };
    add("nonce", tx.nonce ?? 0);
    add("value", tx.value ?? 0n, `${formatEther(tx.value ?? 0n)} (coin)`);
    add("gas", tx.gas);
    if (tx.gasPrice !== undefined) add("gasPrice", tx.gasPrice, `${formatGwei(tx.gasPrice)} gwei`);
    if (tx.maxFeePerGas !== undefined) add("maxFeePerGas", tx.maxFeePerGas, `${formatGwei(tx.maxFeePerGas)} gwei`);
    if (tx.maxPriorityFeePerGas !== undefined)
      add("maxPriorityFeePerGas", tx.maxPriorityFeePerGas, `${formatGwei(tx.maxPriorityFeePerGas)} gwei`);
    if (tx.maxFeePerBlobGas !== undefined)
      add("maxFeePerBlobGas", tx.maxFeePerBlobGas, `${formatGwei(tx.maxFeePerBlobGas)} gwei`);
    if (tx.accessList?.length) add("accessList", tx.accessList);
    if (tx.blobVersionedHashes?.length) add("blobVersionedHashes", tx.blobVersionedHashes);
    if (tx.authorizationList?.length) add("authorizationList", tx.authorizationList);
    if (signed) {
      add("v", tx.v ?? tx.yParity);
      add("r", tx.r);
      add("s", tx.s);
    }
    return {
      ok: true,
      value: {
        kind: "transaction",
        type: tx.type ?? "legacy",
        chainId: tx.chainId ?? null,
        signed,
        from,
        // The hash a node will give this transaction: Keccak-256 of the signed bytes.
        hash: signed ? keccak256(hex) : null,
        to: tx.to ? getAddress(tx.to) : null,
        data: tx.data && tx.data !== "0x" ? tx.data : null,
        fields,
      },
    };
  } catch {
    // Not a transaction: any valid RLP is still shown as its tree.
  }
  try {
    return { ok: true, value: { kind: "rlp", tree: toNode(fromRlp(hex, "hex")) } };
  } catch {
    return { ok: false, error: "rlp" };
  }
}

function toNode(value: Hex | RecursiveArray<Hex>): RlpNode {
  return Array.isArray(value)
    ? { list: value.map((v) => toNode(v as Hex | RecursiveArray<Hex>)) }
    : { bytes: value as Hex };
}

function show(value: unknown): string {
  if (typeof value === "bigint" || typeof value === "number") return value.toString();
  if (typeof value === "string") return value;
  return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}
