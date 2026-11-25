import "server-only";
import { connection } from "next/server";
import { headers } from "next/headers";
import { isCrawler } from "@/lib/crawler";
import { clientKey, pageLimiter } from "./rate-limit";

export type PageAccess = "ok" | "limited" | "crawler";

/**
 * For pages that call blockchain providers: known crawlers get no lookups at all (S3, B-021 follow-up), and every
 * visitor is rate-limited, so bots can't drain the free quotas.
 */
export async function pageAccess(): Promise<PageAccess> {
  // The limiter reads the clock, so this must run per request, never during prerendering.
  await connection();
  const list = await headers();
  if (isCrawler(list.get("user-agent"))) return "crawler";
  return pageLimiter(clientKey(list)).allowed ? "ok" : "limited";
}
