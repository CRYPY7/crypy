import type { NextRequest } from "next/server";
import { watchItemPatch } from "@/lib/watchlist/rules";
import { currentUser, sameOrigin } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { removeWatchItem, updateWatchItem } from "@/server/services/watchlist";

const isId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
type Params = { params: Promise<{ id: string }> };

/** PATCH /api/v1/watchlist/{id} — rename an item or change its alert choices. */
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const { id } = await params;
  if (!isId(id)) return fail("INVALID_INPUT");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = watchItemPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const item = await updateWatchItem(user.userId, id, parsed.data);
    if (item === "invalid") return fail("INVALID_INPUT");
    if (!item) return fail("NOT_FOUND");
    return ok({ item }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}

/** DELETE /api/v1/watchlist/{id} — stop watching. */
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const { id } = await params;
  if (!isId(id)) return fail("INVALID_INPUT");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    if (!(await removeWatchItem(user.userId, id))) return fail("NOT_FOUND");
    return ok({ removed: true }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
