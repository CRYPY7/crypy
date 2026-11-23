import type { NextRequest } from "next/server";
import { changeUpdateSchema } from "@/lib/health/updates";
import { adminAccessFromRequest } from "@/server/admin/auth";
import { sameOrigin } from "@/server/auth/request";
import { readBodyJson } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";
import { changeUpdateState } from "@/server/services/status-updates";

const isId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
type Params = { params: Promise<{ id: string }> };

/** PATCH /api/v1/admin/status-updates/{id} — change an update's state (for example Ongoing → Fixed). */
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const { id } = await params;
  if (!isId(id)) return fail("INVALID_INPUT");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const access = await adminAccessFromRequest(request);
    if (access.kind === "signed-out") return fail("UNAUTHORIZED");
    if (access.kind !== "admin") return fail("FORBIDDEN");
    const parsed = changeUpdateSchema.safeParse(await readBodyJson(request, 2_000));
    if (!parsed.success) return fail("INVALID_INPUT");
    const update = await changeUpdateState(id, parsed.data.state);
    return update ? ok({ update }, { sources: [] }) : fail("NOT_FOUND");
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
