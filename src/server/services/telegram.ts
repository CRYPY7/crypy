import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { telegramLinkCodes, users } from "@/server/db/schema";

/**
 * Linking a Telegram chat to an account (approved board 40, step 3). The page shows a short code; the person sends it
 * to the bot with /start (one tap through the link or the QR code). The code is single-use, valid 10 minutes, and only
 * its hash is stored.
 */
export const LINK_CODE_TTL_MS = 10 * 60_000;
// No 0/O, 1/I/L: easy to read and type.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** "K7Q29XPM" → "K7Q2-9XPM" for reading; accepts either form (and lower case, spaces) back. */
export function normalizeLinkCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[2-9A-HJKMNP-Z]{8}$/.test(code) ? code : null;
}

export function displayLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createLinkCode(userId: string, now = new Date(), db?: Db) {
  const database = db ?? (await getDb());
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  // One live code per person: a new one replaces the old.
  await database.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
  await database.insert(telegramLinkCodes).values({ codeHash: hash(code), userId, expiresAt });
  return { code, expiresAt };
}

export type LinkResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

/** Called by the bot for "/start CODE". The code is deleted on use; the chat moves if it was linked elsewhere. */
export async function linkTelegramChat(
  input: string,
  chatId: string,
  username: string | null,
  now = new Date(),
  db?: Db,
): Promise<LinkResult> {
  const code = normalizeLinkCode(input);
  if (!code) return { ok: false, reason: "invalid" };
  const database = db ?? (await getDb());
  const [row] = await database
    .delete(telegramLinkCodes)
    .where(eq(telegramLinkCodes.codeHash, hash(code)))
    .returning();
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  await database.transaction(async (tx) => {
    // One chat receives one account's alerts: linking it here unlinks it from any other account.
    await tx
      .update(users)
      .set({ telegramChatId: null, telegramUsername: null, telegramLinkedAt: null })
      .where(eq(users.telegramChatId, chatId));
    await tx
      .update(users)
      .set({ telegramChatId: chatId, telegramUsername: username, telegramLinkedAt: now })
      .where(eq(users.id, row.userId));
  });
  return { ok: true, userId: row.userId };
}

/** /stop in Telegram, the person blocking the bot, or "Disconnect Telegram" on the page. */
export async function unlinkTelegramChat(chatId: string, db?: Db): Promise<boolean> {
  const database = db ?? (await getDb());
  const rows = await database
    .update(users)
    .set({ telegramChatId: null, telegramUsername: null, telegramLinkedAt: null })
    .where(eq(users.telegramChatId, chatId))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function unlinkTelegramUser(userId: string, db?: Db): Promise<string | null> {
  const database = db ?? (await getDb());
  const [before] = await database.select({ chat: users.telegramChatId }).from(users).where(eq(users.id, userId));
  await database
    .update(users)
    .set({ telegramChatId: null, telegramUsername: null, telegramLinkedAt: null })
    .where(eq(users.id, userId));
  await database.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
  return before?.chat ?? null;
}

export async function userByChat(chatId: string, db?: Db) {
  const database = db ?? (await getDb());
  const [user] = await database.select().from(users).where(eq(users.telegramChatId, chatId));
  return user ?? null;
}

export interface AlertSettings {
  telegram: { connected: boolean; username: string | null; linkedAt: string | null };
  /** A link code is waiting to be used (the page keeps checking). */
  pendingCode: boolean;
  quiet: { on: boolean; start: number; end: number; timeZone: string };
}

export async function alertSettings(userId: string, now = new Date(), db?: Db): Promise<AlertSettings | null> {
  const database = db ?? (await getDb());
  const [user] = await database.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const pending = await database
    .select({ c: telegramLinkCodes.codeHash })
    .from(telegramLinkCodes)
    .where(and(eq(telegramLinkCodes.userId, userId), gt(telegramLinkCodes.expiresAt, now)));
  return {
    telegram: {
      connected: Boolean(user.telegramChatId),
      username: user.telegramUsername,
      linkedAt: user.telegramLinkedAt?.toISOString() ?? null,
    },
    pendingCode: pending.length > 0,
    quiet: { on: user.quietOn, start: user.quietStart, end: user.quietEnd, timeZone: user.timeZone },
  };
}

export function isTimeZone(value: string): boolean {
  if (value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function updateQuietHours(
  userId: string,
  quiet: { on: boolean; start: number; end: number; timeZone: string },
  db?: Db,
): Promise<void> {
  const database = db ?? (await getDb());
  await database
    .update(users)
    .set({ quietOn: quiet.on, quietStart: quiet.start, quietEnd: quiet.end, timeZone: quiet.timeZone })
    .where(eq(users.id, userId));
}

/** Removes link codes that ran out (hourly housekeeping). */
export async function pruneLinkCodes(now = new Date(), db?: Db): Promise<void> {
  const database = db ?? (await getDb());
  await database.delete(telegramLinkCodes).where(lt(telegramLinkCodes.expiresAt, now));
}
