/**
 * Approvals, live (real nodes). Run with:  LIVE=1 pnpm test tests/unit/approvals-live.test.ts
 * GoPlus uses Next.js caching and is checked by the browser tests instead.
 */
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { getChain } from "@/config/chains";
import { PERMIT2, knownSpenders } from "@/config/known-contracts";
import { evmAdapter } from "@/server/chains/evm/adapter";
import { getEvmClient } from "@/server/chains/evm/providers";

const live = process.env.LIVE === "1";
// A long-lived public wallet (vitalik.eth) holding major stablecoins.
const OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HELD = [
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
];

describe.skipIf(!live)("approvals (live)", () => {
  it("Permit2 and every known spender are contracts on both chains", async () => {
    for (const key of ["ethereum", "bsc"] as const) {
      const client = getEvmClient(getChain(key)!);
      const spenders = knownSpenders(key);
      expect(spenders).toContain(PERMIT2);
      const codes = await Promise.all(spenders.map((s) => client.getCode({ address: getAddress(s) })));
      expect(codes.every((c) => c && c.length > 2)).toBe(true);
    }
  }, 60_000);

  it("reads a real wallet: every approval shown is non-zero on-chain, spenders typed and named", async () => {
    const facts = await evmAdapter.getApprovals!(getChain("ethereum")!, OWNER, HELD);
    expect(facts.sources.knownSpenders).toBe(true);
    expect(facts.approvals.length).toBeGreaterThan(0);
    for (const a of facts.approvals) {
      if (a.kind !== "nft-all") expect(BigInt(a.allowance!)).toBeGreaterThan(0n);
      expect(a.spender.type).not.toBeUndefined();
      if (a.spender.name) expect(a.spender.type).toBe("contract");
    }
  }, 90_000);
});
