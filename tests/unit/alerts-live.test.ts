import { describe, expect, it } from "vitest";

/**
 * The checker on a real chain (LIVE=1): a busy address is watched with "any amount" rules. After the first round
 * the saved position is moved 30 blocks back, so the second round reads ~30 real blocks and must find real
 * transfers, priced and described. ALERTS_LIVE_CHAIN picks the chain
 * (default Ethereum, which free public endpoints can search; BNB Chain needs an extra provider in BSC_RPC_URLS).
 */
process.env.PGLITE_DIR = "memory";
const live = process.env.LIVE === "1";

const chainKey = process.env.ALERTS_LIVE_CHAIN ?? "ethereum";
const wallets: Record<string, string> = {
  // Very active public addresses: Uniswap's Universal Router (Ethereum), a Binance hot wallet (BNB Chain).
  ethereum: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  bsc: "0x8894e0a0c962cb723c1976a4421c95949be2d4e3",
};

describe.skipIf(!live)(`alerts checker on ${chainKey} (live)`, () => {
  it("finds real transfers of a busy wallet between two rounds", { timeout: 120_000 }, async () => {
    const { getDb } = await import("@/server/db/client");
    const { users, watchItems, checkerCursors } = await import("@/server/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { getChain } = await import("@/config/chains");
    const { loadWatched, scanChain } = await import("@/server/alerts/checker");
    const db = await getDb();
    const [user] = await db.insert(users).values({}).returning();
    const wallet = wallets[chainKey]!;
    await db.insert(watchItems).values({
      userId: user!.id,
      kind: "address",
      target: wallet,
      label: "Exchange",
      rules: {
        sent: { on: true, minUsd: null },
        received: { on: true, minUsd: null },
        approvals: { on: true },
        valueDrop: { on: false, percent: 20 },
      },
    });
    const chain = getChain(chainKey)!;
    expect(await scanChain(chain, await loadWatched(db), db)).toEqual([]);
    await db
      .update(checkerCursors)
      .set({ lastBlock: sql`${checkerCursors.lastBlock} - 30` })
      .where(eq(checkerCursors.chain, chainKey));
    const started = Date.now();
    const drafts = await scanChain(chain, await loadWatched(db), db);
    console.log(`round 2: ${drafts.length} alerts in ${Date.now() - started} ms`);
    for (const d of drafts.slice(0, 3))
      console.log(`  ${d.title} | ${d.details.summary} | ${d.details.lines.join(" / ")}`);
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(["sent", "received", "moved", "approval"]).toContain(d.kind);
      expect(d.details.path.startsWith("/tx/0x") || d.details.path.startsWith("/address/")).toBe(true);
    }
  });
});
