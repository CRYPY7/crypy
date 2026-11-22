import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { currentUser, sameOrigin } from "@/server/auth/request";
import { readBodyText } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import {
  createLinkCode,
  displayLinkCode,
  isTimeZone,
  unlinkTelegramUser,
  updateQuietHours,
  alertSettings,
} from "@/server/services/telegram";
import { getBot, sendTelegramMessage, telegramConfigured } from "@/server/telegram/api";

const body = z.strictObject({ timeZone: z.string().max(64).optional() });

/**
 * POST /api/v1/alerts/telegram — a one-time code (10 minutes) to connect Telegram, with the bot link and its QR code.
 * Also saves the browser's time zone for quiet hours.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const raw = await readBodyText(request, 2_000);
  if (raw === null) return fail("INVALID_INPUT");
  let json: unknown = {};
  try {
    if (raw) json = JSON.parse(raw);
  } catch {
    return fail("INVALID_INPUT");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return fail("INVALID_INPUT");
  if (!telegramConfigured()) return fail("UPSTREAM_UNAVAILABLE");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const bot = await getBot();
    if (!bot.username) return fail("UPSTREAM_UNAVAILABLE");
    const { timeZone } = parsed.data;
    if (timeZone && isTimeZone(timeZone)) {
      const settings = await alertSettings(user.userId);
      if (settings) await updateQuietHours(user.userId, { ...settings.quiet, timeZone });
    }
    const { code, expiresAt } = await createLinkCode(user.userId);
    const link = `https://t.me/${bot.username}?start=${code}`;
    const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return ok(
      {
        code: displayLinkCode(code),
        command: `/start ${code}`,
        link,
        qr,
        bot: bot.username,
        expiresAt: expiresAt.toISOString(),
      },
      { sources: [] },
    );
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}

/** DELETE /api/v1/alerts/telegram — "Disconnect Telegram". The chat gets one last message saying so. */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const chatId = await unlinkTelegramUser(user.userId);
    if (chatId && telegramConfigured())
      await sendTelegramMessage(chatId, "Disconnected from CRYPY. You won't get alerts here any more.").catch(
        () => undefined,
      );
    return ok({ disconnected: true }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
