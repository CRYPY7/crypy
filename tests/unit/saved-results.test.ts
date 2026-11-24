import { afterAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { resetDb, getDb } = await import("@/server/db/client");
const { savedResults } = await import("@/server/db/schema");
const store = await import("@/server/saved/store");
const { withSavedChains } = await import("@/server/services/overview");
import type { ChainHoldings } from "@/lib/portfolio/holdings";
import type { AddressOverview } from "@/server/services/overview";

const ADDRESS = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const HOUR = 3_600_000;

function holdings(chain: ChainHoldings["chain"], usd: number, extra: Partial<ChainHoldings> = {}): ChainHoldings {
  return {
    chain,
    coverage: "full",
    visible: [
      {
        chain,
        kind: "native",
        symbol: "X",
        name: "X",
        amount: { raw: "1000", decimals: 3 },
        priceUsd: usd,
        valueUsd: usd,
      },
    ],
    hidden: [],
    unpricedCount: 0,
    totalUsd: usd,
    pricesRead: true,
    ...extra,
  };
}

function overview(chains: ChainHoldings[], unavailable: AddressOverview["unavailable"] = []): AddressOverview {
  return {
    chains,
    unavailable,
    pricesAvailable: true,
    totalUsd: chains.reduce((s, c) => s + c.totalUsd, 0),
    fetchedAt: new Date().toISOString(),
  };
}

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

  it("address overview: a chain that failed now shows its last full reading, marked with its time", async () => {
    const fresh = overview([holdings("ethereum", 100), holdings("bsc", 50)]);
    await withSavedChains(ADDRESS, fresh);
    await settle();
    // Later BNB Chain fails: it comes back from the saved reading, Ethereum stays fresh.
    const later = await withSavedChains(ADDRESS, overview([holdings("ethereum", 120)], ["bsc"]));
    expect(later.unavailable).toEqual([]);
    expect(later.chains.map((c) => c.chain)).toEqual(["ethereum", "bsc"]);
    expect(later.totalUsd).toBe(170);
    expect(Object.keys(later.saved ?? {})).toEqual(["bsc"]);
  });

  it("an incomplete reading fills a gap but never replaces a complete one (unless that is over a day old)", async () => {
    const now = Date.now();
    await store.saveResults("balances", "0xccc", [{ chain: "bsc", data: "partial", quality: 1 }]);
    expect((await store.readSaved("balances", "0xccc", ["bsc"])).get("bsc")?.data).toBe("partial");
    await store.saveResults("balances", "0xccc", [{ chain: "bsc", data: "full", quality: 2, at: now - 30 * HOUR }]);
    await store.saveResults("balances", "0xccc", [
      { chain: "bsc", data: "partial again", quality: 1, at: now - 20 * HOUR },
    ]);
    expect((await store.readSaved("balances", "0xccc", ["bsc"])).get("bsc")?.data).toBe("full");
    // The complete reading is now over a day older than the new incomplete one: the newer one wins.
    await store.saveResults("balances", "0xccc", [{ chain: "bsc", data: "partial today", quality: 1, at: now }]);
    expect((await store.readSaved("balances", "0xccc", ["bsc"])).get("bsc")?.data).toBe("partial today");
  });

  it("address overview: a partial reading is never saved over a full one; with nothing saved the chain stays unavailable", async () => {
    await withSavedChains(ADDRESS, overview([holdings("base", 10)]));
    await settle();
    // A later reading with a cut-off token list, and one without prices: neither replaces the full one.
    await withSavedChains(ADDRESS, overview([holdings("base", 3, { coverage: "truncated" })]));
    await withSavedChains(ADDRESS, overview([holdings("base", 0, { pricesRead: false })]));
    await settle();
    const after = await withSavedChains(ADDRESS, overview([], ["base", "arbitrum"]));
    expect(after.chains.find((c) => c.chain === "base")?.totalUsd).toBe(10);
    expect(after.unavailable).toEqual(["arbitrum"]);
  });
});
