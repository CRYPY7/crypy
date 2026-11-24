import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { CheckResult } from "@/lib/health/status";
import { escapeHtml, isPublicSite } from "@/lib/alerts/format";
import { siteUrl } from "@/config/env";
import { adminAccountIds } from "@/server/admin/auth";
import { getDb } from "@/server/db/client";
import { accounts, users } from "@/server/db/schema";
import { redactKeys } from "@/server/redact";
import { sendTelegramMessage, telegramConfigured } from "@/server/telegram/api";

/**
 * Telegram messages to the admins when something breaks and when it's fixed (M9 Part 5, board 54). At most one
 * message per problem: sent when a check fails for the second time in a row, and once more when it passes again.
 * Only to Telegram chats linked to admin wallets. Never asks to connect a wallet or sign anything.
 */
export interface Transition {
  check: string;
  kind: "problem" | "fixed";
  /** Problem: the newest failure's reason. */
  detail: string | null;
  /** Fixed: how long it was failing, in minutes. */
  minutes: number | null;
  /** What happened, when it isn't a check failing twice in a row (visitor outcomes, stabilization S0). */
  what?: string;
}

/**
 * What changed, from each check's newest results (newest first). Pure.
 *  - problem: the newest two failed and the one before them didn't (so a long outage sends one message);
 *  - fixed: the newest passed (or was slow) after at least two failures in a row.
 * Skipped results are ignored.
 */
export function transitions(byCheck: ReadonlyMap<string, readonly Pick<CheckResult, "status" | "at" | "detail">[]>) {
  const found: Transition[] = [];
  for (const [check, all] of byCheck) {
    const results = all.filter((r) => r.status !== "skipped");
    const [a, b, c] = results;
    if (!a || !b) continue;
    if (a.status === "fail" && b.status === "fail" && c?.status !== "fail") {
      found.push({ check, kind: "problem", detail: a.detail, minutes: null });
    } else if (a.status !== "fail" && b.status === "fail" && c?.status === "fail") {
      // The failing streak started at the oldest consecutive failure.
      let start = b;
      for (const r of results.slice(1)) {
        if (r.status !== "fail") break;
        start = r;
      }
      found.push({
        check,
        kind: "fixed",
        detail: null,
        minutes: Math.round((a.at.getTime() - start.at.getTime()) / 60_000),
      });
    }
  }
  return found;
}

/** The message text (Telegram HTML, every value escaped). Pure. */
export function transitionMessage(t: Transition, label: string, site: URL, now: Date): string {
  const time = `${now.toISOString().slice(11, 16)} UTC`;
  const link = isPublicSite(site) ? `\n${escapeHtml(new URL("/en/admin", site).toString())}` : "";
  if (t.kind === "problem")
    return (
      `<b>CRYPY Alerts</b>\n<b>Problem:</b> ${escapeHtml(label)} ${escapeHtml(t.what ?? "has failed twice in a row.")}` +
      (t.detail ? `\nReason: ${escapeHtml(redactKeys(t.detail).slice(0, 200))}` : "") +
      `\n${time} · open the admin dashboard${link}`
    );
  return `<b>CRYPY Alerts</b>\n<b>Fixed:</b> ${escapeHtml(label)} ${t.what ? "is working again for visitors" : "is passing again"} after ${t.minutes ?? 0} minutes.\n${time}`;
}

/** Telegram chats linked to admin wallets. */
export async function adminChats(): Promise<string[]> {
  const ids = adminAccountIds();
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db
    .selectDistinct({ chat: users.telegramChatId })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(and(inArray(accounts.accountId, ids), isNotNull(users.telegramChatId)));
  return rows.map((r) => r.chat!).filter(Boolean);
}

/** Sends the messages for this round's transitions. Never throws (a failed send is logged with keys removed). */
export async function notifyAdmins(found: readonly Transition[], labelFor: (check: string) => string): Promise<number> {
  if (!found.length || !telegramConfigured()) return 0;
  let sent = 0;
  try {
    const chats = await adminChats();
    const now = new Date();
    for (const t of found)
      for (const chat of chats) {
        await sendTelegramMessage(chat, transitionMessage(t, labelFor(t.check), siteUrl, now));
        sent += 1;
      }
  } catch (error) {
    console.warn(`[crypy] health: admin message not sent: ${redactKeys((error as Error)?.message ?? "failed")}`);
  }
  return sent;
}
