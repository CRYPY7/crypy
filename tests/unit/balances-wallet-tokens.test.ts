import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

// A plain function, not vi.fn(): the mock tracker reports a rejected promise as unhandled even when the code catches it.
let answer: () => Promise<unknown> = async () => null;
let asked = 0;
vi.mock("@/server/chains/evm/wallet-tokens", () => ({
  walletTokens: () => {
    asked += 1;
    return answer();
  },
}));

const { getEvmBalances } = await import("@/server/chains/evm/balances");
const { getChain } = await import("@/config/chains");
import type { Provider } from "@/server/chains/evm/providers";

const OWNER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const KNOWN = "0x1111111111111111111111111111111111111111";
const UNKNOWN = "0x2222222222222222222222222222222222222222";
const chain = getChain("ethereum")!;
const USDT = chain.commonTokens[0]!;
const alchemy = { name: "alchemy", url: "https://example.invalid", kind: "alchemy" } as Provider;

/** A node that holds 5 of the first well-known token, and answers token details for the unknown one. */
function fakeClient() {
  const multicall = vi.fn(async ({ contracts }: { contracts: { address: string; functionName: string }[] }) =>
    contracts.map((c) => {
      if (c.functionName === "balanceOf")
        return c.address.toLowerCase() === USDT.toLowerCase()
          ? { status: "success", result: 5n }
          : { status: "success", result: 0n };
      if (c.functionName === "decimals") return { status: "success", result: 18 };
      return { status: "success", result: c.functionName === "symbol" ? "UNK" : "Unknown" };
    }),
  );
  return { client: { getBalance: async () => 7n, multicall } as unknown as PublicClient, multicall };
}

beforeEach(() => {
  asked = 0;
  answer = async () => null;
});

describe("balances from the all-chains token list (B-035)", () => {
  it("a complete list: details from the list, missing ones read from the contract, nothing else checked", async () => {
    answer = async () => ({
      tokens: [
        { address: KNOWN, raw: 10n, info: { name: "Known", symbol: "KN", decimals: 6 } },
        { address: UNKNOWN, raw: 3n, info: null },
      ],
      entries: 4,
      complete: true,
      completing: false,
    });
    const { client, multicall } = fakeClient();
    const result = await getEvmBalances(client, chain, OWNER, alchemy);
    expect(result.coverage).toBe("full");
    expect(result.completing).toBeUndefined();
    expect(result.checkedEntries).toBe(4);
    expect(result.native.raw).toBe("7");
    expect(result.tokens.map((t) => [t.address, t.balance.raw, t.info?.symbol])).toEqual([
      [KNOWN, "10", "KN"],
      [UNKNOWN, "3", "UNK"],
    ]);
    // One metadata read for the unknown token; no well-known-token check for a complete list.
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("a list still being read: shown as cut off and completing, and the well-known tokens are read directly", async () => {
    answer = async () => ({
      tokens: [{ address: KNOWN, raw: 10n, info: { name: "Known", symbol: "KN", decimals: 6 } }],
      entries: 100,
      complete: false,
      completing: true,
    });
    const { client } = fakeClient();
    const result = await getEvmBalances(client, chain, OWNER, alchemy);
    expect(result.coverage).toBe("truncated");
    expect(result.completing).toBe(true);
    expect(result.tokens.map((t) => t.address.toLowerCase())).toContain(USDT.toLowerCase());
  });

  it("without an Alchemy key the list isn't asked for: the per-chain way gives well-known tokens only", async () => {
    const { client } = fakeClient();
    const result = await getEvmBalances(client, chain, OWNER, null);
    expect(asked).toBe(0);
    expect(result.coverage).toBe("common-only");
  });

  it("when the all-chains list fails, the per-chain list is tried, then well-known tokens", async () => {
    answer = () => Promise.reject(new Error("unavailable"));
    const { client } = fakeClient();
    const result = await getEvmBalances(client, chain, OWNER, alchemy);
    expect(asked).toBe(1);
    expect(result.coverage).toBe("common-only");
  });
});
