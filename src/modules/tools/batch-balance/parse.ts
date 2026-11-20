/**
 * Address list parsing for the Batch Balance Scanner. Pure, browser-safe, unit-tested.
 * Accepts one address per line with an optional label ("0x…,Treasury"), or several addresses on a line separated
 * by commas, semicolons, tabs or spaces. Never "fixes" a mistyped address: a wrong checksum is flagged and skipped.
 */
import { getAddress, isAddress } from "viem";

export const MAX_ADDRESSES = 500;
export const MAX_LABEL = 40;
/** Text accepted in the editor or from a file (about 60 characters × 2,000 lines). */
export const MAX_INPUT_CHARS = 120_000;

export interface Entry {
  /** Checksummed address. */
  address: string;
  label: string;
  /** 1-based line of the first occurrence. */
  line: number;
}

export type LineNote =
  | { kind: "duplicate"; line: number; firstLine: number }
  | { kind: "checksum"; line: number }
  | { kind: "invalid"; line: number }
  | { kind: "over-limit"; line: number }
  | { kind: "several"; line: number; count: number };

export interface ParsedList {
  entries: Entry[];
  notes: LineNote[];
  /** Lines that held at least one address token. */
  duplicates: number;
  problems: number;
  overLimit: number;
}

const ADDRESS_LIKE = /0x[0-9a-fA-F]{38,42}(?![0-9a-fA-F])/g;
const SEPARATORS = /^[\s,;|\t]+|[\s,;|\t]+$/g;
// Control and direction-changing characters are removed from labels (they could disguise text).
const UNSAFE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

export function cleanLabel(text: string): string {
  return text.replace(UNSAFE, "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

/** Checks one address token: "ok" (normalized), "checksum" (mixed case that doesn't match) or "invalid". */
function checkToken(token: string): { status: "ok"; address: string } | { status: "checksum" | "invalid" } {
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return { status: "invalid" };
  const lowerOrUpper =
    token.slice(2) === token.slice(2).toLowerCase() || token.slice(2) === token.slice(2).toUpperCase();
  if (!lowerOrUpper && !isAddress(token, { strict: true })) return { status: "checksum" };
  return { status: "ok", address: getAddress(token.toLowerCase()) };
}

export function parseList(text: string): ParsedList {
  const entries: Entry[] = [];
  const notes: LineNote[] = [];
  const seen = new Map<string, Entry>();
  let duplicates = 0;
  let problems = 0;
  let overLimit = 0;

  text
    .slice(0, MAX_INPUT_CHARS)
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = index + 1;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const tokens = trimmed.match(ADDRESS_LIKE) ?? [];
      if (tokens.length === 0) {
        // A header such as "address,label" is ignored quietly; anything that looks like an address is flagged.
        if (/0x[0-9a-fA-F]+/.test(trimmed)) {
          notes.push({ kind: "invalid", line });
          problems++;
        }
        return;
      }
      if (tokens.length > 1) notes.push({ kind: "several", line, count: tokens.length });
      // A label is only taken from a line with exactly one address: the text after it (or before it).
      const label = tokens.length === 1 ? cleanLabel(trimmed.replace(tokens[0]!, " ").replace(SEPARATORS, "")) : "";
      for (const token of tokens) {
        const checked = checkToken(token);
        if (checked.status !== "ok") {
          notes.push({ kind: checked.status, line });
          problems++;
          continue;
        }
        const key = checked.address.toLowerCase();
        const first = seen.get(key);
        if (first) {
          if (!first.label && label) first.label = label;
          notes.push({ kind: "duplicate", line, firstLine: first.line });
          duplicates++;
          continue;
        }
        if (entries.length >= MAX_ADDRESSES) {
          notes.push({ kind: "over-limit", line });
          overLimit++;
          continue;
        }
        const entry = { address: checked.address, label, line };
        seen.set(key, entry);
        entries.push(entry);
      }
    });
  return { entries, notes, duplicates, problems, overLimit };
}

/** Example list for "Load example": public, well-known addresses (exchange and project wallets, a token contract). */
export const EXAMPLE_LIST = [
  "0x28C6c06298d514Db089934071355E5743bf21d60,Binance 14",
  "0xF977814e90dA44bFA03b6295A0616a897441aceC,Binance 8",
  "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3,Binance hot wallet",
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,vitalik.eth",
  "0x55d398326f99059fF775485246999027B3197955,USDT contract (BNB Chain)",
  "0x000000000000000000000000000000000000dEaD,Burn address",
].join("\n");
