import type { NextRequest } from "next/server";
import { clearedSessionCookie, currentUser, sameOrigin } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";
import { deleteAccount } from "@/server/services/watchlist";

/** DELETE /api/v1/account — deletes the account and everything stored for it, and signs out. */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    await deleteAccount(user.userId);
    return ok({ deleted: true }, { sources: [] }, { headers: { "Set-Cookie": clearedSessionCookie(request) } });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
