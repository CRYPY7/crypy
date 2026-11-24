import "server-only";
import { type Classified, type Outcome, type OutcomeTool, errorOutcome } from "@/lib/outcomes/classify";
import { redactKeys } from "@/server/redact";

/**
 * Counts what visitors got from each tool (stabilization S0), in 5-minute buckets, in memory; saved to the database
 * about every minute (store.ts). Only counts, times and short reason codes: never an address, a hash, an IP or anything
 * the visitor typed. Background work (alerts worker, health checks, daily token checks) is not counted: it calls the
 * services directly, not through `observe`.
 */
export const BUCKET_MS = 5 * 60_000;
/** A visitor request slower than this counts as slow (the stabilization target is 3 s for first visits). */
export const SLOW_MS = 3_000;
/** Reasons kept per tool and bucket (the most frequent ones); the rest are counted as "other". */
const MAX_REASONS = 12;

export interface Tally {
  full: number;
  partial: number;
  errors: number;
  slow: number;
  totalMs: number;
  reasons: Record<string, number>;
}

export const emptyTally = (): Tally => ({ full: 0, partial: 0, errors: 0, slow: 0, totalMs: 0, reasons: {} });

type Pending = Map<string, { bucket: number; tool: OutcomeTool; tally: Tally }>;
const key = Symbol.for("crypy.visitorOutcomes");
const holder = globalThis as unknown as Record<symbol, Pending | undefined>;
const pending: Pending = (holder[key] ??= new Map());

export function bucketOf(now: number): number {
  return Math.floor(now / BUCKET_MS) * BUCKET_MS;
}

export function addToTally(tally: Tally, outcome: Outcome, reasons: readonly string[], ms: number): void {
  if (outcome === "full") tally.full += 1;
  else if (outcome === "partial") tally.partial += 1;
  else tally.errors += 1;
  if (ms >= SLOW_MS) tally.slow += 1;
  tally.totalMs += Math.max(0, Math.round(ms));
  for (const raw of reasons) {
    const reason = redactKeys(raw).slice(0, 140);
    const known = reason in tally.reasons;
    const target = known || Object.keys(tally.reasons).length < MAX_REASONS ? reason : "other";
    tally.reasons[target] = (tally.reasons[target] ?? 0) + 1;
  }
}

export function recordOutcome(tool: OutcomeTool, result: Classified, ms: number, now = Date.now()): void {
  const bucket = bucketOf(now);
  const id = `${bucket}|${tool}`;
  let entry = pending.get(id);
  if (!entry) {
    entry = { bucket, tool, tally: emptyTally() };
    pending.set(id, entry);
  }
  addToTally(entry.tally, result.outcome, result.reasons, ms);
  startFlushing();
}

/**
 * Runs a visitor's request for `tool`, records what they got and passes the result (or the error) on unchanged.
 * Recording never changes the answer and never throws.
 */
export async function observe<T>(
  tool: OutcomeTool,
  run: () => Promise<T>,
  classify: (value: T) => Classified,
): Promise<T> {
  const started = Date.now();
  try {
    const value = await run();
    try {
      recordOutcome(tool, classify(value), Date.now() - started);
    } catch {
      // Counting must never break a page.
    }
    return value;
  } catch (error) {
    try {
      recordOutcome(tool, errorOutcome(error), Date.now() - started);
    } catch {
      // Ignored.
    }
    throw error;
  }
}

/** Takes everything counted so far (the store saves it). */
export function drainOutcomes(): { bucket: number; tool: OutcomeTool; tally: Tally }[] {
  const out = [...pending.values()];
  pending.clear();
  return out;
}

/** Puts counts back after a failed save, so nothing is lost. */
export function restoreOutcomes(rows: readonly { bucket: number; tool: OutcomeTool; tally: Tally }[]): void {
  for (const row of rows) {
    const id = `${row.bucket}|${row.tool}`;
    const entry = pending.get(id);
    if (!entry) {
      pending.set(id, { ...row, tally: { ...row.tally, reasons: { ...row.tally.reasons } } });
      continue;
    }
    for (const field of ["full", "partial", "errors", "slow", "totalMs"] as const)
      entry.tally[field] += row.tally[field];
    for (const [reason, count] of Object.entries(row.tally.reasons))
      entry.tally.reasons[reason] = (entry.tally.reasons[reason] ?? 0) + count;
  }
}

// ---- Saving every minute, in whichever process counts ---------------------------------------------------------------

const timerKey = Symbol.for("crypy.visitorOutcomesTimer");
const timerHolder = globalThis as unknown as Record<symbol, ReturnType<typeof setInterval> | undefined>;

function startFlushing(): void {
  if (timerHolder[timerKey] || process.env.CRYPY_OUTCOMES === "off") return;
  timerHolder[timerKey] = setInterval(() => {
    void import("./store").then(({ saveOutcomes }) => saveOutcomes()).catch(() => undefined);
  }, 60_000);
  timerHolder[timerKey].unref?.();
}

/** Test helper. */
export function resetOutcomes(): void {
  pending.clear();
  if (timerHolder[timerKey]) clearInterval(timerHolder[timerKey]);
  delete timerHolder[timerKey];
}
