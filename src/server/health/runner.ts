import "server-only";
import { desc, gte, lt, sql } from "drizzle-orm";
import {
  type CheckDefinition,
  TOOL_CHECKS_PER_ROUND,
  checkDefinitions,
  checkIds,
  checkLabelKey,
  statusComponents,
} from "@/lib/health/checks";
import {
  type CheckResult,
  type CheckStatus,
  type DayCount,
  type HealthState,
  checkStates,
  componentState,
  dayBars,
  groupByCheck,
  lastDays,
  uptimeShare,
} from "@/lib/health/status";
import { getDb } from "@/server/db/client";
import { healthChecks } from "@/server/db/schema";
import { redactKeys } from "@/server/redact";
import messages from "../../../messages/en.json";
import { notifyAdmins, transitions } from "./notify";
import { type Probe, Skip, probes } from "./probes";

/** Results older than this are removed by the hourly housekeeping. */
export const KEEP_DAYS = 90;
/** A check that hasn't finished after this is saved as failed. */
const TIMEOUT_MS = 25_000;

/** When each check last ran in this server process. */
const lastRunKey = Symbol.for("crypy.healthLastRun");
const store = globalThis as typeof globalThis & { [lastRunKey]?: Map<string, number> };
const lastRun = (store[lastRunKey] ??= new Map());

/**
 * Which checks run this round: every check that is due, except that checks using a provider's allowance (real tool
 * runs) are capped per round, longest-waiting first, so a fresh server doesn't start all of them at once. Pure.
 */
export function dueChecks(
  definitions: readonly CheckDefinition[],
  ranAt: ReadonlyMap<string, number>,
  now: number,
  toolLimit = TOOL_CHECKS_PER_ROUND,
): CheckDefinition[] {
  // A round can start a little early; 30 s of slack keeps a 5-minute check on every 5-minute round.
  const due = definitions.filter((d) => now - (ranAt.get(d.id) ?? -Infinity) >= d.everyMs - 30_000);
  const quick = due.filter((d) => d.group !== "tool");
  const tools = due
    .filter((d) => d.group === "tool")
    .sort((a, b) => (ranAt.get(a.id) ?? -Infinity) - (ranAt.get(b.id) ?? -Infinity))
    .slice(0, toolLimit);
  return [...quick, ...tools];
}

