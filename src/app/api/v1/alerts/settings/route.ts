import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, sameOrigin } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { isTimeZone, updateQuietHours } from "@/server/services/telegram";

const minutes = z.number().int().min(0).max(1439);
const body = z.strictObject({
  quiet: z.strictObject({ on: z.boolean(), start: minutes, end: minutes, timeZone: z.string().max(64) }),
});

/** PATCH /api/v1/alerts/settings — quiet hours (alerts wait until they end) in the person's time zone. */
export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isTimeZone(parsed.data.quiet.timeZone)) return fail("INVALID_INPUT");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    await updateQuietHours(user.userId, parsed.data.quiet);
    return ok({ quiet: parsed.data.quiet }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
