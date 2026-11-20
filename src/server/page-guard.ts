import "server-only";
import { connection } from "next/server";
import { headers } from "next/headers";
import { clientKey, pageLimiter } from "./rate-limit";

/** Rate-limits pages that call blockchain providers, so crawlers and bots can't drain free quotas. */
export async function pageRequestAllowed(): Promise<boolean> {
  // The limiter reads the clock, so this must run per request, never during prerendering.
  await connection();
  return pageLimiter(clientKey(await headers())).allowed;
}
