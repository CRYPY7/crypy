import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { tokens } from "@/server/db/schema";

/**
 * Shared token registry (INFRASTRUCTURE_DESIGN.md §5.3, step R1). A token's name, symbol and decimals are read once
 * and reused by every visitor and every tool: memory first, then the database, then (only for what neither knows) the
 * chain itself through the caller's reader. A contract whose details can't be read (usually spam) is remembered as
 * unreadable for UNREADABLE_RETRY_MS, so it isn't asked about on every visit. Family-neutral: the caller supplies the
 * chain-specific reader.
 */
/** What the registry knows about a token (its contract's own name, symbol and decimals). */
export interface TokenDetails {
  name: string;
  symbol: string;
  decimals: number;
}

export const UNREADABLE_RETRY_MS = 24 * 3_600_000;
export const KEEP_MS = 90 * 24 * 3_600_000;
/** Database reads give up after this; the chain is asked instead (a slow database never slows a page much). */
const DB_TIMEOUT_MS = 800;
const MEMORY_MAX = 50_000;
/** `used_at` is written at most once a day per token. */
const TOUCH_EVERY_MS = 24 * 3_600_000;

export type TokenSource = "contract" | "alchemy";
/** Reads details from the chain; returns null for a token whose details couldn't be read. */
export type DetailsReader = (addresses: string[]) => Promise<Map<string, TokenDetails | null>>;

interface Entry {
  info: TokenDetails | null;
  /** When the details were read (for unreadable ones: when to ask again). */
  at: number;
  touchedAt: number;
}

const memory: Map<string, Entry> = ((
  globalThis as { __crypyTokenRegistry?: Map<string, Entry> }
).__crypyTokenRegistry ??= new Map());

const keyOf = (chain: string, address: string) => `${chain}:${address.toLowerCase()}`;

function remember(key: string, entry: Entry) {
  if (memory.size >= MEMORY_MAX) {
    // Drop the oldest tenth (a Map keeps insertion order).
    let n = MEMORY_MAX / 10;
    for (const k of memory.keys()) {
      memory.delete(k);
      if (--n <= 0) break;
    }
  }
  memory.delete(key);
  memory.set(key, entry);
}

/** An entry that can be used as it is: readable, or unreadable and asked recently enough. */
const usable = (entry: Entry | undefined, now: number): entry is Entry =>
  entry !== undefined && (entry.info !== null || now - entry.at < UNREADABLE_RETRY_MS);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms).unref?.()),
  ]);
}

async function readRows(chain: string, addresses: string[]) {
  const db = await getDb();
  return db
    .select({
      address: tokens.address,
      name: tokens.name,
      symbol: tokens.symbol,
      decimals: tokens.decimals,
      unreadable: tokens.unreadable,
      detailsAt: tokens.detailsAt,
      usedAt: tokens.usedAt,
    })
    .from(tokens)
    .where(and(eq(tokens.chain, chain), inArray(tokens.address, addresses)));
}

/** Stores newly read details (best-effort: a failed write only means the token is read again next time). */
async function store(
  chain: string,
  found: Map<string, { info: TokenDetails | null; source: TokenSource }>,
  now: number,
) {
  if (found.size === 0) return;
  const at = new Date(now);
  const rows = [...found].map(([address, { info, source }]) => ({
    chain,
    address,
    name: info?.name ?? null,
    symbol: info?.symbol ?? null,
    decimals: info?.decimals ?? null,
    unreadable: info === null,
    source,
    detailsAt: at,
    usedAt: at,
  }));
  try {
    const db = await getDb();
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(tokens)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [tokens.chain, tokens.address],
          set: {
            name: sql`excluded.name`,
            symbol: sql`excluded.symbol`,
            decimals: sql`excluded.decimals`,
            unreadable: sql`excluded.unreadable`,
            source: sql`excluded.source`,
            detailsAt: sql`excluded.details_at`,
            usedAt: sql`excluded.used_at`,
          },
          // Readable details are never replaced by "unreadable" (a node failing once doesn't erase what we know).
          setWhere: sql`excluded.unreadable = false or ${tokens.unreadable} = true`,
        });
    }
  } catch {
    // Best-effort.
  }
}

