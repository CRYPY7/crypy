import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import type { AlertDetails, AlertKind, AlertSeverity } from "@/lib/alerts/format";
import { getDb, type Db } from "@/server/db/client";
import { alerts } from "@/server/db/schema";

/** Alert history is kept this long (Recent alerts and the download). */
export const ALERT_RETENTION_DAYS = 90;

export interface NewAlert {
  userId: string;
  itemId: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  chain: string;
  title: string;
  details: AlertDetails;
  /** Same key for the same event: it alerts once even if the checker sees it twice. */
  dedupeKey: string;
}

/** Saves new alerts (status "queued"); ones already saved are skipped. Returns how many were new. */
export async function enqueueAlerts(rows: NewAlert[], db?: Db): Promise<number> {
  if (rows.length === 0) return 0;
  const database = db ?? (await getDb());
  const inserted = await database
    .insert(alerts)
    .values(rows.map((r) => ({ ...r, details: r.details as unknown as Record<string, unknown> })))
    .onConflictDoNothing({ target: [alerts.userId, alerts.dedupeKey] })
    .returning({ id: alerts.id });
  return inserted.length;
}

export interface AlertView {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  chain: string;
  title: string;
  summary: string;
  path: string;
  status: string;
  createdAt: string;
}

export const ALERT_PAGE = 20;

/** Newest first; `before` pages back through older alerts. */
export async function listAlerts(userId: string, before?: Date, limit = ALERT_PAGE, db?: Db): Promise<AlertView[]> {
  const database = db ?? (await getDb());
  const rows = await database
    .select()
    .from(alerts)
    .where(before ? and(eq(alerts.userId, userId), lt(alerts.createdAt, before)) : eq(alerts.userId, userId))
    .orderBy(desc(alerts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => {
    const details = r.details as unknown as AlertDetails;
    return {
      id: r.id,
      kind: r.kind as AlertKind,
      severity: r.severity as AlertSeverity,
      chain: r.chain,
      title: r.title,
      summary: details.summary ?? "",
      path: details.path ?? "/tools/watchlist",
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function pruneAlerts(now = new Date(), db?: Db): Promise<void> {
  const database = db ?? (await getDb());
  await database
    .delete(alerts)
    .where(lt(alerts.createdAt, new Date(now.getTime() - ALERT_RETENTION_DAYS * 86_400_000)));
}
