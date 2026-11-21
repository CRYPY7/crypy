import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { getEvmBalances } from "@/server/chains/evm/balances";

/** A fake node: every common token has a balance and readable details; counts multicalls. */
function fakeClient() {
  const calls: number[] = [];
  let active = 0;
  let peak = 0;
  const client = {
    getBalance: async () => 5n,
    multicall: async ({ contracts }: { contracts: { functionName: string; address: string }[] }) => {
      calls.push(contracts.length);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return contracts.map((c) => {
        if (c.functionName === "balanceOf") return { status: "success", result: 1000n };
        if (c.functionName === "decimals") return { status: "success", result: 18 };
        return { status: "success", result: `T${c.address.slice(2, 6)}` };
      });
    },
  } as unknown as PublicClient;
  return { client, calls, peak: () => peak };
}

describe("token details for balances", () => {
  const chain = getChain("bsc")!;
  const owner = "0x1111111111111111111111111111111111111111";

  it("keeps the token order and reads details once; later scans use the remembered details", async () => {
    const first = fakeClient();
    const a = await getEvmBalances(first.client, chain, owner, null);
    expect(a.coverage).toBe("common-only");
    expect(a.tokens.map((t) => t.address.toLowerCase())).toEqual(chain.commonTokens.map((t) => t.toLowerCase()));
    expect(a.tokens.every((t) => t.info?.decimals === 18)).toBe(true);
    expect(first.calls.length).toBe(2); // balances, then details

    const second = fakeClient();
    const b = await getEvmBalances(second.client, chain, owner, null);
    expect(second.calls.length).toBe(1); // balances only: details came from memory
    expect(b.tokens).toEqual(a.tokens);
  });
});
