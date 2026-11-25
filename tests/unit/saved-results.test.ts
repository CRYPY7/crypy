import { afterAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { resetDb, getDb } = await import("@/server/db/client");
const { savedResults } = await import("@/server/db/schema");
const store = await import("@/server/saved/store");

const ADDRESS = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const HOUR = 3_600_000;

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("saved results (PGlite in memory, real migrations)", () => {
  afterAll(() => resetDb());

  it("saves per chain, reads back within the age limit, and never shows one that is too old", async () => {
    const now = Date.now();
    await store.saveResults("approvals", ADDRESS, [
      { chain: "bsc", data: { n: 1 }, at: now - 2 * HOUR },
      { chain: "ethereum", data: { n: 2 }, at: now - 7 * HOUR }, // over approvals' 6 hours
    ]);
    const read = await store.readSaved<{ n: number }>(
      "approvals",
      ADDRESS.toLowerCase(),
      ["bsc", "ethereum", "base"],
      now,
    );
    expect([...read.keys()]).toEqual(["bsc"]);
    expect(read.get("bsc")?.data).toEqual({ n: 1 });
    expect(read.get("bsc")?.savedAt).toBe(new Date(now - 2 * HOUR).toISOString());
    // The same subject on another kind is separate.
    expect((await store.readSaved("balances", ADDRESS, ["bsc"], now)).size).toBe(0);
  });

  it("a newer save replaces the older one", async () => {
    await store.saveResults("gas", "all", [{ chain: "bsc", data: { v: "old" } }]);
    await store.saveResults("gas", "all", [{ chain: "bsc", data: { v: "new" } }]);
    expect((await store.readSaved<{ v: string }>("gas", "all", ["bsc"])).get("bsc")?.data.v).toBe("new");
  });

  it("doesn't save a result bigger than the limit", async () => {
    await store.saveResults("activity", ADDRESS, [{ chain: "polygon", data: "x".repeat(store.MAX_BYTES + 1) }]);
    expect((await store.readSaved("activity", ADDRESS, ["polygon"])).size).toBe(0);
  });

  it("deletes results not looked up for 7 days; reading one counts as a lookup", async () => {
    const db = await getDb();
    const now = Date.now();
    await store.saveResults("balances", "0xaaa", [{ chain: "bsc", data: 1 }]);
    await store.saveResults("balances", "0xbbb", [{ chain: "bsc", data: 2 }]);
    // Both were last looked up 8 days ago...
    await db.update(savedResults).set({ usedAt: new Date(now - 8 * 24 * HOUR) });
    // ...then 0xbbb is looked up again now.
    expect((await store.readSaved("balances", "0xbbb", ["bsc"], now)).size).toBe(1);
    await settle();
    await store.pruneSaved(now);
    expect((await store.readSaved("balances", "0xaaa", ["bsc"], now)).size).toBe(0);
    expect((await store.readSaved("balances", "0xbbb", ["bsc"], now)).size).toBe(1);
  });
});
