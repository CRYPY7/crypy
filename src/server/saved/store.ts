import "server-only";
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { savedResults } from "@/server/db/schema";

/**
 * Last good results (stabilization S2). When a fresh read of a chain fails, its last full reading is shown instead,
 * with its age, for at most `MAX_AGE_MS` of its kind. Saving and reading are best-effort: a database problem never
 * slows or breaks a page (reads give up after `READ_TIMEOUT_MS`, failed saves are dropped).
 *
 * Privacy (owner decision 2026-11-24): wallet results are deleted 7 days after the wallet was last looked up. Only the
 * public subject (address or token), the chain and the result are stored: never an IP address or visitor id.
 */
export type SavedKind =
  | "balances"
  | "activity"
  | "approvals"
  | "token-security"
  | "gas"
  | "transaction"
  | "goplus-token"
  | "goplus-approvals"
  /** R2: which chains a wallet holds tokens on (one row per wallet, chain "*"). */
  | "wallet-chains";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How old a saved result may be when it is shown. Safety data (approvals, token security) and gas stay short. */
export const MAX_AGE_MS: Record<SavedKind, number> = {
  balances: 7 * DAY,
  activity: 7 * DAY,
  approvals: 6 * HOUR,
  "token-security": 6 * HOUR,
  gas: 10 * 60_000,
  /** Only confirmed transactions are saved, and those don't change (only the confirmation count grows). */
  transaction: 7 * DAY,
  /** GoPlus answers (S3, B-005): reused for an hour (approvals 5 minutes); kept a day as a fallback when GoPlus is down. */
  "goplus-token": DAY,
  "goplus-approvals": DAY,
  /** Shown while a fresh discovery runs in the background; see server/wallet/activity-map.ts. */
  "wallet-chains": 30 * DAY,
};

/** Deleted this long after the subject was last looked up. */
export const KEEP_MS = 7 * DAY;
/** The activity map is tiny (~100 B per wallet) and kept longer (INFRASTRUCTURE_DESIGN.md §7). */
export const KEEP_WALLET_CHAINS_MS = 30 * DAY;
/** A result larger than this isn't saved (very big wallets): the page then says what couldn't be read, as before. */
export const MAX_BYTES = 512 * 1024;
const READ_TIMEOUT_MS = 1_500;
const TOUCH_MS = 3_600_000;

export interface Saved<T> {
  data: T;
  /** When this result was read (ISO time). */
  savedAt: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms).unref?.()),
  ]);
}

/**
 * Saves readings, one per chain: `quality` 2 = complete (the default), 1 = usable but incomplete. A complete reading is
 * never replaced by an incomplete one unless it is over a day old. Never throws.
 */
export async function saveResults(
  kind: SavedKind,
  subject: string,
  entries: readonly { chain: string; data: unknown; at?: number; quality?: 1 | 2 }[],
): Promise<void> {
  const rows = entries.flatMap((entry) => {
    const json = JSON.stringify(entry.data);
    if (json === undefined || json.length > MAX_BYTES) return [];
    const at = new Date(entry.at ?? Date.now());
    return [
      {
        kind,
        subject: subject.toLowerCase(),
        chain: entry.chain,
        data: entry.data,
        quality: entry.quality ?? 2,
        savedAt: at,
        usedAt: new Date(),
      },
    ];
  });
  if (rows.length === 0) return;
  try {
    const db = await getDb();
    await db
      .insert(savedResults)
      .values(rows)
      .onConflictDoUpdate({
        target: [savedResults.kind, savedResults.subject, savedResults.chain],
        set: {
          data: sql`excluded.data`,
          quality: sql`excluded.quality`,
          savedAt: sql`excluded.saved_at`,
          usedAt: sql`excluded.used_at`,
        },
        // A complete reading is never replaced by an incomplete one, unless it is over a day old.
        setWhere: sql`excluded.quality >= ${savedResults.quality} or ${savedResults.savedAt} < excluded.saved_at - interval '1 day'`,
      });
  } catch {
    // Best-effort: the fresh answer is still shown.
  }
}

/** Saved results for these chains that are young enough to show, by chain. Marks them as looked up. */
export async function readSaved<T>(
  kind: SavedKind,
  subject: string,
  chains: readonly string[],
  now = Date.now(),
): Promise<Map<string, Saved<T>>> {
  const out = new Map<string, Saved<T>>();
  if (chains.length === 0) return out;
  const key = subject.toLowerCase();
  const rows = await withTimeout(
    (async () => {
      const db = await getDb();
      return db
        .select()
        .from(savedResults)
        .where(
          and(eq(savedResults.kind, kind), eq(savedResults.subject, key), inArray(savedResults.chain, [...chains])),
        );
    })(),
    READ_TIMEOUT_MS,
    [],
  );
  const touch: string[] = [];
  for (const row of rows) {
    if (now - row.savedAt.getTime() > MAX_AGE_MS[kind]) continue;
    out.set(row.chain, { data: row.data as T, savedAt: row.savedAt.toISOString() });
    // "Looked up" only decides deletion after days: written at most hourly, not on every read.
    if (!row.usedAt || now - row.usedAt.getTime() > TOUCH_MS) touch.push(row.chain);
  }
  if (touch.length > 0) {
    void (async () => {
      try {
        const db = await getDb();
        await db
          .update(savedResults)
          .set({ usedAt: new Date(now) })
          .where(and(eq(savedResults.kind, kind), eq(savedResults.subject, key), inArray(savedResults.chain, touch)));
      } catch {
        // Best-effort.
      }
    })();
  }
  return out;
}

/** One chain's saved result, or undefined. */
export async function readSavedOne<T>(
  kind: SavedKind,
  subject: string,
  chain: string,
  now = Date.now(),
): Promise<Saved<T> | undefined> {
  return (await readSaved<T>(kind, subject, [chain], now)).get(chain);
}

/** Deletes results not looked up for 7 days (the activity map: 30 days); run with the hourly housekeeping. */
export async function pruneSaved(now = Date.now()): Promise<void> {
  const db = await getDb();
  await db
    .delete(savedResults)
    .where(and(ne(savedResults.kind, "wallet-chains"), lt(savedResults.usedAt, new Date(now - KEEP_MS))));
  await db
    .delete(savedResults)
    .where(and(eq(savedResults.kind, "wallet-chains"), lt(savedResults.usedAt, new Date(now - KEEP_WALLET_CHAINS_MS))));
}
