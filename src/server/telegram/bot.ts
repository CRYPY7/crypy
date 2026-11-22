import "server-only";
import { and, eq } from "drizzle-orm";
import { siteUrl } from "@/config/env";
import { alertLink, escapeHtml } from "@/lib/alerts/format";
import { getDb, type Db } from "@/server/db/client";
import { watchItems } from "@/server/db/schema";
import { createRateLimiter } from "@/server/rate-limit";
import { redactKeys } from "@/server/redact";
import { linkTelegramChat, unlinkTelegramChat, userByChat } from "@/server/services/telegram";
import {
  TelegramConflictError,
  getBot,
  sendTelegramMessage,
  telegramCall,
  telegramConfigured,
  type TelegramUpdate,
} from "./api";

/**
 * The CRYPY alerts bot. It reads its messages by asking Telegram (long polling), so it works on any server without a
 * public web address. It only links chats, mutes items and stops; it never asks for anything (no wallet connection, no
 * signature, no personal data).
 */

const watchPage = () => alertLink(siteUrl, "/tools/watchlist");

const HELP = () =>
  [
    "<b>CRYPY alerts</b>",
    "This bot only sends alerts for your CRYPY watchlist.",
    `To connect: open ${escapeHtml(watchPage())}, sign in with your wallet and press Connect Telegram.`,
    "/stop: stop alerts and disconnect this chat.",
    "CRYPY never asks you to connect a wallet, sign anything or share a seed phrase here.",
  ].join("\n");

type Reply = (chatId: string, html: string) => Promise<void>;

/** Security review (M9): at most 10 "/start CODE" tries per chat in 10 minutes. */
const startAttempts = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const reply: Reply = (chatId, html) => sendTelegramMessage(chatId, html);

/** One incoming update. Exported for tests. */
export async function handleUpdate(update: TelegramUpdate, db?: Db, send: Reply = reply, now = new Date()) {
  const database = db ?? (await getDb());

  // The person blocked the bot or deleted the chat.
  if (update.my_chat_member) {
    const status = update.my_chat_member.new_chat_member.status;
    if (status === "kicked" || status === "left")
      await unlinkTelegramChat(String(update.my_chat_member.chat.id), database);
    return;
  }

  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message ? String(query.message.chat.id) : String(query.from.id);
    const match = /^(mute|unmute):([0-9a-f-]{36})$/.exec(query.data ?? "");
    let text = "This button has expired.";
    if (match) {
      const user = await userByChat(chatId, database);
      if (user) {
        const muted = match[1] === "mute";
        const updated = await database
          .update(watchItems)
          .set({ muted })
          .where(and(eq(watchItems.id, match[2]!), eq(watchItems.userId, user.id)))
          .returning({ id: watchItems.id });
        if (updated.length)
          text = muted ? "Muted. No more alerts for it until you unmute it on CRYPY." : "Alerts are back on for it.";
      }
    }
    await telegramCall("answerCallbackQuery", { callback_query_id: query.id, text }).catch(() => undefined);
    return;
  }

  const message = update.message;
  if (!message?.text || message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  const [command, argument = ""] = message.text.trim().split(/\s+/, 2);

  if (command === "/start" && argument) {
    // Codes can't be guessed in practice (8 characters, 10 minutes), and this keeps it that way.
    if (!startAttempts(chatId, now.getTime()).allowed) {
      await send(chatId, "Too many tries. Wait a few minutes, then use a new code from the Watchlist page.");
      return;
    }
    const result = await linkTelegramChat(argument, chatId, message.from?.username ?? null, now, database);
    if (result.ok) {
      await send(
        chatId,
        [
          "<b>✅ Connected to CRYPY</b>",
          "Alerts for your watchlist will arrive in this chat.",
          "Change what you get, quiet hours or disconnect on the Watchlist page.",
          "CRYPY never asks you to connect a wallet, sign anything or share a seed phrase here.",
        ].join("\n"),
      );
    } else {
      await send(
        chatId,
        result.reason === "expired"
          ? "That code has expired (codes last 10 minutes). Get a new one on the Watchlist page and try again."
          : "That code isn't valid. Get a new one on the Watchlist page and try again.",
      );
    }
    return;
  }
  if (command === "/stop") {
    const was = await unlinkTelegramChat(chatId, database);
    await send(chatId, was ? "Disconnected. You won't get CRYPY alerts here any more." : "This chat isn't connected.");
    return;
  }
  await send(chatId, HELP());
}

// ---- Polling loop ----------------------------------------------------------------------------------------------------

interface BotState {
  running: boolean;
  offset: number;
  conflictLogged: boolean;
}
const stateKey = Symbol.for("crypy.telegramBot");
const store = globalThis as typeof globalThis & { [stateKey]?: BotState };

/** Starts reading the bot's messages (once per server process). Does nothing without a token. */
export function startTelegramBot(): void {
  if (!telegramConfigured()) return;
  const state = (store[stateKey] ??= { running: false, offset: 0, conflictLogged: false });
  if (state.running) return;
  state.running = true;
  void (async () => {
    try {
      const bot = await getBot();
      console.log(`[crypy] Telegram bot @${bot.username} is running`);
    } catch (error) {
      console.warn(`[crypy] Telegram bot couldn't start: ${redactKeys((error as Error).message)}`);
    }
    for (;;) {
      try {
        const updates = await telegramCall<TelegramUpdate[]>(
          "getUpdates",
          { offset: state.offset, timeout: 25, allowed_updates: ["message", "callback_query", "my_chat_member"] },
          35_000,
        );
        for (const update of updates) {
          state.offset = update.update_id + 1;
          await handleUpdate(update).catch((error: unknown) =>
            console.warn(`[crypy] Telegram update not handled: ${redactKeys((error as Error).message)}`),
          );
        }
        state.conflictLogged = false;
      } catch (error) {
        if (error instanceof TelegramConflictError) {
          if (!state.conflictLogged)
            console.warn("[crypy] Another server is reading this Telegram bot's messages; retrying in a minute.");
          state.conflictLogged = true;
          await new Promise((resolve) => setTimeout(resolve, 60_000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
    }
  })();
}