async function touch(chain: string, addresses: string[], now: number) {
  if (addresses.length === 0) return;
  try {
    const db = await getDb();
    await db
      .update(tokens)
      .set({ usedAt: new Date(now) })
      .where(and(eq(tokens.chain, chain), inArray(tokens.address, addresses)));
  } catch {
    // Best-effort: at worst a token in use is deleted after 90 days and read again.
  }
}

/**
 * Details for these tokens on one chain, keyed by lower-case address; null = the contract's details couldn't be read.
 * `given`: details already known from elsewhere (Alchemy's token metadata), stored as they are. `read`: the chain
 * reader, asked only for tokens neither memory nor the database knows.
 */
export async function tokenDetails(
  chain: string,
  addresses: readonly string[],
  read: DetailsReader,
  given?: ReadonlyMap<string, TokenDetails>,
  now = Date.now(),
): Promise<Map<string, TokenDetails | null>> {
  const out = new Map<string, TokenDetails | null>();
  const wanted = [...new Set(addresses.map((a) => a.toLowerCase()))];
  let missing: string[] = [];
  const toTouch: string[] = [];
  for (const address of wanted) {
    const entry = memory.get(keyOf(chain, address));
    if (usable(entry, now)) {
      out.set(address, entry.info);
      if (now - entry.touchedAt > TOUCH_EVERY_MS) {
        entry.touchedAt = now;
        toTouch.push(address);
      }
    } else missing.push(address);
  }

  if (missing.length) {
    const rows = await withTimeout(readRows(chain, missing), DB_TIMEOUT_MS, []);
    for (const row of rows) {
      const info =
        !row.unreadable && row.symbol !== null && row.decimals !== null
          ? { name: row.name ?? "", symbol: row.symbol, decimals: row.decimals }
          : null;
      const entry: Entry = { info, at: row.detailsAt.getTime(), touchedAt: row.usedAt.getTime() };
      if (!usable(entry, now)) continue; // unreadable long enough ago: ask the chain again
      remember(keyOf(chain, row.address), entry);
      out.set(row.address, info);
      if (now - entry.touchedAt > TOUCH_EVERY_MS) {
        entry.touchedAt = now;
        toTouch.push(row.address);
      }
    }
    missing = missing.filter((a) => !out.has(a));
  }

  const found = new Map<string, { info: TokenDetails | null; source: TokenSource }>();
  if (given && missing.length) {
    const lowerGiven = new Map([...given].map(([a, info]) => [a.toLowerCase(), info]));
    missing = missing.filter((address) => {
      const info = lowerGiven.get(address);
      if (!info) return true;
      found.set(address, { info, source: "alchemy" });
      return false;
    });
  }
  if (missing.length) {
    let readMap = new Map<string, TokenDetails | null>();
    try {
      readMap = new Map([...(await read(missing))].map(([a, info]) => [a.toLowerCase(), info]));
    } catch {
      // A failed read isn't stored as "unreadable": it is asked again next time.
    }
    for (const address of missing) {
      if (readMap.has(address)) found.set(address, { info: readMap.get(address) ?? null, source: "contract" });
    }
  }
  for (const [address, { info }] of found) {
    out.set(address, info);
    remember(keyOf(chain, address), { info, at: now, touchedAt: now });
  }
  void store(chain, found, now);
  void touch(chain, toTouch, now);
  return out;
}

/** Hourly housekeeping: tokens nobody looked at for 90 days. */
export async function pruneTokens(now = Date.now()): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(tokens).where(lt(tokens.usedAt, new Date(now - KEEP_MS)));
  } catch {
    // Next hour.
  }
}

/** Tests only. */
export function resetTokenMemory() {
  memory.clear();
}
