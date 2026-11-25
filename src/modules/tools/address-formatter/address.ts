/**
 * EVM address checks: format, EIP-55 checksum (catches most typing mistakes) and the canonical form.
 * Works for every EVM chain (Ethereum, BNB Chain, Base, Polygon, Arbitrum…), which share one address format.
 */
import { getAddress } from "viem";
import { type OtherAddress, checkOtherAddress } from "@/lib/address/other-formats";

export type AddressStatus =
  /** Mixed case and the checksum matches. */
  | "valid"
  /** All lowercase or all uppercase: correct format, but carries no checksum, so typos can't be detected. */
  | "no-checksum"
  /** Mixed case and the checksum does NOT match: almost always a typo. */
  | "bad-checksum"
  /** 40 hex characters without the 0x prefix. */
  | "missing-prefix"
  /** A Bitcoin or Solana address in a valid format (U2). */
  | "other"
  /** Looks like a Bitcoin address, but its checksum or format is wrong. */
  | "other-invalid"
  | "invalid";

export type InvalidReason = "length" | "characters" | "empty";

export interface AddressCheck {
  input: string;
  status: AddressStatus;
  reason?: InvalidReason;
  /** Number of hex characters after 0x, for "wrong length" messages. */
  length?: number;
  checksummed?: string;
  lowercase?: string;
  isZero?: boolean;
  /** For "other": which chain family and type. */
  other?: OtherAddress;
}

export const MAX_ADDRESSES = 500;

export function checkAddress(raw: string): AddressCheck {
  const input = raw.trim();
  if (!input) return { input, status: "invalid", reason: "empty" };
  const other = checkOtherAddress(input);
  if (other) return other.ok ? { input, status: "other", other: other.address } : { input, status: "other-invalid" };

  const hasPrefix = /^0x/i.test(input);
  const body = hasPrefix ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]*$/.test(body)) return { input, status: "invalid", reason: "characters" };
  if (body.length !== 40) return { input, status: "invalid", reason: "length", length: body.length };

  const lowercase = `0x${body.toLowerCase()}`;
  const checksummed = getAddress(lowercase);
  const isZero = /^0+$/.test(body);
  const base = { input, checksummed, lowercase, isZero };

  if (!hasPrefix) return { ...base, status: "missing-prefix" };
  const hasCase = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (!hasCase) return { ...base, status: "no-checksum" };
  return { ...base, status: `0x${body}` === checksummed ? "valid" : "bad-checksum" };
}

/** One address per line (also accepts commas, spaces and semicolons), duplicates kept in order. */
export function splitAddresses(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
