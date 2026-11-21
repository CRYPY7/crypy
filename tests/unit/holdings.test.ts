import { isAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chains } from "@/config/chains";
import type { ChainBalances } from "@/lib/chains/types";
import { amountToNumber, buildChainHoldings, spamReason } from "@/lib/portfolio/holdings";
import {
  MAX_TOKEN_PAGES,
  TOKEN_LIST_BUDGET_MS,
  listTokensFromAlchemy,
  parseTokenBalancesPage,
} from "@/server/chains/evm/balances";
import { resetUsage } from "@/server/chains/evm/providers";

const native = { symbol: "BNB", name: "BNB", priceKey: "coingecko:binancecoin" };
const key = (address: string) => `bsc:${address.toLowerCase()}`;
const A = "0x55d398326f99059fF775485246999027B3197955";
const B = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const C = "0x1111111111111111111111111111111111111111";
const D = "0x2222222222222222222222222222222222222222";
const E = "0x3333333333333333333333333333333333333333";

function balances(tokens: ChainBalances["tokens"]): ChainBalances {
  return { chain: "bsc", native: { raw: "2500000000000000000", decimals: 18 }, tokens, coverage: "full" };
}

describe("amounts and spam rules", () => {
  it("converts exact amounts to numbers for USD maths", () => {
    expect(amountToNumber({ raw: "2500000000000000000", decimals: 18 })).toBe(2.5);
    expect(amountToNumber({ raw: "1", decimals: 6 })).toBe(0.000001);
    expect(amountToNumber({ raw: "0", decimals: 18 })).toBe(0);
    expect(amountToNumber({ raw: "42", decimals: 0 })).toBe(42);
  });

  it("recognises common spam patterns", () => {
    expect(spamReason("Visit claim-usdt.org to claim", "CLAIM")).toBe("link-in-name");
    expect(spamReason("$5000 Reward", "RWD")).toBe("bait-words");
    expect(spamReason("Free Airdrop Voucher", "FAV")).toBe("bait-words");
    expect(spamReason("Tether USD", "USDT")).toBeUndefined();
    expect(spamReason("PancakeSwap Token", "Cake")).toBeUndefined();
  });
});

describe("building holdings", () => {
  const prices = new Map([
    ["coingecko:binancecoin", { usd: 600 }],
    [key(A), { usd: 1 }],
    [key(B), { usd: 2 }],
    [key(E), { usd: 0.5 }],
  ]);

  const result = buildChainHoldings(
    balances([
      {
        address: A,
        balance: { raw: "100000000000000000000", decimals: 18 },
        info: { name: "Tether USD", symbol: "USDT", decimals: 18 },
      },
      {
        address: B,
        balance: { raw: "1000000000000000000000", decimals: 18 },
        info: { name: "PancakeSwap Token", symbol: "Cake", decimals: 18 },
      },
      { address: C, balance: { raw: "5", decimals: 0 }, info: { name: "Unknown Gem", symbol: "GEM", decimals: 0 } },
      {
        address: D,
        balance: { raw: "1000", decimals: 0 },
        info: { name: "Visit usdt-gift.com", symbol: "GIFT", decimals: 0 },
      },
      { address: E, balance: { raw: "10", decimals: 0 }, info: { name: "Free Reward", symbol: "FRW", decimals: 0 } },
      { address: "0x4444444444444444444444444444444444444444", balance: { raw: "7", decimals: 0 }, info: null },
    ]),
    native,
    prices,
    key,
  );

  it("puts the native coin first, then tokens by value, then unpriced", () => {
    expect(result.visible.map((h) => h.symbol)).toEqual(["BNB", "Cake", "USDT", "FRW", "GEM"]);
    expect(result.visible[0]).toMatchObject({ kind: "native", valueUsd: 1500 });
  });

  it("hides likely spam but keeps priced tokens with bait-like names visible", () => {
    expect(result.hidden.map((h) => [h.symbol, h.spam])).toEqual([
      ["GIFT", "link-in-name"],
      ["?", "unreadable"],
    ]);
    expect(result.visible.find((h) => h.symbol === "FRW")).toMatchObject({ valueUsd: 5 });
  });

  it("counts only priced, visible holdings in the total", () => {
    expect(result.totalUsd).toBe(1500 + 2000 + 100 + 5);
    expect(result.unpricedCount).toBe(1);
  });

  it("shows balances without values when prices are unavailable", () => {
    const noPrices = buildChainHoldings(balances([]), native, null, key);
    expect(noPrices.visible[0]).not.toHaveProperty("valueUsd");
    expect(noPrices.totalUsd).toBe(0);
  });
});

