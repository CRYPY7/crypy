/** Gas and block times, live (public nodes). Run with: LIVE=1 pnpm test tests/unit/gas-live.test.ts */
import { describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { evmBlockAtTime, evmBlockTime } from "@/server/chains/evm/block-time";
import { getEvmGas } from "@/server/chains/evm/gas";
import { speeds } from "@/lib/gas/compute";

const live = process.env.LIVE === "1";
describe.skipIf(!live)("gas and block times (live)", () => {
  for (const key of ["ethereum", "bsc"] as const) {
    it(`${key}: fee history gives ordered speeds`, async () => {
      const facts = await getEvmGas(getChain(key)!);
      expect(facts.history.rewards.length).toBeGreaterThan(100);
      const s = speeds(facts.history);
      expect(s.low).toBeGreaterThan(0);
      expect(s.low).toBeLessThanOrEqual(s.average);
      expect(s.average).toBeLessThanOrEqual(s.high);
    }, 60_000);
    it(`${key}: the block found for a date is the first at or after it`, async () => {
      const chain = getChain(key)!;
      const target = 1700000000;
      const found = await evmBlockAtTime(chain, target);
      expect(found.estimate).toBe(false);
      expect(found.time).toBeGreaterThanOrEqual(target);
      const before = await evmBlockTime(chain, found.block - 1);
      expect(before!.time).toBeLessThan(target);
    }, 90_000);
  }
});
