import "server-only";
import { gte, lt, sql } from "drizzle-orm";
import { OUTCOME_TOOLS, type OutcomeTool } from "@/lib/outcomes/classify";
import { getDb } from "@/server/db/client";
import { visitorOutcomes } from "@/server/db/schema";
import { type Tally, drainOutcomes, emptyTally, restoreOutcomes } from "./record";

/**
 * Saves the counted visitor outcomes (record.ts) and reads them back for the admin dashboard and the owner's
 * Telegram messages. Counts are added to what is saved, so several server processes can save into the same buckets.
 */
export async function saveOutcomes(): Promise<number> {
  const rows = drainOutcomes();
  if (rows.length === 0) return 0;
  try {
    const db = await getDb();
    await db
      .insert(visitorOutcomes)
      .values(
        rows.map((r) => ({
          bucket: new Date(r.bucket),
          tool: r.tool,
          full: r.tally.full,
          partial: r.tally.partial,
          errors: r.tally.errors,
          slow: r.tally.slow,
          totalMs: r.tally.totalMs,
          reasons: r.tally.reasons,
        })),
      )
      .onConflictDoUpdate({
        target: [visitorOutcomes.bucket, visitorOutcomes.tool],
        set: {
          full: sql`${visitorOutcomes.full} + excluded.full`,
          partial: sql`${visitorOutcomes.partial} + excluded.partial`,
          errors: sql`${visitorOutcomes.errors} + excluded.errors`,
          slow: sql`${visitorOutcomes.slow} + excluded.slow`,
          totalMs: sql`${visitorOutcomes.totalMs} + excluded.total_ms`,
          // Adds the reason counts key by key.
          reasons: sql`(select coalesce(jsonb_object_agg(k, coalesce((${visitorOutcomes.reasons}->>k)::int, 0) + coalesce((excluded.reasons->>k)::int, 0)), '{}'::jsonb) from jsonb_object_keys(${visitorOutcomes.reasons} || excluded.reasons) as k)`,
        },
      });
    return rows.length;
  } catch (error) {
    restoreOutcomes(rows);
    throw error;
  }
}

/** Keeps 90 days; run with the hourly housekeeping. */
export async function pruneOutcomes(now = Date.now()): Promise<void> {
  const db = await getDb();
  await db.delete(visitorOutcomes).where(lt(visitorOutcomes.bucket, new Date(now - 90 * 86_400_000)));
}

export interface ToolSummary {
  tool: OutcomeTool;
  total: number;
  full: number;
  partial: number;
  errors: number;
  slow: number;
  averageMs: number | null;
  /** Most frequent reasons, largest first. */
  reasons: { reason: string; count: number }[];
}

/** Adds rows up per tool (pure; used by the queries below and tested). */
export function summarize(
  rows: readonly ({ tool: string } & Pick<Tally, "full" | "partial" | "errors" | "slow" | "totalMs" | "reasons">)[],
): ToolSummary[] {
  const byTool = new Map<string, Tally>();
  for (const row of rows) {
    const t = byTool.get(row.tool) ?? emptyTally();
    t.full += row.full;
    t.partial += row.partial;
    t.errors += row.errors;
    t.slow += row.slow;
    t.totalMs += Number(row.totalMs);
    for (const [reason, count] of Object.entries(row.reasons ?? {}))
      t.reasons[reason] = (t.reasons[reason] ?? 0) + count;
    byTool.set(row.tool, t);
  }
  return OUTCOME_TOOLS.filter((tool) => byTool.has(tool)).map((tool) => {
    const t = byTool.get(tool)!;
    const total = t.full + t.partial + t.errors;
    return {
      tool,
      total,
      full: t.full,
      partial: t.partial,
      errors: t.errors,
      slow: t.slow,
      averageMs: total ? Math.round(t.totalMs / total) : null,
      reasons: Object.entries(t.reasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  });
}

/** Per-tool summary since `since` (saved counts only; at most a minute behind). */
export async function outcomesSince(since: number): Promise<ToolSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(visitorOutcomes)
    .where(gte(visitorOutcomes.bucket, new Date(since)));
  return summarize(rows);
}

// ---- Owner messages: a tool failing for visitors ---------------------------------------------------------------------

/** A tool is "failing" when more than 2% of its visitor requests in the last 10 minutes failed, with at least 3 errors. */
export const ALERT_RATE = 0.02;
export const ALERT_MIN_ERRORS = 3;
export const ALERT_WINDOW_MS = 10 * 60_000;

export function isFailing(s: Pick<ToolSummary, "total" | "errors">): boolean {
  return s.errors >= ALERT_MIN_ERRORS && s.errors / Math.max(1, s.total) > ALERT_RATE;
}

export interface OutcomeTransition {
  tool: OutcomeTool;
  kind: "problem" | "fixed";
  /** Problem: errors and requests in the window, and the top reason. Fixed: minutes it lasted. */
  errors: number;
  total: number;
  reason: string | null;
  minutes: number | null;
}

/** Which tools started or stopped failing since the last check (pure; state is the start time of each problem). */
export function outcomeTransitions(
  window: readonly ToolSummary[],
  failingSince: Map<OutcomeTool, number>,
  now: number,
): OutcomeTransition[] {
  const out: OutcomeTransition[] = [];
  const failingNow = new Set(window.filter(isFailing).map((s) => s.tool));
  for (const s of window)
    if (failingNow.has(s.tool) && !failingSince.has(s.tool)) {
      failingSince.set(s.tool, now);
      out.push({
        tool: s.tool,
        kind: "problem",
        errors: s.errors,
        total: s.total,
        reason: s.reasons[0]?.reason ?? null,
        minutes: null,
      });
    }
  for (const [tool, since] of [...failingSince])
    if (!failingNow.has(tool)) {
      failingSince.delete(tool);
      out.push({
        tool,
        kind: "fixed",
        errors: 0,
        total: 0,
        reason: null,
        minutes: Math.max(1, Math.round((now - since) / 60_000)),
      });
    }
  return out;
}
