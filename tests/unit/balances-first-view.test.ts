import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

/** R2 part 2: a slow token list shows a first view after FIRST_VIEW_MS; the reload gets the finished list. */
process.env.PGLITE_DIR = "memory";
vi.mock("@/server/chains/evm/wallet-tokens", () => ({ walletTokens: async () => null }));

const { getEvmBalances, resetTokenListings, FIRST_VIEW_MS } = await import("@/server/chains/evm/balances");
const { getChain } = await import("@/config/chains");
const { resetUsage } = await import("@/server/chains/evm/providers");
import type { Provider } from "@/server/chains/evm/providers";

const OWNER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const FIRST = "0x1111111111111111111111111111111111111111";
const LATER = "0x2222222222222222222222222222222222222222";
const chain = getChain("ethereum")!;
const USDT = chain.commonTokens[0]!;
const alchemy = { name: "alchemy", url: "https://index.test", kind: "alchemy" } as Provider;

function fakeClient() {
  const multicall = async ({ contracts }: { contracts: { address: string; functionName: string }[] }) =>
    contracts.map((c) => {
      if (c.functionName === "balanceOf")
        return { status: "success", result: c.address.toLowerCase() === USDT.toLowerCase() ? 5n : 0n };
      if (c.functionName === "decimals") return { status: "success", result: 18 };
      return { status: "success", result: "T" };
    });
  return { getBalance: async () => 7n, multicall } as unknown as PublicClient;
}

const page = (address: string, pageKey?: string) =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { tokenBalances: [{ contractAddress: address, tokenBalance: "0x05" }], ...(pageKey ? { pageKey } : {}) },
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenListings();
  resetUsage();
});

describe("token list first view", () => {
  it("shows the first page plus well-known tokens after the first-view time, marked completing; then the full list", async () => {
    let second: (() => void) | undefined;
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      if (!String(url).startsWith("https://index.test")) throw new Error("unexpected");
      if (!body.includes("pageKey")) return page(FIRST, "next");
      await new Promise<void>((resolve) => (second = resolve));
      return page(LATER);
    });
    const client = fakeClient();
    const started = Date.now();
    const first = await getEvmBalances(client, chain, OWNER, alchemy);
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(FIRST_VIEW_MS - 50);
    expect(took).toBeLessThan(FIRST_VIEW_MS + 1_500);
    expect(first.completing).toBe(true);
    expect(first.coverage).toBe("truncated");
    const addresses = first.tokens.map((t) => t.address.toLowerCase());
    expect(addresses).toContain(FIRST);
    expect(addresses).toContain(USDT.toLowerCase()); // well-known tokens are never missed
    expect(addresses).not.toContain(LATER);

    second?.();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reload = await getEvmBalances(client, chain, OWNER, alchemy);
    expect(reload.completing).toBeUndefined();
    expect(reload.coverage).toBe("full");
    expect(reload.tokens.map((t) => t.address.toLowerCase())).toEqual(expect.arrayContaining([FIRST, LATER]));
  }, 15_000);
});
