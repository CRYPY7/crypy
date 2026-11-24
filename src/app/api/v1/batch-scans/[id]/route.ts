import { type NextRequest } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/server/auth/request";
import { scanManager } from "@/server/batch-scan/service";
import { readBodyJson } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { clientKey, scanPollLimiter } from "@/server/rate-limit";

type Params = { params: Promise<{ id: string }> };
const isId = (id: string) => /^[0-9a-f]{32}$/.test(id);
const action = z.object({ action: z.enum(["pause", "resume", "cancel"]) });

/** GET /api/v1/batch-scans/{id}?since=N — progress per chain and the rows read since N. The id is the only key. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isId(id)) return fail("INVALID_INPUT");
  const limit = scanPollLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const since = Number(request.nextUrl.searchParams.get("since") ?? "0");
  if (!Number.isInteger(since) || since < 0) return fail("INVALID_INPUT");
  const view = scanManager().view(id, since);
  if (!view) return fail("NOT_FOUND");
  return ok(view, { sources: ["rpc"] });
}

/** POST /api/v1/batch-scans/{id} — pause, resume or cancel. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const { id } = await params;
  if (!isId(id)) return fail("INVALID_INPUT");
  const limit = scanPollLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = action.safeParse(await readBodyJson(request, 1_000));
  if (!parsed.success) return fail("INVALID_INPUT");
  if (!scanManager().control(id, parsed.data.action)) return fail("NOT_FOUND");
  return ok({ done: true }, { sources: [] });
}
