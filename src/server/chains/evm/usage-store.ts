import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { providerUsage } from "@/server/db/schema";
import { monthDays } from "./alchemy-budget";
import { addSavedUsage, setAlchemyMonthUsage, usageToSave } from "./providers";

/**
 * Keeps the free-plan counters in the database (provider_usage): read once at start, saved every minute by the
 * worker. Without it a restart (every update) would start the day from zero, and Alchemy's limit couldn't follow the
 * monthly plan. Numbers and host names only.
 */
const loadedKey = Symbol.for("crypy.usageStoreLoadedDay");
const holder = globalThis as unknown as Record<symbol, string | undefined>;

/** Units Alchemy spent before today this month, as saved; also tells the meter. */
async function refreshMonth(now: number): Promise<void> {
  const { today, monthStart } = monthDays(now);
  const db = await getDb();
  const [row] = await db
    .select({ units: sql<string | number | null>`coalesce(sum(${providerUsage.units}), 0)` })
    .from(providerUsage)
    .where(
      and(eq(providerUsage.provider, "alchemy"), gte(providerUsage.day, monthStart), lt(providerUsage.day, today)),
    );
  setAlchemyMonthUsage(today, Number(row?.units ?? 0));
}

/** First run of a day in this process: add what earlier processes saved today, then learn the month. */
async function loadToday(now: number): Promise<void> {
  const { today } = monthDays(now);
  if (holder[loadedKey] === today) return;
  const db = await getDb();
  const saved = await db.select().from(providerUsage).where(eq(providerUsage.day, today));
  // Only on the process's first load: on a new day the in-memory counts start fresh by themselves.
  if (holder[loadedKey] === undefined) addSavedUsage(saved);
  holder[loadedKey] = today;
}

/** Saves today's counts (absolute values) and refreshes the month. Run by the worker every minute. */
export async function saveProviderUsage(now = Date.now()): Promise<void> {
  await loadToday(now);
  const rows = usageToSave();
  if (rows.length > 0) {
    const db = await getDb();
    await db
      .insert(providerUsage)
      .values(rows.map((row) => ({ ...row, updatedAt: new Date(now) })))
      .onConflictDoUpdate({
        target: [providerUsage.day, providerUsage.provider],
        set: {
          requests: sql`excluded.requests`,
          units: sql`excluded.units`,
          backgroundUnits: sql`excluded.background_units`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  await refreshMonth(now);
}

/** Keeps about 13 months (enough to compare months); run with the hourly housekeeping. */
export async function pruneProviderUsage(now = Date.now()): Promise<void> {
  const cutoff = new Date(now - 400 * 86_400_000).toISOString().slice(0, 10);
  const db = await getDb();
  await db.delete(providerUsage).where(lt(providerUsage.day, cutoff));
}

/** Test helper. */
export function resetUsageStore(): void {
  delete holder[loadedKey];
}
