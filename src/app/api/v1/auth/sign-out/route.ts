import type { NextRequest } from "next/server";
import { clearedSessionCookie, sameOrigin, sessionToken } from "@/server/auth/request";
import { signOut } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";

/** POST /api/v1/auth/sign-out — ends this session and clears the cookie. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  try {
    await signOut(sessionToken(request));
  } catch {
    // The cookie is cleared either way.
  }
  return ok({ signedOut: true }, { sources: [] }, { headers: { "Set-Cookie": clearedSessionCookie(request) } });
}
