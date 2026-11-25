import { base58, base64, base64url } from "@scure/base";
import { bytesToHex, hexToBytes, isHex } from "viem";

/**
 * Base58 / Base64 / hex / text converter (U3), in the browser. Every format is read into bytes, then shown in all the
 * others. Base58 here is the Bitcoin alphabet without a checksum (Solana keys and signatures use it as is).
 */
export const formats = ["text", "hex", "base64", "base64url", "base58"] as const;
export type Format = (typeof formats)[number];
export type EncodingError = "empty" | "invalid" | "too-large";
const MAX_BYTES = 1_000_000;

export interface Converted {
  bytes: number;
  values: Record<Format, string | null>;
}

export function convert(
  input: string,
  from: Format,
): { ok: true; value: Converted } | { ok: false; error: EncodingError } {
  const text = from === "text" ? input : input.trim();
  if (!text) return { ok: false, error: "empty" };
  let bytes: Uint8Array;
  try {
    if (from === "text") bytes = new TextEncoder().encode(text);
    else if (from === "hex") {
      const hex = text.startsWith("0x") ? text : `0x${text}`;
      if (!isHex(hex) || hex.length % 2 !== 0) return { ok: false, error: "invalid" };
      bytes = hexToBytes(hex);
    } else if (from === "base64") bytes = base64.decode(pad(text.replace(/\s/g, "")));
    else if (from === "base64url") bytes = base64url.decode(pad(text.replace(/\s/g, "")));
    else bytes = base58.decode(text);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (bytes.length > MAX_BYTES) return { ok: false, error: "too-large" };
  let asText: string | null = null;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Control characters (other than tab and line breaks) mean these bytes aren't really text.
    asText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded) ? null : decoded;
  } catch {
    asText = null;
  }
  return {
    ok: true,
    value: {
      bytes: bytes.length,
      values: {
        text: asText,
        hex: bytesToHex(bytes),
        base64: base64.encode(bytes),
        base64url: base64url.encode(bytes),
        base58: bytes.length ? base58.encode(bytes) : "",
      },
    },
  };
}

/** Base64 without its "=" padding is common; add it back so the strict decoder accepts it. */
function pad(text: string): string {
  return text.length % 4 === 0 ? text : text + "=".repeat(4 - (text.length % 4));
}
