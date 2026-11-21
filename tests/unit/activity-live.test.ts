/**
 * Activity, live. Needs ALCHEMY_API_KEY in .env.local (the full-history source). Run with:
 *   LIVE=1 pnpm test tests/unit/activity-live.test.ts
 */
import { describe, expect, it } from "vitest";

// The key lives in .env.local; load it before the server modules read their settings.
if (process.env.LIVE === "1") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: the test is skipped below.
  }
}
const live = process.env.LIVE === "1" && Boolean(process.env.ALCHEMY_API_KEY);
const { getChain } = await import("@/config/chains");
const { getEvmActivity } = await import("@/server/chains/evm/activity");
const BUSY = {
  ethereum: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  bsc: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
};

describe.skipIf(!live)("activity history (live, Alchemy)", () => {
  for (const key of ["ethereum", "bsc"] as const) {
    it(`${key}: newest first, every transfer involves the wallet, pages continue without repeats`, async () => {
      const chain = getChain(key)!;
      const first = await getEvmActivity(chain, BUSY[key], null, []);
      expect(first.chain.source).toBe("history");
      expect(first.transfers.length).toBeGreaterThan(0);
      expect(first.chain.first).not.toBeNull();
      for (const t of first.transfers) {
        expect([t.from, t.to].map((a) => a.toLowerCase())).toContain(BUSY[key].toLowerCase());
        expect(t.time).not.toBeNull();
      }
      const blocks = first.transfers.map((t) => t.block);
      expect([...blocks].sort((a, b) => b - a)).toEqual(blocks);
      if (first.chain.next !== null) {
        const second = await getEvmActivity(chain, BUSY[key], first.chain.next, []);
        const ids = new Set(first.transfers.map((t) => t.id));
        expect(second.transfers.some((t) => ids.has(t.id))).toBe(false);
        expect(Math.max(...second.transfers.map((t) => t.block))).toBeLessThanOrEqual(first.chain.next);
      }
    }, 90_000);
  }
});
