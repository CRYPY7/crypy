import { afterEach, describe, expect, it, vi } from "vitest";
import { getChain } from "@/config/chains";
import { getEvmBalances } from "@/server/chains/evm/balances";
import { getEvmClient } from "@/server/chains/evm/providers";

/**
 * Live (LIVE=1): when the token index cuts the list off before reaching a well-known token, the well-known tokens are
 * still read from the chain. The index is faked: one page of junk, with a page key, and slow enough to use the budget.
 */
const live = process.env.LIVE === "1";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe.skipIf(!live)("cut-off token list keeps well-known tokens", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds Vitalik's USDT on Ethereum although the faked list never reached it", async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://fake-index.test")) {
        await new Promise((r) => setTimeout(r, 2_600));
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              address: VITALIK,
              tokenBalances: [{ contractAddress: "0x0000000000000000000000000000000000000001", tokenBalance: "0x01" }],
              pageKey: "next",
            },
          }),
        );
      }
      return realFetch(url, init);
    });
    const chain = getChain("ethereum")!;
    const fakeIndex = { name: "alchemy", url: "https://fake-index.test", kind: "alchemy" } as never;
    const result = await getEvmBalances(getEvmClient(chain), chain, VITALIK, fakeIndex);
    expect(result.coverage).toBe("truncated");
    const usdt = result.tokens.find((t) => t.address.toLowerCase() === chain.commonTokens[0]!.toLowerCase());
    expect(usdt?.info?.symbol).toBe("USDT");
  }, 60_000);
});
