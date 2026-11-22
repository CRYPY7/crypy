import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { serverEnv } from "@/server/env";
import { schema } from "./schema";

/**
 * The database connection, opened on first use and shared by the whole server process.
 *
 *  - DATABASE_URL set (production VPS): PostgreSQL through node-postgres.
 *  - Not set (the owner's PC, tests): PGlite, a PostgreSQL that runs inside Node and keeps its files in PGLITE_DIR
 *    (default `.data/pglite`). One server process per folder: PGlite doesn't share a folder between processes.
 *
 * Migrations (./drizzle) run once when the connection opens, so a fresh database is ready on first use.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

interface Holder {
  db?: Promise<Db>;
}
const holder = globalThis as typeof globalThis & { __crypyDb?: Holder };

async function open(): Promise<Db> {
  if (serverEnv.DATABASE_URL) {
    const [{ Pool }, { drizzle }, { migrate }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const pool = new Pool({ connectionString: serverEnv.DATABASE_URL, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const dir =
    serverEnv.PGLITE_DIR === "memory"
      ? undefined
      : join(/* turbopackIgnore: true */ process.cwd(), serverEnv.PGLITE_DIR);
  // PGlite creates only the last folder of the path; make sure `.data` (or any parent) exists first.
  if (dir) mkdirSync(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** The shared connection. A failed open is not kept, so the next request tries again. */
export function getDb(): Promise<Db> {
  const h = (holder.__crypyDb ??= {});
  h.db ??= open().catch((error: unknown) => {
    h.db = undefined;
    logOpenFailure(error);
    throw error;
  });
  return h.db;
}

let lastLogged = 0;

/** One line (at most every 30 s) saying why the database didn't open. Connection strings are removed. */
function logOpenFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastLogged < 30_000) return;
  lastLogged = now;
  const e = error as { message?: string; code?: string; stack?: string } | null;
  const clean = (text: string) => text.replace(/postgres(ql)?:\/\/\S+/gi, "postgres://…");
  const where = (e?.stack ?? "")
    .split("\n")
    .slice(1, 4)
    .map((l) => l.trim())
    .join(" | ");
  console.error(
    `[crypy] database didn't open (${serverEnv.DATABASE_URL ? "PostgreSQL" : "PGlite"}): ${clean(String(e?.message ?? error))}` +
      (e?.code ? ` [${e.code}]` : "") +
      (where ? ` at ${clean(where)}` : ""),
  );
}

/** For tests: forget the connection (the next getDb opens a new one). */
export function resetDb(): void {
  holder.__crypyDb = {};
}
