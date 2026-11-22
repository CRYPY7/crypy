import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth/request";
import { fail, ok } from "@/server/http/response";

/** GET /api/v1/auth/session — who is signed in on this browser (wallet address only), or null. */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request);
    return ok({ address: user?.address ?? null }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
