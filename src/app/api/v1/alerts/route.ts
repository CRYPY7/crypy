import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth/request";
import { checkerStatus } from "@/server/alerts/checker";
import { listAlerts } from "@/server/alerts/store";
import { serverEnv } from "@/server/env";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { alertSettings } from "@/server/services/telegram";
import { getBot, telegramConfigured } from "@/server/telegram/api";

/**
 * GET /api/v1/alerts — where alerts go (Telegram, quiet hours) and the alert history, newest first.
 * `?before=<ISO time>` returns the next older page only.
 */
export async function GET(request: NextRequest) {
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const beforeText = request.nextUrl.searchParams.get("before");
  const before = beforeText ? new Date(beforeText) : undefined;
  if (before && Number.isNaN(before.getTime())) return fail("INVALID_INPUT");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const alerts = await listAlerts(user.userId, before);
    if (before) return ok({ alerts }, { sources: [] });
    const settings = await alertSettings(user.userId);
    if (!settings) return fail("UNAUTHORIZED");
    const bot = telegramConfigured() ? await getBot().catch(() => null) : null;
    return ok(
      {
        settings,
        alerts,
        bot: { available: Boolean(bot?.username), username: bot?.username ?? null },
        // Which chains the checker could search in its last round (the page names any it couldn't).
        checker: { running: serverEnv.CRYPY_WORKER === "on", chains: checkerStatus() },
      },
      { sources: [] },
    );
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
