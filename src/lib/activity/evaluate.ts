/**
 * Activity rules (pure, unit-tested, the same for every chain family):
 *  - spam: tokens the balance view hides as spam, link or bait words in the symbol, and zero-value incoming token
 *    transfers (a common spam pattern);
 *  - address poisoning (heuristic): a zero or dust transfer whose other side starts and ends like the wallet itself
 *    or like an address the wallet sent to, so a careless copy from the history would send funds to a scammer;
 *  - grouping: transfers of one transaction shown together; something out and something else in reads as a swap
 *    (an interpretation, labelled as such).
 */
import { looksLikeLink } from "@/lib/chains/sanitize";
import type { Transfer } from "./types";

const BAIT = /\b(claim|reward|rewards|airdrop|visit|voucher|bonus|gift|free|access|redeem)\b|\$\s?\d/i;
/** Below this many dollars a transfer counts as "dust" for the poisoning check. */
export const DUST_USD = 0.01;

export type SpamFlag = "hidden-token" | "link-in-name" | "bait-words" | "zero-value";

export interface RatedTransfer extends Transfer {
  spam: SpamFlag | null;
  /** The look-alike address this transfer imitates, when it looks like address poisoning. */
  poisoning: string | null;
}

/** Same first 4 and last 4 hex characters, but a different address. */
export function looksAlike(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x !== y && x.slice(2, 6) === y.slice(2, 6) && x.slice(-4) === y.slice(-4);
}

const counterparty = (t: Transfer) => (t.direction === "in" ? t.from : t.to);
const isZero = (t: Transfer) => t.amount !== null && /^0*$/.test(t.amount);
const isDust = (t: Transfer) => isZero(t) || (t.valueNowUsd !== null && t.valueNowUsd < DUST_USD);

export function rateTransfers(
  owner: string,
  list: Transfer[],
  hiddenTokens: ReadonlySet<string> = new Set(),
): RatedTransfer[] {
  const me = owner.toLowerCase();
  // Addresses the wallet really paid (non-zero), which scammers imitate.
  const paid = new Set(list.filter((t) => t.direction === "out" && !isZero(t)).map((t) => t.to.toLowerCase()));
  const targets = [me, ...paid];
  return list.map((t) => {
    const other = counterparty(t).toLowerCase();
    const imitated = isDust(t) && !paid.has(other) ? targets.find((target) => looksAlike(other, target)) : undefined;
    let spam: SpamFlag | null = null;
    if (t.kind !== "coin") {
      const symbol = t.asset.symbol;
      if (t.asset.address && hiddenTokens.has(t.asset.address.toLowerCase())) spam = "hidden-token";
      else if (looksLikeLink(symbol)) spam = "link-in-name";
      else if (BAIT.test(symbol)) spam = "bait-words";
      else if (t.kind === "token" && t.direction === "in" && isZero(t)) spam = "zero-value";
    }
    return { ...t, spam, poisoning: imitated ?? null };
  });
}

export interface TransactionGroup {
  key: string;
  chain: string;
  hash: string;
  time: number | null;
  block: number;
  /** "swap": something left the wallet and something else came in, in one transaction (interpretation). */
  kind: "swap" | "single" | "multi";
  transfers: RatedTransfer[];
}

/** Newest first; transfers of one transaction together. */
export function groupTransfers(list: RatedTransfer[]): TransactionGroup[] {
  const groups = new Map<string, TransactionGroup>();
  for (const t of list) {
    const key = `${t.chain}:${t.hash}`;
    const g = groups.get(key);
    if (g) g.transfers.push(t);
    else
      groups.set(key, {
        key,
        chain: t.chain,
        hash: t.hash,
        time: t.time,
        block: t.block,
        kind: "single",
        transfers: [t],
      });
  }
  for (const g of groups.values()) {
    if (g.transfers.length === 1) continue;
    const outs = g.transfers.filter((t) => t.direction === "out");
    const ins = g.transfers.filter((t) => t.direction === "in");
    const differentAssets =
      outs.length > 0 &&
      ins.length > 0 &&
      outs.some((o) => ins.some((i) => (o.asset.address ?? "coin") !== (i.asset.address ?? "coin")));
    g.kind = differentAssets ? "swap" : "multi";
  }
  return [...groups.values()].sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.block - a.block);
}

/**
 * Merging two newest-first streams read with the same page size: transfers older than the oldest block of a FULL
 * stream may be missing from that stream, so only blocks strictly above that cut-off are complete. Returns the
 * cut-off to continue from (inclusive), or null when both streams were read to the end.
 */
export function completeAbove(streams: { blocks: number[]; full: boolean }[]): number | null {
  const cuts = streams.filter((s) => s.full && s.blocks.length > 0).map((s) => Math.min(...s.blocks));
  return cuts.length ? Math.max(...cuts) : null;
}

/** CSV cell safe for spreadsheets: quotes doubled, formula starters neutralised. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
