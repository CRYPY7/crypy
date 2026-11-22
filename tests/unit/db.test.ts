import { afterAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { getDb, resetDb } = await import("@/server/db/client");
const { users, accounts, watchItems } = await import("@/server/db/schema");
const { eq } = await import("drizzle-orm");

describe("database (PGlite in memory, real migrations)", () => {
  afterAll(() => resetDb());

  it("runs the migrations and deleting a user deletes everything they own", async () => {
    const db = await getDb();
    const [user] = await db.insert(users).values({}).returning();
    await db.insert(accounts).values({ accountId: "eip155:1:0xabc", userId: user!.id });
    await db.insert(watchItems).values({ userId: user!.id, kind: "address", target: "0xabc", rules: {} });
    await db.delete(users).where(eq(users.id, user!.id));
    expect(await db.select().from(accounts)).toHaveLength(0);
    expect(await db.select().from(watchItems)).toHaveLength(0);
  });
});
