/**
 * Hex ↔ decimal conversion for blockchain values (uint256 range), with the views developers need:
 * 32-byte padded form, byte length, signed (int256) reading and readable text when the bytes are text.
 */
import { MAX_UINT256 } from "../unit-converter/units";

export type HexError = "empty" | "format" | "negative" | "too-large";
export type NumberInput = "hex" | "decimal";

export interface HexResult {
  input: NumberInput;
  value: bigint;
  decimal: string;
  hex: string;
  /** 0x + 64 hex digits, as stored in contract storage and call data. */
  padded: string;
  byteLength: number;
  /** Two's-complement reading when the value fills 32 bytes with the top bit set (int256). */
  signed: string | null;
}

/**
 * Detects the input type: "0x…" or anything with a–f is hex; digits only are decimal.
 * Use `as` to force a reading for digit-only values like "10" that are valid in both.
 */
export function convertNumber(
  raw: string,
  as?: NumberInput,
): { ok: true; result: HexResult } | { ok: false; error: HexError } {
  const value = raw.trim().replace(/[\s_]/g, "");
  if (!value) return { ok: false, error: "empty" };
  if (value.startsWith("-")) return { ok: false, error: "negative" };

  let input: NumberInput;
  let digits: string;
  if (/^0x/i.test(value)) {
    input = "hex";
    digits = value.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(digits)) return { ok: false, error: "format" };
  } else if (/^\d+$/.test(value) && as !== "hex") {
    input = "decimal";
    digits = value;
  } else if (/^[0-9a-fA-F]+$/.test(value)) {
    input = "hex";
    digits = value;
  } else {
    return { ok: false, error: "format" };
  }

  if (digits.replace(/^0+/, "").length > (input === "hex" ? 64 : 78)) return { ok: false, error: "too-large" };
  const big = BigInt(input === "hex" ? `0x${digits}` : digits);
  if (big > MAX_UINT256) return { ok: false, error: "too-large" };

  const hexDigits = big.toString(16);
  const padded = hexDigits.padStart(64, "0");
  const signed = big >> 255n === 1n ? (big - (1n << 256n)).toString() : null;
  return {
    ok: true,
    result: {
      input,
      value: big,
      decimal: big.toString(),
      hex: `0x${hexDigits}`,
      padded: `0x${padded}`,
      byteLength: big === 0n ? 0 : Math.ceil(hexDigits.length / 2),
      signed,
    },
  };
}

/**
 * Reads hex bytes as UTF-8 text when they are clearly text (e.g. a message in transaction data).
 * Returns null for binary data so numbers are never shown as gibberish.
 */
export function hexToText(raw: string): string | null {
  const digits = raw.trim().replace(/^0x/i, "");
  if (!digits || digits.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(digits) || digits.length > 20_000) return null;
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  // Strip trailing zero padding (ABI-encoded strings are padded to 32 bytes).
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  if (end === 0) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, end));
  } catch {
    return null;
  }
  // Only letters, marks, numbers, punctuation, symbols and ordinary spaces/newlines.
  return /^[\p{L}\p{M}\p{N}\p{P}\p{S} \n\t]+$/u.test(text) && /[\p{L}\p{N}]/u.test(text) ? text : null;
}
