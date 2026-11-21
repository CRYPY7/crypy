import { describe, expect, it } from "vitest";
import { actionCost, formatFeeUsd, formatGwei, speeds, trend } from "@/lib/gas/compute";
import { parseFeeHistory } from "@/server/chains/evm/gas";

const g = 1e9;
describe("gas maths", () => {
  it("speeds = next base fee + median tip at each percentile, never decreasing", () => {
    const history = {
      baseFees: [8 * g, 8 * g, 9 * g],
      rewards: [
        [0.1 * g, 0.5 * g, 2 * g],
        [0.3 * g, 0.4 * g, 1 * g],
      ] as [number, number, number][],
      newestBlock: 100,
    };
    const s = speeds(history);
    expect(s.baseFee).toBe(9);
    expect(s.low).toBeCloseTo(9.2);
    expect(s.average).toBeCloseTo(9.45);
    expect(s.high).toBeCloseTo(10.5);
    // Noisy percentiles never make "average" cheaper than "low".
    const odd = speeds({ ...history, rewards: [[1 * g, 0.2 * g, 0.1 * g]] });
    expect(odd.average).toBeGreaterThanOrEqual(odd.low);
    expect(odd.high).toBeGreaterThanOrEqual(odd.average);
  });
  it("chains without a base fee use the tip, and say so", () => {
    const bsc = {
      baseFees: [0, 0, 0],
      rewards: [[0.05 * g, 0.05 * g, 0.1 * g]] as [number, number, number][],
      newestBlock: 5,
    };
    expect(speeds(bsc)).toMatchObject({ baseFee: null, low: 0.05, average: 0.05, high: 0.1 });
    expect(trend(bsc).measure).toBe("tip");
  });
  it("trend is averaged into at most 60 points", () => {
    const h = { baseFees: Array.from({ length: 1025 }, (_, i) => (i + 1) * g), rewards: [], newestBlock: 1 };
    const t = trend(h);
    expect(t.measure).toBe("baseFee");
    expect(t.values.length).toBeLessThanOrEqual(60);
    expect(t.values[0]).toBeLessThan(t.values[t.values.length - 1]!);
  });
  it("action cost in coin and dollars; readable gwei", () => {
    const c = actionCost("sendCoin", 10, 2000);
    expect(c.gas).toBe(21000);
    expect(c.coin).toBeCloseTo(0.00021);
    expect(c.usd).toBeCloseTo(0.42);
    expect(actionCost("swap", 1, null).usd).toBeNull();
    expect(formatGwei(0.3544)).toBe("0.354");
    expect(formatGwei(8.34)).toBe("8.3");
    expect(formatGwei(23.6)).toBe("24");
    expect(formatFeeUsd(0.000548)).toBe("$0.00055");
    expect(formatFeeUsd(3.24)).toBe("$3.24");
  });
  it("parses eth_feeHistory and rejects junk", () => {
    const h = parseFeeHistory({
      oldestBlock: "0x64",
      baseFeePerGas: ["0x1", "0x2", "0x3"],
      reward: [
        ["0x1", "0x2", "0x3"],
        ["0x4", "0x5", "0x6"],
      ],
    })!;
    expect(h).toEqual({
      baseFees: [1, 2, 3],
      rewards: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      newestBlock: 101,
    });
    expect(parseFeeHistory({ oldestBlock: "x", baseFeePerGas: [], reward: [] })).toBeNull();
    expect(parseFeeHistory(null)).toBeNull();
  });
});

describe("timestamp converter inputs", async () => {
  const { toUnix, parseUnix } = await import("@/modules/tools/timestamp-block/widget");
  it("dates in UTC, seconds or milliseconds, junk refused", () => {
    expect(toUnix("2026-11-01T00:00", "utc")).toBe(1793491200);
    expect(toUnix("2026-11-01T00:00:05", "utc")).toBe(1793491205);
    expect(toUnix("yesterday", "utc")).toBeNull();
    expect(parseUnix("1793491200")).toBe(1793491200);
    expect(parseUnix("1793491200123")).toBe(1793491200);
    expect(parseUnix("12a")).toBeNull();
  });
});
