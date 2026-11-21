import { getAddress, isAddress } from "viem";

/**
 * Checks what someone typed into the Portfolio's "add a wallet" box (browser-side, nothing is sent).
 * A seed phrase or a private key is refused outright and never kept, logged or sent anywhere.
 */
export type WalletInput =
  { kind: "ok"; address: string } | { kind: "empty" } | { kind: "secret" } | { kind: "checksum" } | { kind: "invalid" };

export function checkWalletInput(raw: string): WalletInput {
  const text = raw.trim();
  if (!text) return { kind: "empty" };
  // 12–24 lowercase words looks like a recovery phrase; 64 hex characters looks like a private key.
  const words = text.split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w))) return { kind: "secret" };
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(text)) return { kind: "secret" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(text)) return { kind: "invalid" };
  // Mixed case must be a correct EIP-55 checksum (a wrong one is usually a typo); all-lower/upper is accepted.
  const mixed = /[a-f]/.test(text.slice(2)) && /[A-F]/.test(text.slice(2));
  if (mixed && !isAddress(text, { strict: true })) return { kind: "checksum" };
  return { kind: "ok", address: getAddress(text.toLowerCase()) };
}

/** Labels are the visitor's own text: trimmed, length-capped, invisible and direction-changing characters removed. */
export function cleanLabel(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "")
    .trim()
    .slice(0, 40);
}
