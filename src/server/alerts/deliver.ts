import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { siteUrl } from "@/config/env";
import { MAX_SINGLE, telegramAlert, telegramDigest, type AlertRecord } from "@/lib/alerts/format";
import { isQuietNow } from "@/lib/alerts/quiet";
import { getDb, type Db } from "@/server/db/client";
import { alerts, users, watchItems } from "@/server/db/schema";
import { unlinkTelegramUser } from "@/server/services/telegram";
import {
  TelegramBlockedError,
  sendTelegramMessage,
  telegramConfigured,
  type InlineButton,
} from "@/server/telegram/api";

/** A waiting alert that still can't be sent after this long is marked failed (it stays in the history). */
const GIVE_UP_MS = 24 * 60 * 60_000;
/** Telegram allows about one message a second per chat. */
const PER_CHAT_GAP_MS = 1_100;

type Send = (chatId: string, html: string, buttons: InlineButton[][]) => Promise<void>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends waiting alerts. Per person: nothing during quiet hours (they wait); muted items are skipped; more than
 * MAX_SINGLE waiting alerts go out as one summary; without Telegram connected they stay in the history only.
 */
export async function deliverQueued(
  now = new Date(),
  db?: Db,
  send: Send = sendTelegramMessage,
  gapMs = PER_CHAT_GAP_MS,
): Promise<{ sent: number; held: number }> {
  const database = db ?? (await getDb());
  const queued = await database
    .select({ alert: alerts, user: users, muted: watchItems.muted })
    .from(alerts)
    .innerJoin(users, eq(alerts.userId, users.id))
    .leftJoin(watchItems, eq(alerts.itemId, watchItems.id))
    .where(eq(alerts.status, "queued"))
    .orderBy(asc(alerts.createdAt))
    .limit(500);
  const mark = async (ids: string[], status: string) => {
    if (ids.length)
      await database
        .update(alerts)
        .set({ status, ...(status === "sent" ? { sentAt: now } : {}) })
        .where(inArray(alerts.id, ids));
  };

  const byUser = new Map<string, typeof queued>();
  for (const row of queued) byUser.set(row.user.id, [...(byUser.get(row.user.id) ?? []), row]);

  let sent = 0;
  let held = 0;
  for (const rows of byUser.values()) {
    const user = rows[0]!.user;
    const mutedIds = rows.filter((r) => r.muted).map((r) => r.alert.id);
    await mark(mutedIds, "muted");
    const live = rows.filter((r) => !r.muted);
    if (live.length === 0) continue;
    if (!user.telegramChatId || !telegramConfigured()) {
      await mark(
        live.map((r) => r.alert.id),
        "no-channel",
      );
      continue;
    }
    const quiet = { on: user.quietOn, start: user.quietStart, end: user.quietEnd, timeZone: user.timeZone };
    if (isQuietNow(quiet, now)) {
      held += live.length;
      continue;
    }
    const records: AlertRecord[] = live.map((r) => ({
      kind: r.alert.kind as AlertRecord["kind"],
      severity: r.alert.severity as AlertRecord["severity"],
      title: r.alert.title,
      details: r.alert.details as unknown as AlertRecord["details"],
    }));
    try {
      if (records.length > MAX_SINGLE) {
        const digest = telegramDigest(records, siteUrl);
        await send(user.telegramChatId, digest.html, digest.buttons);
        await mark(
          live.map((r) => r.alert.id),
          "sent",
        );
        sent += live.length;
        continue;
      }
      for (const [i, record] of records.entries()) {
        const message = telegramAlert(record, siteUrl);
        await send(user.telegramChatId, message.html, message.buttons);
        await mark([live[i]!.alert.id], "sent");
        sent += 1;
        if (i < records.length - 1) await sleep(gapMs);
      }
    } catch (error) {
      if (error instanceof TelegramBlockedError) {
        // The person blocked the bot or deleted the chat: stop trying; the page shows Telegram as not connected.
        await unlinkTelegramUser(user.id, database);
        await mark(
          live.map((r) => r.alert.id),
          "no-channel",
        );
      } else {
        // Telegram unreachable: try again next round, until the alert is a day old.
        const stale = live
          .filter((r) => now.getTime() - r.alert.createdAt.getTime() > GIVE_UP_MS)
          .map((r) => r.alert.id);
        await mark(stale, "failed");
      }
    }
  }
  return { sent, held };
}
