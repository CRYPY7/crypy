/**
 * Liquidity holders → what each part of the liquidity can do. Pure (no network), unit-tested.
 *
 * A part is "protected" only when it is burned or locked for more than LOCK_MIN_DAYS. Multisigs, timelocks and farms
 * are "controlled": someone can still remove the liquidity, with more friction. An ended lock is removable.
 */
import type { LpHolder, PoolFact } from "./types";

export const LOCK_MIN_DAYS = 30;
/** Pools worth less than this are listed but left out of the totals. */
export const DUST_POOL_USD = 1_000;
const DAY = 86_400;

export type LiquidityPart =
  | "burned"
  | "locked"
  | "soon" // lock ends within LOCK_MIN_DAYS
  | "expired" // lock ended, not withdrawn yet
  | "controlled" // multisig, timelock, farm
  | "owner"
  | "removable" // wallets
  | "unknown" // unidentified contracts, the token contract, lock terms not read
  | "notFound"; // holder not found

export type LiquiditySplit = Record<LiquidityPart, number>;

export const emptySplit = (): LiquiditySplit => ({
  burned: 0,
  locked: 0,
  soon: 0,
  expired: 0,
  controlled: 0,
  owner: 0,
  removable: 0,
  unknown: 0,
  notFound: 0,
});

export function lockPart(unlockAt: number | null, now: number): "locked" | "soon" | "expired" {
  if (unlockAt === null || unlockAt > now + LOCK_MIN_DAYS * DAY) return "locked";
  return unlockAt > now ? "soon" : "expired";
}

/** Splits one holder's share into parts. Lock shares never exceed the holder's share; any rest is "unknown". */
export function holderParts(
  holder: LpHolder,
  now: number,
): { part: LiquidityPart; share: number; unlockAt?: number | null }[] {
  switch (holder.kind) {
    case "burn":
      return [{ part: "burned", share: holder.share }];
    case "locker":
    case "vault": {
      if (holder.lockRead !== "read") return [{ part: "unknown", share: holder.share }];
      const out: { part: LiquidityPart; share: number; unlockAt?: number | null }[] = [];
      let left = holder.share;
      for (const lock of [...holder.locks].sort((a, b) => (a.unlockAt ?? Infinity) - (b.unlockAt ?? Infinity))) {
        const share = Math.min(lock.share, left);
        if (share <= 0) continue;
        out.push({ part: lockPart(lock.unlockAt, now), share, unlockAt: lock.unlockAt });
        left -= share;
      }
      if (left > 1e-9) out.push({ part: "unknown", share: left });
      return out;
    }
    case "multisig":
      // A 1-of-n Safe is one person's decision.
      return [{ part: (holder.multisig?.threshold ?? 0) > 1 ? "controlled" : "removable", share: holder.share }];
    case "timelock":
    case "farm":
    case "exchange":
      return [{ part: "controlled", share: holder.share }];
    case "owner":
      return [{ part: "owner", share: holder.share }];
    case "wallet":
      return [{ part: "removable", share: holder.share }];
    default:
      return [{ part: "unknown", share: holder.share }];
  }
}

/** The state shown next to a holder: its weakest part. */
export function holderState(holder: LpHolder, now: number): LiquidityPart {
  const order: LiquidityPart[] = ["owner", "expired", "removable", "unknown", "soon", "controlled", "locked", "burned"];
  const parts = holderParts(holder, now).filter((p) => p.share > 0);
  return order.find((o) => parts.some((p) => p.part === o)) ?? "unknown";
}

export function poolSplit(pool: PoolFact, now: number): LiquiditySplit {
  const split = emptySplit();
  if (!pool.holders) {
    split.notFound = 1;
    return split;
  }
  for (const holder of pool.holders.holders) for (const p of holderParts(holder, now)) split[p.part] += p.share;
  split.notFound = Math.max(0, 1 - pool.holders.found);
  return split;
}

export interface LiquiditySummary {
  /** Value of the pools counted (≥ DUST_POOL_USD). */
  totalUsd: number;
  counted: number;
  /** Fractions of all counted liquidity, weighted by pool value. */
  split: LiquiditySplit;
  /** Earliest lock ending within LOCK_MIN_DAYS: when, and how much of all liquidity. */
  nextUnlock: { at: number; share: number } | null;
  /** Share of all liquidity in the owner's hands. */
  ownerUsd: number;
}

/** Weighted across pools by value. null when no pool is worth DUST_POOL_USD or prices are missing. */
export function liquiditySummary(pools: PoolFact[], now: number): LiquiditySummary | null {
  const counted = pools.filter((p) => (p.liquidityUsd ?? 0) >= DUST_POOL_USD);
  const totalUsd = counted.reduce((sum, p) => sum + p.liquidityUsd!, 0);
  if (counted.length === 0 || totalUsd <= 0) return null;
  const split = emptySplit();
  let nextUnlock: LiquiditySummary["nextUnlock"] = null;
  for (const pool of counted) {
    const weight = pool.liquidityUsd! / totalUsd;
    const s = poolSplit(pool, now);
    for (const k of Object.keys(split) as LiquidityPart[]) split[k] += s[k] * weight;
    for (const holder of pool.holders?.holders ?? []) {
      for (const p of holderParts(holder, now)) {
        if (p.part !== "soon" || p.unlockAt == null) continue;
        if (!nextUnlock || p.unlockAt < nextUnlock.at) nextUnlock = { at: p.unlockAt, share: p.share * weight };
        else if (p.unlockAt === nextUnlock.at) nextUnlock.share += p.share * weight;
      }
    }
  }
  return { totalUsd, counted: counted.length, split, nextUnlock, ownerUsd: split.owner * totalUsd };
}
