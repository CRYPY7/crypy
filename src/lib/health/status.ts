import { type CheckDefinition, type StatusComponent, findCheck } from "./checks";

/**
 * Turning saved check results into states. Pure, so every rule is unit-tested.
 *
 *  - A check is "operational" when its newest result passed, "degraded" when it was slow or failed once, and "down"
 *    when its two newest results both failed (one bad moment doesn't mark a tool down).
 *  - A check with no result for 3 of its intervals is "unknown" (the server isn't checking it, so nothing is claimed).
 *  - A skipped check (not set up on this server, e.g. no Telegram bot) is left out.
 */

export type CheckStatus = "ok" | "slow" | "fail" | "skipped";
export type HealthState = "operational" | "degraded" | "down" | "unknown";

export interface CheckResult {
  check: string;
  status: CheckStatus;
  /** Time taken, in milliseconds (null when the check didn't run anything, e.g. reading a heartbeat). */
  ms: number | null;
  /** Private: shown on the admin dashboard only, with keys already removed. */
  detail: string | null;
  at: Date;
}

const rank: Record<HealthState, number> = { operational: 0, unknown: 1, degraded: 2, down: 3 };
export const worst = (states: HealthState[]): HealthState =>
  states.reduce<HealthState>((a, b) => (rank[b] > rank[a] ? b : a), "operational");

/** Grace on top of 3 intervals, so a round that runs a little late isn't "unknown". */
const STALE_GRACE_MS = 60_000;

/**
 * State of one check from its newest results (newest first). Returns null for a skipped check (left out of
 * components) and "unknown" when nothing recent was saved.
 */
export function checkState(
  definition: Pick<CheckDefinition, "everyMs">,
  newestFirst: readonly Pick<CheckResult, "status" | "at">[],
  now: number,
): HealthState | null {
  const [latest, previous] = newestFirst;
  if (!latest || now - latest.at.getTime() > definition.everyMs * 3 + STALE_GRACE_MS) return "unknown";
  if (latest.status === "skipped") return null;
  if (latest.status === "ok") return "operational";
  if (latest.status === "fail" && previous?.status === "fail") return "down";
  return "degraded";
}

/** Current state of every check, from results grouped by check (newest first). */
export function checkStates(
  byCheck: ReadonlyMap<string, readonly Pick<CheckResult, "status" | "at">[]>,
  checkIds: readonly string[],
  now: number,
): Map<string, HealthState | null> {
  const states = new Map<string, HealthState | null>();
  for (const id of checkIds) {
    const definition = findCheck(id);
    if (definition) states.set(id, checkState(definition, byCheck.get(id) ?? [], now));
  }
  return states;
}

/** A component's state: the worst of the checks it needs; per-chain alternatives are down only when all are down. */
export function componentState(
  component: Pick<StatusComponent, "checks" | "someOf">,
  states: ReadonlyMap<string, HealthState | null>,
): HealthState {
  const needed = component.checks.map((id) => states.get(id)).filter((s): s is HealthState => s != null);
  const alternatives = (component.someOf ?? []).map((id) => states.get(id)).filter((s): s is HealthState => s != null);
  let fromAlternatives: HealthState[] = [];
  if (alternatives.length) {
    if (alternatives.every((s) => s === "down")) fromAlternatives = ["down"];
    else if (alternatives.every((s) => s === "unknown")) fromAlternatives = ["unknown"];
    else if (alternatives.some((s) => s !== "operational")) fromAlternatives = ["degraded"];
  }
  const all = [...needed, ...fromAlternatives];
  return all.length ? worst(all) : "unknown";
}

/** One UTC day of saved results for one check. */
export interface DayCount {
  check: string;
  /** "YYYY-MM-DD" (UTC) */
  day: string;
  total: number;
  failed: number;
}

export type DayState = "operational" | "degraded" | "down" | "none";
export interface DayBar {
  day: string;
  state: DayState;
  /** Share of checks that passed that day, 0–1; null without data. */
  uptime: number | null;
}

/** "YYYY-MM-DD" of the last `days` UTC days, oldest first. */
export function lastDays(days: number, now: number): string[] {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return Array.from({ length: days }, (_, i) =>
    new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/**
 * Daily bars for a component: passed share across every check it needs that day. 99.5% or more is a good day, 95%
 * or more a day with problems, below that a day with an outage. Days without any saved result are "none" (no claim).
 */
export function dayBars(
  component: Pick<StatusComponent, "checks" | "someOf">,
  counts: readonly DayCount[],
  days: readonly string[],
): DayBar[] {
  const ids = new Set([...component.checks, ...(component.someOf ?? [])]);
  const perDay = new Map<string, { total: number; failed: number }>();
  for (const row of counts) {
    if (!ids.has(row.check)) continue;
    const entry = perDay.get(row.day) ?? { total: 0, failed: 0 };
    entry.total += row.total;
    entry.failed += row.failed;
    perDay.set(row.day, entry);
  }
  return days.map((day) => {
    const entry = perDay.get(day);
    if (!entry || entry.total === 0) return { day, state: "none", uptime: null };
    const uptime = (entry.total - entry.failed) / entry.total;
    const state: DayState = uptime >= 0.995 ? "operational" : uptime >= 0.95 ? "degraded" : "down";
    return { day, state, uptime };
  });
}

/** Uptime over the bars that have data (null when none do). */
export function uptimeShare(bars: readonly DayBar[]): number | null {
  const withData = bars.filter((b) => b.uptime !== null);
  if (!withData.length) return null;
  return withData.reduce((sum, b) => sum + (b.uptime ?? 0), 0) / withData.length;
}

/** Results of one check, newest first, grouped (input in any order). */
export function groupByCheck<T extends Pick<CheckResult, "check" | "at">>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of [...rows].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const list = grouped.get(row.check) ?? [];
    list.push(row);
    grouped.set(row.check, list);
  }
  return grouped;
}
