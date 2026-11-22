import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth/request";
import { fail } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { exportAccount } from "@/server/services/watchlist";

/** GET /api/v1/account/export — everything CRYPY stores for this account, as a JSON file. */
export async function GET(request: NextRequest) {
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const data = await exportAccount(user.userId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="crypy-my-data.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
