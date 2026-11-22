import type { NextRequest } from "next/server";
import { watchItemInput } from "@/lib/watchlist/rules";
import { currentUser, sameOrigin } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { addWatchItem, listWatchItems } from "@/server/services/watchlist";

/** GET /api/v1/watchlist — the signed-in person's watched addresses and tokens. */
export async function GET(request: NextRequest) {
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    return ok({ items: await listWatchItems(user.userId) }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}

/** POST /api/v1/watchlist — watch an address (every chain) or a token (one chain). Up to 10 items. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = watchItemInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const result = await addWatchItem(user.userId, user.address, parsed.data);
    if (!result.ok) return result.reason === "chain" ? fail("INVALID_INPUT") : fail("CONFLICT");
    return ok({ item: result.item }, { sources: [] }, { status: 201 });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
