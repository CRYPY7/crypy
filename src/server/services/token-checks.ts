import "server-only";
import { asc, eq } from "drizzle-orm";
import { allCuratedTokens, type CuratedToken } from "@/config/seo-pages";
import type { SecurityReport } from "@/lib/security/types";
import { getDb } from "@/server/db/client";
import { tokenChecks } from "@/server/db/schema";
import { tokenSecurityReport } from "./lookups";

/**
 * Daily token security checks for the curated token pages (SEO Phase 3). The background worker re-runs a few checks
 * every 10 minutes, oldest first, so every curated token is checked about once a day without bursts against the free
 * providers. Pages only read what was saved, so crawlers and visitors never start a check.
 */

/** A check older than this is due again. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
/** Checks per worker round (every 10 minutes): 50 tokens are covered in under 2 hours on a fresh server. */
export const CHECKS_PER_ROUND = 4;

export interface SavedCheck {
  chain: string;
  slug: string;
  report: SecurityReport;
  checkedAt: Date;
}

export const checkId = (chain: string, address: string) => `${chain}:${address.toLowerCase()}`;

/**
 * Which curated tokens to check next: never checked first, then the oldest checks that are due. Pure, so the order
 * is unit-tested.
 */
export function dueTokens(
  tokens: readonly (CuratedToken & { chain: string })[],
  saved: ReadonlyMap<string, Date>,
  now: number,
  limit: number,
): (CuratedToken & { chain: string })[] {
  return tokens
    .map((token) => ({ token, at: saved.get(checkId(token.chain, token.address))?.getTime() ?? null }))
    .filter(({ at }) => at === null || now - at >= CHECK_EVERY_MS)
    .sort((a, b) => (a.at ?? -Infinity) - (b.at ?? -Infinity))
    .slice(0, limit)
    .map(({ token }) => token);
}

export async function saveCheck(chain: string, token: CuratedToken, report: SecurityReport, at = new Date()) {
  const db = await getDb();
  const row = { id: checkId(chain, token.address), chain, slug: token.slug, report, checkedAt: at };
  await db
    .insert(tokenChecks)
    .values(row)
    .onConflictDoUpdate({ target: tokenChecks.id, set: { report, checkedAt: at, slug: token.slug } });
}

/** One round of the worker: checks up to `limit` due tokens one after another; failures are retried next round. */
export async function runDueTokenChecks(limit = CHECKS_PER_ROUND): Promise<{ checked: number; failed: string[] }> {
  const db = await getDb();
  const rows = await db.select({ id: tokenChecks.id, checkedAt: tokenChecks.checkedAt }).from(tokenChecks);
  const saved = new Map(rows.map((row) => [row.id, row.checkedAt]));
  const due = dueTokens(allCuratedTokens(), saved, Date.now(), limit);
  let checked = 0;
  const failed: string[] = [];
  for (const token of due) {
    try {
      // Background priority: page visitors always go first for the shared GoPlus allowance.
      const report = await tokenSecurityReport(token.chain, token.address, "background");
      if (!report) throw new Error("no report");
      await saveCheck(token.chain, token, report);
      checked += 1;
    } catch {
      failed.push(`${token.chain}/${token.slug}`);
    }
  }
  return { checked, failed };
}

export async function savedCheck(chain: string, address: string): Promise<SavedCheck | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(tokenChecks)
    .where(eq(tokenChecks.id, checkId(chain, address)))
    .limit(1);
  return row
    ? { chain: row.chain, slug: row.slug, report: row.report as SecurityReport, checkedAt: row.checkedAt }
    : null;
}

export async function allSavedChecks(): Promise<SavedCheck[]> {
  const db = await getDb();
  const rows = await db.select().from(tokenChecks).orderBy(asc(tokenChecks.chain), asc(tokenChecks.slug));
  return rows.map((row) => ({
    chain: row.chain,
    slug: row.slug,
    report: row.report as SecurityReport,
    checkedAt: row.checkedAt,
  }));
}