describe("Alchemy token list parsing", () => {
  it("keeps non-zero balances, drops zero and errored entries, returns the next page key", () => {
    const page = parseTokenBalancesPage({
      jsonrpc: "2.0",
      id: 1,
      result: {
        address: "0xf977814e90da44bfa03b6295a0616a897441acec",
        tokenBalances: [
          {
            contractAddress: A.toLowerCase(),
            tokenBalance: "0x0000000000000000000000000000000000000000000000056bc75e2d63100000",
          },
          {
            contractAddress: B.toLowerCase(),
            tokenBalance: "0x0000000000000000000000000000000000000000000000000000000000000000",
          },
          { contractAddress: C, tokenBalance: null, error: "execution reverted" },
          { contractAddress: D, tokenBalance: "not-hex" },
        ],
        pageKey: "0xabc",
      },
    });
    expect(page.pageKey).toBe("0xabc");
    expect(page.tokens).toEqual([{ address: A, raw: 100000000000000000000n }]);
  });

  it("treats provider errors and malformed data as failures (the page then falls back)", () => {
    expect(() => parseTokenBalancesPage({ jsonrpc: "2.0", id: 1, error: { message: "limit" } })).toThrow();
    expect(() => parseTokenBalancesPage({ result: { tokenBalances: [{ contractAddress: "<script>" }] } })).toThrow();
  });
});

describe("chain settings", () => {
  it("lists well-known tokens with valid checksums and no duplicates", () => {
    for (const chain of chains) {
      expect(chain.commonTokens.length).toBeGreaterThan(0);
      for (const token of chain.commonTokens) expect(isAddress(token, { strict: true })).toBe(true);
      expect(new Set(chain.commonTokens.map((t) => t.toLowerCase())).size).toBe(chain.commonTokens.length);
    }
  });
});

const TEST_ALCHEMY = { name: "alchemy", kind: "alchemy" as const, url: "https://example.invalid" };

describe("Alchemy token list paging", () => {
  beforeEach(() => resetUsage());
  const hex = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  const contract = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;

  /** Pages of 100 entries where only every 25th still has a balance, like a wallet that traded many tokens. */
  function mockPages(pageCount: number, delayMs = 0) {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const body = JSON.parse(String(init.body)) as { params: [string, string, { pageKey?: string }] };
      calls.push(body.params[2]);
      const page = Number(body.params[2].pageKey ?? 0);
      const tokenBalances = Array.from({ length: 100 }, (_, j) => {
        const i = page * 100 + j + 1;
        return { contractAddress: contract(i), tokenBalance: hex(i % 25 === 0 ? i : 0) };
      });
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { tokenBalances, pageKey: page + 1 < pageCount ? String(page + 1) : null },
        }),
      );
    });
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("keeps reading pages past the zero balances and finds every token still held", async () => {
    const calls = mockPages(6);
    const result = await listTokensFromAlchemy(TEST_ALCHEMY, "0x0000000000000000000000000000000000000001");
    expect(calls).toHaveLength(6);
    expect(result.truncated).toBe(false);
    expect(result.tokens).toHaveLength(24); // 4 per page × 6 pages
  });

  it("stops at the page cap and reports the list as cut", async () => {
    const calls = mockPages(MAX_TOKEN_PAGES + 3);
    const result = await listTokensFromAlchemy(TEST_ALCHEMY, "0x0000000000000000000000000000000000000001");
    expect(calls).toHaveLength(MAX_TOKEN_PAGES);
    expect(result.truncated).toBe(true);
    expect(result.entries).toBe(MAX_TOKEN_PAGES * 100);
  });

  it("stops asking for more pages once the time budget is used, and says the list was cut", async () => {
    const perPage = Math.ceil(TOKEN_LIST_BUDGET_MS / 3);
    vi.useFakeTimers();
    const calls = mockPages(MAX_TOKEN_PAGES, perPage);
    const pending = listTokensFromAlchemy(TEST_ALCHEMY, "0x0000000000000000000000000000000000000001");
    await vi.advanceTimersByTimeAsync(TOKEN_LIST_BUDGET_MS * 2);
    const result = await pending;
    vi.useRealTimers();
    expect(calls.length).toBeLessThan(MAX_TOKEN_PAGES);
    expect(result.truncated).toBe(true);
    expect(result.entries).toBe(calls.length * 100);
  });
});
