import "server-only";
import { sql } from "drizzle-orm";
import { type CheckGroup, checkDefinitions } from "@/lib/health/checks";
import { type CheckStatus, type HealthState, checkState, groupByCheck } from "@/lib/health/status";
import { providersFor, restingNow, usageSnapshot } from "@/server/chains/evm/providers";
import { type ProviderHealth, providerHealth } from "@/server/chains/evm/provider-health";
import { type ChainKey, liveChains } from "@/config/chains";
import { getDb } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { telegramConfigured } from "@/server/telegram/api";
import { todayCounts } from "./counters";
import { adminChats } from "./notify";
import { recentResults } from "./runner";

/**
 * Everything the admin dashboard shows (M9 Part 5, board 53). Read from saved results and in-memory counters only:
 * opening the dashboard never calls a data provider. Private: reasons and provider names are here, never on /status.
 */
export interface AdminCheckRow {
  id: string;
  group: CheckGroup;
  /** null: skipped (not set up on this server). */
  state: HealthState | null;
  status: CheckStatus | null;
  ms: number | null;
  at: string | null;
  detail: string | null;
}

export interface AdminFailure {
  check: string;
  detail: string;
  count: number;
  lastAt: string;
}

export interface AdminHealth {
  lastRoundAt: string | null;
  checks: AdminCheckRow[];
  /** Share of checks that passed or were slow in the last 24 hours (null without data). */
  passed24h: number | null;
  failures: AdminFailure[];
  providers: ReturnType<typeof usageSnapshot>;
  /** S3: each chain's providers over the last hour (names only), worst first within a chain. */
  providerHealth: ({
    chain: ChainKey;
    provider: string;
    kind: "alchemy" | "extra" | "public";
    restingUntil: string | null;
    restingMethods: string[];
  } & ProviderHealth)[];
  alchemyConfigured: boolean;
  counters: ReturnType<typeof todayCounts>;
  databaseBytes: number | null;
  uptimeHours: number;
  telegram: { bot: boolean; chats: number };
}

const order: Record<string, number> = { down: 0, degraded: 1, unknown: 2, operational: 3, skipped: 4 };

/** Problems first, then not checked, then working, then not set up here; definition order within each. Pure. */
export function sortChecks(rows: readonly AdminCheckRow[]): AdminCheckRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => order[a.row.state ?? "skipped"]! - order[b.row.state ?? "skipped"]! || a.index - b.index)
    .map(({ row }) => row);
}

/** Failed results grouped by check and reason, most frequent first. Pure. */
export function groupFailures(
  results: readonly { check: string; status: CheckStatus; detail: string | null; at: Date }[],
): AdminFailure[] {
  const groups = new Map<string, AdminFailure>();
  for (const r of results) {
    if (r.status !== "fail") continue;
    const detail = r.detail ?? "";
    const key = `${r.check}\u0000${detail}`;
    const group = groups.get(key) ?? { check: r.check, detail, count: 0, lastAt: r.at.toISOString() };
    group.count += 1;
    if (r.at.toISOString() > group.lastAt) group.lastAt = r.at.toISOString();
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

async function databaseBytes(): Promise<number | null> {
  try {
    const db = await getDb();
    const result = (await db.execute(sql`select pg_database_size(current_database()) as size`)) as unknown as {
      rows?: { size?: string | number }[];
    };
    const size = Number(result.rows?.[0]?.size);
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

export async function adminHealth(now = Date.now()): Promise<AdminHealth> {
  const [recent, dbBytes, chats] = await Promise.all([
    recentResults(26, now),
    databaseBytes(),
    adminChats().catch(() => []),
  ]);
  const byCheck = groupByCheck(recent);
  const checks = sortChecks(
    checkDefinitions.map((d) => {
      const list = byCheck.get(d.id) ?? [];
      const latest = list[0];
      return {
        id: d.id,
        group: d.group,
        state: checkState(d, list, now),
        status: latest?.status ?? null,
        ms: latest?.ms ?? null,
        at: latest?.at.toISOString() ?? null,
        detail: latest?.detail ?? null,
      };
    }),
  );
  const day = recent.filter((r) => now - r.at.getTime() <= 86_400_000 && r.status !== "skipped");
  return {
    lastRoundAt: recent[0]?.at.toISOString() ?? null,
    checks,
    passed24h: day.length ? day.filter((r) => r.status !== "fail").length / day.length : null,
    failures: groupFailures(day).slice(0, 20),
    providers: usageSnapshot(),
    providerHealth: providerHealthTable(now),
    alchemyConfigured: Boolean(serverEnv.ALCHEMY_API_KEY),
    counters: todayCounts(now),
    databaseBytes: dbBytes,
    uptimeHours: process.uptime() / 3_600,
    telegram: { bot: telegramConfigured(), chats: chats.length },
  };
}

const STATE_ORDER: Record<ProviderHealth["state"], number> = { poor: 0, uneven: 1, good: 2, idle: 3 };

/** Every live EVM chain's providers with their last-hour health and what is resting now. */
export function providerHealthTable(now = Date.now()): AdminHealth["providerHealth"] {
  return liveChains
    .filter((chain) => chain.family === "evm")
    .flatMap((chain) =>
      providersFor(chain)
        .map((p) => {
          const rest = restingNow(p, now);
          return {
            chain: chain.key,
            provider: p.name,
            kind: p.kind,
            restingUntil: rest.until ? new Date(rest.until).toISOString() : null,
            restingMethods: rest.methods,
            ...providerHealth(p.url, now),
          };
        })
        .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.requests - a.requests),
    );
}
