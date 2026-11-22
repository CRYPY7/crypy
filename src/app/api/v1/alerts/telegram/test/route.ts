import type { NextRequest } from "next/server";
import { siteUrl } from "@/config/env";
import { telegramTest } from "@/lib/alerts/format";
import { currentUser, sameOrigin } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";
import { authLimiter, clientKey } from "@/server/rate-limit";
import { unlinkTelegramUser, userByChat } from "@/server/services/telegram";
import { TelegramBlockedError, sendTelegramMessage, telegramConfigured } from "@/server/telegram/api";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/** POST /api/v1/alerts/telegram/test — "Send test": one test message to the connected chat. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = authLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  if (!telegramConfigured()) return fail("UPSTREAM_UNAVAILABLE");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const db = await getDb();
    const [row] = await db.select({ chat: users.telegramChatId }).from(users).where(eq(users.id, user.userId));
    if (!row?.chat || !(await userByChat(row.chat, db))) return fail("NOT_FOUND");
    const message = telegramTest(siteUrl);
    try {
      await sendTelegramMessage(row.chat, message.html, message.buttons);
    } catch (error) {
      if (error instanceof TelegramBlockedError) {
        await unlinkTelegramUser(user.userId, db);
        return fail("NOT_FOUND");
      }
      throw error;
    }
    return ok({ sent: true }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