/** Runs one check: passed, slow (took long, or the check said so with "slow:"), failed, or skipped. */
export async function runProbe(
  definition: CheckDefinition,
  probe: Probe | undefined,
  timeoutMs = TIMEOUT_MS,
): Promise<Omit<CheckResult, "at">> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!probe) throw new Skip("no check");
    const note = await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      }),
    ]);
    const ms = Date.now() - started;
    const flagged = typeof note === "string" && note.startsWith("slow:");
    const detail = typeof note === "string" ? redactKeys(flagged ? note.slice(5) : note).slice(0, 300) : null;
    const status: CheckStatus = flagged || ms > definition.slowMs ? "slow" : "ok";
    return { check: definition.id, status, ms, detail };
  } catch (error) {
    const skipped = error instanceof Skip;
    return {
      check: definition.id,
      status: skipped ? "skipped" : "fail",
      ms: skipped ? null : Date.now() - started,
      detail: redactKeys((error as Error)?.message ?? "failed").slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** One health round (worker, every 5 minutes): runs the due checks side by side and saves every result. */
export async function runHealthRound(now = Date.now()): Promise<{ ran: number; failed: string[] }> {
  const due = dueChecks(checkDefinitions, lastRun, now);
  for (const d of due) lastRun.set(d.id, now);
  const results = await Promise.all(due.map((d) => runProbe(d, probes[d.id])));
  if (results.length) {
    const db = await getDb();
    const at = new Date();
    await db.insert(healthChecks).values(results.map((r) => ({ ...r, checkedAt: at })));
    // Telegram to the admins when a check starts failing (second failure in a row) or passes again.
    const ran = new Set(results.map((r) => r.check));
    const recent = groupByCheck((await recentResults(26, now)).filter((r) => ran.has(r.check)));
    await notifyAdmins(transitions(recent), englishLabel);
  }
  return { ran: results.length, failed: results.filter((r) => r.status === "fail").map((r) => r.check) };
}

/** A check's English name for admin messages (from the dictionary). */
export function englishLabel(check: string): string {
  const { key, chain } = checkLabelKey(check);
  const labels = messages.admin.checks.label as Record<string, string>;
  const text = labels[key] ?? check;
  return chain ? text.replace("{chain}", (messages.chains as Record<string, string>)[chain] ?? chain) : text;
}

export async function pruneHealthChecks(now = Date.now()): Promise<void> {
  const db = await getDb();
  await db.delete(healthChecks).where(lt(healthChecks.checkedAt, new Date(now - KEEP_DAYS * 86_400_000)));
}

/** Saved results from the last `hours`, newest first (for current states and the admin dashboard). */
export async function recentResults(hours = 26, now = Date.now()): Promise<CheckResult[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(healthChecks)
    .where(gte(healthChecks.checkedAt, new Date(now - hours * 3_600_000)))
    .orderBy(desc(healthChecks.checkedAt));
  return rows.map((r) => ({
    check: r.check,
    status: r.status as CheckStatus,
    ms: r.ms,
    detail: r.detail,
    at: r.checkedAt,
  }));
}

/** Passed and failed results per check per UTC day, for the uptime bars. */
export async function dailyCounts(days = KEEP_DAYS, now = Date.now()): Promise<DayCount[]> {
  const db = await getDb();
  const day = sql<string>`to_char(${healthChecks.checkedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      check: healthChecks.check,
      day,
      total: sql<number>`count(*) filter (where ${healthChecks.status} <> 'skipped')`,
      failed: sql<number>`count(*) filter (where ${healthChecks.status} = 'fail')`,
    })
    .from(healthChecks)
    .where(gte(healthChecks.checkedAt, new Date(now - days * 86_400_000)))
    .groupBy(healthChecks.check, day);
  return rows.map((r) => ({ check: r.check, day: r.day, total: Number(r.total), failed: Number(r.failed) }));
}

/**
 * The headline: down when the website itself is down, degraded when any part is down or having problems, unknown
 * when nothing has been checked. Pure.
 */
export function overallState(components: readonly Pick<PublicComponentStatus, "id" | "state">[]): HealthState {
  const states = components.map((c) => c.state);
  if (!states.length || states.every((s) => s === "unknown")) return "unknown";
  if (components.find((c) => c.id === "website")?.state === "down") return "down";
  if (states.some((s) => s === "down" || s === "degraded")) return "degraded";
  return "operational";
}

export interface PublicComponentStatus {
  id: string;
  group: (typeof statusComponents)[number]["group"];
  tool?: string;
  chain?: string;
  state: HealthState;
  bars: ReturnType<typeof dayBars>;
  uptime: number | null;
}

export interface PublicStatus {
  overall: HealthState;
  components: PublicComponentStatus[];
  /** Time of the newest saved result (null when the server has never checked). */
  checkedAt: string | null;
}

/**
 * What the public status page shows. States and daily bars only: no reasons, timings, provider names or server
 * details.
 */
export async function publicStatus(now = Date.now(), days = KEEP_DAYS): Promise<PublicStatus> {
  const [recent, counts] = await Promise.all([recentResults(26, now), dailyCounts(days, now)]);
  const states = checkStates(groupByCheck(recent), checkIds, now);
  const range = lastDays(days, now);
  const components = statusComponents.map((c) => {
    const bars = dayBars(c, counts, range);
    return {
      id: c.id,
      group: c.group,
      ...(c.tool ? { tool: c.tool } : {}),
      ...(c.chain ? { chain: c.chain } : {}),
      state: componentState(c, states),
      bars,
      uptime: uptimeShare(bars),
    };
  });
  const overall = overallState(components);
  return { overall, components, checkedAt: recent[0]?.at.toISOString() ?? null };
}

/** The time a page reads the results at (one value per request, so every number on the page agrees). */
export function readTime(): number {
  return Date.now();
}
