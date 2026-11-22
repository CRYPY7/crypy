import type { NextRequest } from "next/server";
import { z } from "zod";
import { sameOrigin, sessionCookie } from "@/server/auth/request";
import { signIn } from "@/server/auth/session";
import { readBodyJson } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { authLimiter, clientKey } from "@/server/rate-limit";

const body = z.strictObject({ message: z.string().max(2_000), signature: z.string().max(40_000) });

/**
 * POST /api/v1/auth/sign-in — checks a signed sign-in message and sets the session cookie. The message must name this
 * site and page (so a message signed on a look-alike site can't be used here), use an unused one-time code, and carry
 * a valid signature from the address it names. Nothing about the visitor is stored except the wallet address.
 */
export async function POST(request: NextRequest) {
  const site = sameOrigin(request);
  if (!site.ok) return fail("FORBIDDEN");
  const limit = authLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = body.safeParse(await readBodyJson(request, 48_000));
  if (!parsed.success) return fail("INVALID_INPUT");
  try {
    const result = await signIn({ ...parsed.data, domain: site.host, origin: site.origin });
    if (!result.ok) return fail("UNAUTHORIZED");
    return ok(
      { address: result.address, expiresAt: result.expiresAt.toISOString() },
      { sources: [] },
      { headers: { "Set-Cookie": sessionCookie(request, result.token) } },
    );
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
