import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The mode the site uses on the owner's PC: PGlite keeping its files in a folder whose parent doesn't exist yet.
const parent = `.data/test-${process.pid}-${Date.now()}`;
process.env.PGLITE_DIR = `${parent}/pglite`;
const { getDb, resetDb } = await import("@/server/db/client");
const { users } = await import("@/server/db/schema");

describe("database (PGlite in a folder)", () => {
  afterAll(async () => {
    const db = (await getDb()) as unknown as { $client?: { close(): Promise<void> } };
    await db.$client?.close();
    resetDb();
    rmSync(join(process.cwd(), parent), { recursive: true, force: true });
  });

  it("creates missing parent folders, runs the migrations and keeps data on disk", async () => {
    const db = await getDb();
    await db.insert(users).values({});
    expect(await db.select().from(users)).toHaveLength(1);
    expect(existsSync(join(process.cwd(), parent, "pglite", "PG_VERSION"))).toBe(true);
  });
});
