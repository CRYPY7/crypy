import { base58, bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "viem";

/**
 * Bitcoin and Solana address formats (U2), checked in the browser. A valid format means the address is written
 * correctly (its built-in checksum matches, for Bitcoin); it never says whether it exists, is used, or whose it is.
 */
export type OtherAddress =
  | {
      family: "bitcoin";
      network: "mainnet" | "testnet";
      type: "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr" | "segwit-other";
    }
  | { family: "solana" };

export type OtherCheck = { ok: true; address: OtherAddress } | { ok: false; reason: "checksum" | "format" } | null;

const base58check = createBase58check((data: Uint8Array) => sha256(data, "bytes"));

/** null: doesn't look like a Bitcoin or Solana address at all (so other checks may apply). */
export function checkOtherAddress(input: string): OtherCheck {
  const text = input.trim();
  if (!text || /^0x/i.test(text)) return null;

  // Bitcoin SegWit (bech32 / bech32m): bc1… (mainnet) or tb1… (testnet). Mixed case is never valid.
  if (/^(bc|tb)1/i.test(text)) {
    if (text !== text.toLowerCase() && text !== text.toUpperCase()) return { ok: false, reason: "format" };
    const lower = text.toLowerCase();
    const network = lower.startsWith("bc1") ? "mainnet" : "testnet";
    for (const codec of [bech32, bech32m]) {
      try {
        const { prefix, words } = codec.decode(lower as `${string}1${string}`, 90);
        if (prefix !== (network === "mainnet" ? "bc" : "tb") || words.length === 0) continue;
        const version = words[0]!;
        const program = bech32.fromWords(words.slice(1));
        // BIP-350: version 0 uses bech32, versions 1–16 use bech32m.
        if ((version === 0) !== (codec === bech32)) return { ok: false, reason: "checksum" };
        if (program.length < 2 || program.length > 40) return { ok: false, reason: "format" };
        if (version === 0) {
          if (program.length === 20) return { ok: true, address: { family: "bitcoin", network, type: "p2wpkh" } };
          if (program.length === 32) return { ok: true, address: { family: "bitcoin", network, type: "p2wsh" } };
          return { ok: false, reason: "format" };
        }
        if (version === 1 && program.length === 32)
          return { ok: true, address: { family: "bitcoin", network, type: "p2tr" } };
        if (version > 16) return { ok: false, reason: "format" };
        return { ok: true, address: { family: "bitcoin", network, type: "segwit-other" } };
      } catch {
        // Try the other checksum variant.
      }
    }
    return { ok: false, reason: "checksum" };
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(text)) return null;

  // Bitcoin legacy (base58check): 25 bytes with a 4-byte checksum.
  if (/^[13mn2]/.test(text) && text.length >= 26 && text.length <= 35) {
    try {
      const payload = base58check.decode(text);
      if (payload.length === 21) {
        const version = payload[0];
        if (version === 0x00) return { ok: true, address: { family: "bitcoin", network: "mainnet", type: "p2pkh" } };
        if (version === 0x05) return { ok: true, address: { family: "bitcoin", network: "mainnet", type: "p2sh" } };
        if (version === 0x6f) return { ok: true, address: { family: "bitcoin", network: "testnet", type: "p2pkh" } };
        if (version === 0xc4) return { ok: true, address: { family: "bitcoin", network: "testnet", type: "p2sh" } };
      }
    } catch {
      // Not Bitcoin base58check; may still be Solana below.
    }
  }

  // Solana: any 32 bytes in base58 (32–44 characters). There is no checksum to catch typos.
  if (text.length >= 32 && text.length <= 44) {
    try {
      if (base58.decode(text).length === 32) return { ok: true, address: { family: "solana" } };
    } catch {
      return null;
    }
  }

  // Looks like base58 but is neither: a Bitcoin legacy address with a wrong checksum is the usual case.
  if (/^[13]/.test(text) && text.length >= 26 && text.length <= 35) return { ok: false, reason: "checksum" };
  return null;
}
