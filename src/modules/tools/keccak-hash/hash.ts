import {
  type AbiEvent,
  type AbiFunction,
  type Hex,
  isHex,
  keccak256,
  parseAbiItem,
  sha256,
  stringToHex,
  toEventSelector,
  toEventSignature,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";

/**
 * Hashes and signatures for developers (U3), computed in the browser with viem: Keccak-256 (what Ethereum uses, not
 * the final SHA-3 standard), SHA-256, function selectors and event topics.
 */
export type HashMode = "text" | "hex";
export type HashError = "empty" | "hex" | "too-large";
const MAX_BYTES = 1_000_000;

export function hashes(
  input: string,
  mode: HashMode,
): { ok: true; keccak: Hex; sha: Hex; bytes: number } | { ok: false; error: HashError } {
  if (mode === "hex") {
    const text = input.trim();
    if (!text) return { ok: false, error: "empty" };
    const hex = (text.startsWith("0x") ? text : `0x${text}`) as Hex;
    if (!isHex(hex) || hex.length % 2 !== 0) return { ok: false, error: "hex" };
    if ((hex.length - 2) / 2 > MAX_BYTES) return { ok: false, error: "too-large" };
    return { ok: true, keccak: keccak256(hex), sha: sha256(hex), bytes: (hex.length - 2) / 2 };
  }
  if (input === "") return { ok: false, error: "empty" };
  const hex = stringToHex(input);
  if ((hex.length - 2) / 2 > MAX_BYTES) return { ok: false, error: "too-large" };
  return { ok: true, keccak: keccak256(hex), sha: sha256(hex), bytes: (hex.length - 2) / 2 };
}

export type SignatureError = "empty" | "invalid";
export interface SignatureInfo {
  kind: "function" | "event" | "error";
  /** Canonical form: name(type,type…), what the hash is taken of. */
  canonical: string;
  /** Function and error: the first 4 bytes of the hash. */
  selector: Hex | null;
  /** Event: the full 32-byte hash (topic 0). */
  topic: Hex | null;
  /** Keccak-256 of the canonical form. */
  hash: Hex;
}

/** "transfer(address,uint256)", "function transfer(address to, uint256 amount)", "event Transfer(…)", "error X(…)". */
export function signatureInfo(
  input: string,
): { ok: true; value: SignatureInfo } | { ok: false; error: SignatureError } {
  const text = input.trim().replace(/;$/, "");
  if (!text) return { ok: false, error: "empty" };
  const explicit = /^(function|event|error)\s/.test(text);
  const attempts = explicit ? [text] : [`function ${text}`];
  for (const attempt of attempts) {
    try {
      const item = parseAbiItem(attempt) as
        AbiFunction | AbiEvent | { type: "error"; name: string; inputs: AbiFunction["inputs"] };
      if (item.type === "event") {
        const canonical = toEventSignature(item as AbiEvent).replace(/^event /, "");
        const topic = toEventSelector(item as AbiEvent);
        return { ok: true, value: { kind: "event", canonical, selector: null, topic, hash: topic } };
      }
      if (item.type === "function" || item.type === "error") {
        const fn = { ...item, type: "function", outputs: [], stateMutability: "nonpayable" } as AbiFunction;
        const canonical = toFunctionSignature(fn).replace(/^function /, "");
        return {
          ok: true,
          value: {
            kind: item.type,
            canonical,
            selector: toFunctionSelector(fn),
            topic: null,
            hash: keccak256(stringToHex(canonical)),
          },
        };
      }
    } catch {
      // Not valid in this form.
    }
  }
  return { ok: false, error: "invalid" };
}
