import {
  type Hex,
  getAddress,
  hashMessage,
  hashTypedData,
  isAddress,
  isHex,
  recoverMessageAddress,
  recoverTypedDataAddress,
} from "viem";

/**
 * Signature verifier (U4), in the browser: finds which address signed a message (personal_sign) or an EIP-712
 * request, from the signature alone. Nothing is looked up or sent. Smart-contract wallets (Safe, ERC-4337) don't sign
 * with a key of their own (ERC-1271): their signatures can't be recovered offline, so a mismatch is explained, never
 * called a forgery.
 */
export type VerifyError =
  "empty-message" | "empty-signature" | "signature" | "json" | "not-typed-data" | "expected" | "too-large";
export type MessageMode = "text" | "hex";

export interface Verified {
  kind: "message" | "typed-data";
  signer: string;
  /** What was actually signed: the EIP-191 or EIP-712 hash. */
  hash: Hex;
  /** Only when an expected address was given. */
  matches: boolean | null;
  primaryType: string | null;
}

const MAX_INPUT = 200_000;

export async function verifySignature(input: {
  message: string;
  mode: MessageMode;
  signature: string;
  expected: string;
}): Promise<{ ok: true; value: Verified } | { ok: false; error: VerifyError }> {
  const text = input.message;
  if (!text.trim()) return { ok: false, error: "empty-message" };
  if (text.length > MAX_INPUT) return { ok: false, error: "too-large" };
  const signature = input.signature.trim().replace(/\s+/g, "");
  if (!signature) return { ok: false, error: "empty-signature" };
  // 65 bytes (r, s, v) or 64 bytes (EIP-2098 compact).
  if (!isHex(signature) || ![130, 128].includes(signature.length - 2)) return { ok: false, error: "signature" };
  const expected = input.expected.trim();
  if (expected && !isAddress(expected, { strict: false })) return { ok: false, error: "expected" };

  const trimmed = text.trim();
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const typed = readTypedData(trimmed);
      if (typed === "json" || typed === "not-typed-data") return { ok: false, error: typed };
      const signer = await recoverTypedDataAddress({ ...typed, signature: signature as Hex });
      return {
        ok: true,
        value: {
          kind: "typed-data",
          signer,
          hash: hashTypedData(typed),
          matches: expected ? getAddress(expected) === signer : null,
          primaryType: typed.primaryType,
        },
      };
    }
    let message: string | { raw: Hex };
    if (input.mode === "hex") {
      if (!isHex(trimmed) || trimmed.length % 2 !== 0) return { ok: false, error: "empty-message" };
      message = { raw: trimmed as Hex };
    } else message = text;
    const signer = await recoverMessageAddress({ message, signature: signature as Hex });
    return {
      ok: true,
      value: {
        kind: "message",
        signer,
        hash: hashMessage(message),
        matches: expected ? getAddress(expected) === signer : null,
        primaryType: null,
      },
    };
  } catch {
    return { ok: false, error: "signature" };
  }
}

type TypedData = Parameters<typeof hashTypedData>[0];

/** Typed data as wallets show it: the object, a JSON string of it, or eth_signTypedData_v4's [address, data]. */
function readTypedData(text: string): TypedData | "json" | "not-typed-data" {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "json";
  }
  if (Array.isArray(parsed))
    parsed = parsed.find((p) => typeof p === "object" || (typeof p === "string" && p.trim().startsWith("{")));
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return "json";
    }
  }
  const v = parsed as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || typeof v.primaryType !== "string" || !v.types || !v.message)
    return "not-typed-data";
  // EIP712Domain is derived from the domain by viem; leaving it in is allowed but must match.
  return {
    domain: (v.domain ?? {}) as never,
    types: v.types as never,
    primaryType: v.primaryType,
    message: v.message as never,
  };
}
