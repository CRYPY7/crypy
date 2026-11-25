import { describe, expect, it, vi } from "vitest";

/** B-014: date → block reads headers in parallel rounds; offline checks with uneven block times. */
let timeOf: (n: number) => number = (n) => n;
let newest = 1_000_000;
let reads = 0;
vi.mock("@/server/chains/evm/providers", () => ({
  getEvmClient: () => ({
    getBlock: async ({ blockNumber, blockTag }: { blockNumber?: bigint; blockTag?: string }) => {
      reads++;
      const n = blockTag === "latest" ? newest : Number(blockNumber);
      if (n < 0 || n > newest) throw new Error(`no block ${n}`);
      return { number: BigInt(n), timestamp: BigInt(timeOf(n)) };
    },
  }),
}));
const { evmBlockAtTime } = await import("@/server/chains/evm/block-time");
const chain = { key: "test" } as never;

/** The first block at or after `time`, the slow way. */
function expected(time: number): number {
  let lo = 1;
  let hi = newest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (timeOf(mid) >= time) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

describe("evmBlockAtTime", () => {
  it("finds the first block at or after the time with uneven block times, in a bounded number of reads", async () => {
    // 15 s blocks, then 3 s blocks, then 1 s with gaps of equal timestamps (several blocks in one second).
    timeOf = (n) =>
      n < 300_000 ? n * 15 : n < 700_000 ? 4_500_000 + (n - 300_000) * 3 : 5_700_000 + Math.floor((n - 700_000) / 3);
    newest = 1_000_000;
    for (const time of [16, 4_499_999, 4_500_000, 4_500_001, 5_000_000, 5_700_000, 5_750_000, timeOf(newest)]) {
      reads = 0;
      const found = await evmBlockAtTime(chain, time);
      expect(found.block).toBe(expected(time));
      expect(found.time).toBe(timeOf(found.block));
      expect(reads).toBeLessThan(120);
    }
  });

  it("block 0 at time 0 is skipped; a time before block 1 gives block 1; a future time is an estimate", async () => {
    timeOf = (n) => (n === 0 ? 0 : 1_000 + n * 2);
    newest = 50_000;
    expect((await evmBlockAtTime(chain, 500)).block).toBe(1);
    const future = await evmBlockAtTime(chain, timeOf(newest) + 200);
    expect(future).toMatchObject({ estimate: true, block: newest + 100 });
  });
});
