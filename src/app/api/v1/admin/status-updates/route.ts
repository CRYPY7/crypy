import type { NextRequest } from "next/server";
import { newUpdateSchema } from "@/lib/health/updates";
import { adminAccessFromRequest } from "@/server/admin/auth";
import { sameOrigin } from "@/server/auth/request";
import { readBodyJson } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { createUpdate } from "@/server/services/status-updates";

/** POST /api/v1/admin/status-updates — an admin publishes an update on the public status page (M9 Part 5). */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const access = await adminAccessFromRequest(request);
    if (access.kind === "signed-out") return fail("UNAUTHORIZED");
    if (access.kind !== "admin") return fail("FORBIDDEN");
    const parsed = newUpdateSchema.safeParse(await readBodyJson(request, 8_000));
    if (!parsed.success) return fail("INVALID_INPUT");
    return ok({ update: await createUpdate(parsed.data) }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
