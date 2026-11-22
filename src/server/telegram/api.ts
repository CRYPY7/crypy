import "server-only";
import { serverEnv } from "@/server/env";

/**
 * Minimal Telegram Bot API client (core.telegram.org/bots/api). Server-only: the token never leaves the server and is
 * never logged (errors mention the method, never the URL).
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; from: TelegramUser; message?: TelegramMessage; data?: string };
  my_chat_member?: { chat: TelegramChat; new_chat_member: { status: string } };
}

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

/** Telegram said the person blocked the bot or deleted the chat: stop sending to it. */
export class TelegramBlockedError extends Error {
  constructor() {
    super("The Telegram chat no longer accepts messages from the bot");
    this.name = "TelegramBlockedError";
  }
}

/** Another server is reading this bot's updates (only one may at a time). */
export class TelegramConflictError extends Error {
  constructor() {
    super("Another server is using this Telegram bot token");
    this.name = "TelegramConflictError";
  }
}

export function telegramConfigured(): boolean {
  return Boolean(serverEnv.TELEGRAM_BOT_TOKEN);
}

interface ApiAnswer<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export async function telegramCall<T>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 10_000,
): Promise<T> {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot isn't configured");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${serverEnv.TELEGRAM_API_URL}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const answer = (await response.json().catch(() => ({ ok: false }))) as ApiAnswer<T>;
    if (answer.ok) return answer.result as T;
    const code = answer.error_code ?? response.status;
    // Too many messages: Telegram says how long to wait. Waits once, up to 30 s.
    if (code === 429 && attempt === 0) {
      const wait = Math.min(30, answer.parameters?.retry_after ?? 1);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    if (code === 403) throw new TelegramBlockedError();
    if (code === 409) throw new TelegramConflictError();
    // Telegram's description is safe to log (it never contains the token).
    throw new Error(`Telegram ${method} failed (${code}${answer.description ? `: ${answer.description}` : ""})`);
  }
}

let me: Promise<TelegramUser> | null = null;

/** The bot's own account (its @username for links). Cached; a failure is retried on the next call. */
export function getBot(): Promise<TelegramUser> {
  me ??= telegramCall<TelegramUser>("getMe").catch((error: unknown) => {
    me = null;
    throw error;
  });
  return me;
}

/** Test helper. */
export function resetBotCache(): void {
  me = null;
}

export async function sendTelegramMessage(chatId: string, html: string, buttons: InlineButton[][] = []): Promise<void> {
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}
