import "server-only";
import { desc, eq, gte, or } from "drizzle-orm";
import { type NewUpdate, SHOW_FIXED_DAYS, type StatusUpdate, type UpdateState } from "@/lib/health/updates";
import { getDb } from "@/server/db/client";
import { statusUpdates } from "@/server/db/schema";

type Row = typeof statusUpdates.$inferSelect;

const toUpdate = (row: Row): StatusUpdate => ({
  id: row.id,
  title: row.title,
  body: row.body,
  state: row.state as UpdateState,
  component: row.component,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  fixedAt: row.fixedAt?.toISOString() ?? null,
});

/**
 * Updates for the public page: every ongoing or planned one, and fixed ones from the last 90 days, newest first. At
 * most 50.
 */
export async function publicUpdates(now = Date.now()): Promise<StatusUpdate[]> {
  const db = await getDb();
  const since = new Date(now - SHOW_FIXED_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(statusUpdates)
    .where(
      or(eq(statusUpdates.state, "ongoing"), eq(statusUpdates.state, "planned"), gte(statusUpdates.createdAt, since)),
    )
    .orderBy(desc(statusUpdates.createdAt))
    .limit(50);
  return rows.map(toUpdate);
}

export async function createUpdate(update: NewUpdate, now = new Date()): Promise<StatusUpdate> {
  const db = await getDb();
  const [row] = await db
    .insert(statusUpdates)
    .values({ ...update, createdAt: now, updatedAt: now, fixedAt: update.state === "fixed" ? now : null })
    .returning();
  return toUpdate(row!);
}

/** Changes an update's state (for example Ongoing → Fixed). Null when it doesn't exist. */
export async function changeUpdateState(
  id: string,
  state: UpdateState,
  now = new Date(),
): Promise<StatusUpdate | null> {
  const db = await getDb();
  const [row] = await db
    .update(statusUpdates)
    .set({ state, updatedAt: now, fixedAt: state === "fixed" ? now : null })
    .where(eq(statusUpdates.id, id))
    .returning();
  return row ? toUpdate(row) : null;
}
