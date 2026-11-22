import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { parsePortfolio, serializePortfolio } from "@/lib/portfolio/storage";
import { currentUser, sameOrigin } from "@/server/auth/request";
import { getDb } from "@/server/db/client";
import { portfolios } from "@/server/db/schema";
import { readBodyText } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { accountLimiter, clientKey } from "@/server/rate-limit";

/**
 * The Portfolio kept on the account (optional, board 36: "keep it on all your devices"). Same format and checks as the
 * browser copy: public addresses and labels only, at most 20 wallets.
 */
const MAX_BODY = 16_000;

export async function GET(request: NextRequest) {
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const db = await getDb();
    const [row] = await db.select().from(portfolios).where(eq(portfolios.userId, user.userId));
    return ok(
      {
        portfolio: row ? parsePortfolio(JSON.stringify(row.data)) : null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      },
      { sources: [] },
    );
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}

/** PUT /api/v1/portfolio — save (turns syncing on). Body: the portfolio as the browser stores it. */
export async function PUT(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const limit = accountLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const text = await readBodyText(request, MAX_BODY);
  if (!text || text.length > MAX_BODY) return fail("INVALID_INPUT");
  const portfolio = parsePortfolio(text);
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const db = await getDb();
    const data = JSON.parse(serializePortfolio(portfolio)) as Record<string, unknown>;
    const now = new Date();
    await db
      .insert(portfolios)
      .values({ userId: user.userId, data, updatedAt: now })
      .onConflictDoUpdate({ target: portfolios.userId, set: { data, updatedAt: now } });
    return ok({ portfolio, updatedAt: now.toISOString() }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}

/** DELETE /api/v1/portfolio — stop keeping it on the account (the copy in this browser stays). */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  try {
    const user = await currentUser(request);
    if (!user) return fail("UNAUTHORIZED");
    const db = await getDb();
    await db.delete(portfolios).where(eq(portfolios.userId, user.userId));
    return ok({ removed: true }, { sources: [] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
