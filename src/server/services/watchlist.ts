import "server-only";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { getAddress } from "viem";
import { getChain } from "@/config/chains";
import { cleanLabel } from "@/lib/portfolio/input";
import {
  MAX_WATCH_ITEMS,
  type WatchItem,
  type WatchItemInput,
  addressRulesSchema,
  ownWalletDefaults,
  tokenDefaults,
  tokenRulesSchema,
  watchOnlyDefaults,
} from "@/lib/watchlist/rules";
import { type Db, getDb } from "@/server/db/client";
import { accounts, alerts, portfolios, sessions, users, watchItems } from "@/server/db/schema";

/** A person's watchlist (M8). Every query is scoped to the signed-in user's id. */
type Row = typeof watchItems.$inferSelect;

const toItem = (row: Row): WatchItem => ({
  id: row.id,
  kind: row.kind as WatchItem["kind"],
  chain: row.chain,
  target: row.target,
  label: row.label,
  rules: row.rules as WatchItem["rules"],
  muted: row.muted,
  createdAt: row.createdAt.toISOString(),
});

export async function listWatchItems(userId: string, db?: Db): Promise<WatchItem[]> {
  const database = db ?? (await getDb());
  const rows = await database
    .select()
    .from(watchItems)
    .where(eq(watchItems.userId, userId))
    .orderBy(asc(watchItems.createdAt));
  return rows.map(toItem);
}

export type AddResult = { ok: true; item: WatchItem } | { ok: false; reason: "full" | "duplicate" | "chain" };

export async function addWatchItem(
  userId: string,
  ownAddress: string,
  input: WatchItemInput,
  db?: Db,
): Promise<AddResult> {
  const database = db ?? (await getDb());
  const target = getAddress(input.target.toLowerCase());
  let chain = "";
  let rules: WatchItem["rules"];
  if (input.kind === "token") {
    const config = getChain(input.chain);
    if (!config || config.status !== "live" || !config.capabilities.tokenSecurity)
      return { ok: false, reason: "chain" };
    chain = config.key;
    rules = input.rules ?? tokenDefaults;
  } else {
    rules = input.rules ?? (target.toLowerCase() === ownAddress.toLowerCase() ? ownWalletDefaults : watchOnlyDefaults);
  }
  return database.transaction(async (tx) => {
    // Lock the person's row so two adds at once can't both pass the limit check.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [{ value: total } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(watchItems)
      .where(eq(watchItems.userId, userId));
    if (total >= MAX_WATCH_ITEMS) return { ok: false, reason: "full" } as const;
    const inserted = await tx
      .insert(watchItems)
      .values({ userId, kind: input.kind, chain, target, label: cleanLabel(input.label), rules })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) return { ok: false, reason: "duplicate" } as const;
    return { ok: true, item: toItem(inserted[0]) } as const;
  });
}

export async function updateWatchItem(
  userId: string,
  id: string,
  patch: { label?: string; rules?: unknown; muted?: boolean },
  db?: Db,
): Promise<WatchItem | null | "invalid"> {
  const database = db ?? (await getDb());
  const [row] = await database
    .select()
    .from(watchItems)
    .where(and(eq(watchItems.id, id), eq(watchItems.userId, userId)));
  if (!row) return null;
  const values: Partial<Row> = {};
  if (patch.label !== undefined) values.label = cleanLabel(patch.label);
  if (patch.muted !== undefined) values.muted = patch.muted;
  if (patch.rules !== undefined) {
    // The rules must fit the item's kind (an address can't get token rules and the reverse).
    const parsed = (row.kind === "token" ? tokenRulesSchema : addressRulesSchema).safeParse(patch.rules);
    if (!parsed.success) return "invalid";
    values.rules = parsed.data;
  }
  if (Object.keys(values).length === 0) return toItem(row);
  const [updated] = await database
    .update(watchItems)
    .set(values)
    .where(and(eq(watchItems.id, id), eq(watchItems.userId, userId)))
    .returning();
  return updated ? toItem(updated) : null;
}

export async function removeWatchItem(userId: string, id: string, db?: Db): Promise<boolean> {
  const database = db ?? (await getDb());
  const removed = await database
    .delete(watchItems)
    .where(and(eq(watchItems.id, id), eq(watchItems.userId, userId)))
    .returning();
  return removed.length > 0;
}

/** Everything CRYPY stores about a person, as plain JSON ("Download my data"). Session tokens are never included. */
export async function exportAccount(userId: string, db?: Db) {
  const database = db ?? (await getDb());
  const [user] = await database.select().from(users).where(eq(users.id, userId));
  const wallets = await database.select().from(accounts).where(eq(accounts.userId, userId));
  const signedIn = await database
    .select({ createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  return {
    exportedAt: new Date().toISOString(),
    account: user ? { createdAt: user.createdAt.toISOString(), plan: user.plan } : null,
    wallets: wallets.map((w) => ({ accountId: w.accountId, addedAt: w.createdAt.toISOString() })),
    sessions: signedIn.map((s) => ({ startedAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString() })),
    watchlist: await listWatchItems(userId, database),
    telegram: user?.telegramChatId
      ? { chatId: user.telegramChatId, username: user.telegramUsername, linkedAt: user.telegramLinkedAt?.toISOString() }
      : null,
    quietHours: user ? { on: user.quietOn, start: user.quietStart, end: user.quietEnd, timeZone: user.timeZone } : null,
    alerts: (await database.select().from(alerts).where(eq(alerts.userId, userId)).orderBy(desc(alerts.createdAt))).map(
      (a) => ({
        at: a.createdAt.toISOString(),
        kind: a.kind,
        chain: a.chain,
        title: a.title,
        details: a.details,
        status: a.status,
        sentAt: a.sentAt?.toISOString() ?? null,
      }),
    ),
    portfolio: (await database.select().from(portfolios).where(eq(portfolios.userId, userId)))[0]?.data ?? null,
  };
}

/** Deletes the person and everything linked to them (wallets, sessions, watchlist, Telegram link, alert history,
 * synced portfolio: ON DELETE CASCADE). */
export async function deleteAccount(userId: string, db?: Db): Promise<void> {
  const database = db ?? (await getDb());
  await database.delete(users).where(eq(users.id, userId));
}
