import { afterEach, describe, expect, it } from "vitest";
import type { Provider } from "@/server/chains/evm/providers";
import {
  type FetchPage,
  parseWalletTokensPage,
  resetWalletTokens,
  walletTokens,
  withWalletTokenPages,
} from "@/server/chains/evm/wallet-tokens";

const OWNER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const SPAM = "0x1111111111111111111111111111111111111111";
const alchemy: Provider = { name: "alchemy", url: "https://example.invalid", kind: "alchemy" } as Provider;

const token = (network: string, tokenAddress: string | null, balance: string, meta?: object | null) => ({
  address: OWNER,
  network,
  tokenAddress,
  tokenBalance: balance,
  tokenMetadata: meta === undefined ? { decimals: 6, name: "Tether USD", symbol: "USDT" } : meta,
});

afterEach(() => resetWalletTokens());

describe("Alchemy 'Tokens By Wallet' pages (B-035)", () => {
  it("groups tokens by chain, drops the native coin and zero balances, keeps usable details", () => {
    const page = parseWalletTokensPage({
      data: {
        tokens: [
          token("eth-mainnet", null, "0x10"),
          token("eth-mainnet", USDT, "0x0f4240"),
          token("eth-mainnet", SPAM, "0x0"),
          token("matic-mainnet", SPAM, "0x01", { decimals: 999, name: "x", symbol: "X" }),
          token("bnb-mainnet", SPAM, "0x05", { decimals: 18, name: "Visit\\u202escam.com", symbol: "​FREE" }),
        ],
        pageKey: "next",
      },
    });
    expect(page.pageKey).toBe("next");
    expect(page.byNetwork.get("eth-mainnet")).toEqual([
      {
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        raw: 1_000_000n,
        info: { name: "Tether USD", symbol: "USDT", decimals: 6 },
      },
    ]);
    // Polygon is answered as "matic-mainnet"; invalid decimals mean "read the contract instead".
    expect(page.byNetwork.get("polygon-mainnet")?.[0]?.info).toBeNull();
    expect(page.byNetwork.get("bnb-mainnet")?.[0]?.info?.symbol).toBe("FREE");
    expect(page.entries.get("eth-mainnet")).toBe(2); // the native coin isn't a list entry
  });

  it("refuses answers that aren't a token list", () => {
    expect(() => parseWalletTokensPage({ error: { message: "bad key" } })).toThrow();
  });
});

/** Pages of one USDT each on Ethereum, answering after `delay` ms; `failAt` makes that page fail. */
function pages(count: number, delay: number, failAt?: number) {
  const asked: unknown[] = [];
  const fetchPage: FetchPage = async (body) => {
    asked.push(body);
    const n = asked.length;
    await new Promise((r) => setTimeout(r, delay));
    if (n === failAt) throw new Error("page failed");
    return {
      data: {
        tokens: [token("eth-mainnet", `0x${String(n).padStart(40, "0")}`, "0x01")],
        pageKey: n < count ? `page-${n + 1}` : null,
      },
    };
  };
  return { fetchPage, asked };
}

describe("one shared reading per wallet (B-035)", () => {
  it("a short list comes back complete", async () => {
    const { fetchPage, asked } = pages(2, 5);
    const view = await walletTokens(alchemy, OWNER, "eth-mainnet", 1_000, fetchPage);
    expect(view).toMatchObject({ complete: true, completing: false, entries: 2 });
    expect(view.tokens).toHaveLength(2);
    expect((asked[1] as { pageKey?: string }).pageKey).toBe("page-2");
    expect(asked[0]).toMatchObject({ withMetadata: true, withPrices: false, includeNativeTokens: false });
  });

  it("a long list shows what arrived in time, keeps reading, and the next look gets all of it at once", async () => {
    const { fetchPage, asked } = pages(12, 20);
    const first = await walletTokens(alchemy, OWNER, "eth-mainnet", 50, fetchPage);
    expect(first.complete).toBe(false);
    expect(first.completing).toBe(true);
    expect(first.tokens.length).toBeGreaterThan(0);
    expect(first.tokens.length).toBeLessThan(12);
    const later = await walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, fetchPage);
    expect(later).toMatchObject({ complete: true, completing: false });
    expect(later.tokens).toHaveLength(12);
    // Shared: the second look didn't start another reading.
    expect(asked).toHaveLength(12);
    const again = await walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, fetchPage);
    expect(again.tokens).toHaveLength(12);
    expect(asked).toHaveLength(12);
  });

  it("stops at 30 pages and says the list is cut off", async () => {
    const { fetchPage, asked } = pages(100, 0);
    const view = await walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, fetchPage);
    expect(asked).toHaveLength(30);
    expect(view).toMatchObject({ complete: false, completing: false });
  });

  it("a later page failing keeps what was read (cut off); a first page failing throws, so the old way is used", async () => {
    const later = pages(5, 0, 3);
    const kept = await walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, later.fetchPage);
    expect(kept).toMatchObject({ complete: false, completing: false });
    expect(kept.tokens).toHaveLength(2);
    resetWalletTokens();
    const first = pages(5, 0, 1);
    await expect(walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, first.fetchPage)).rejects.toThrow();
    // A failed reading isn't kept: the next look tries again.
    const retry = pages(1, 0);
    await expect(walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, retry.fetchPage)).resolves.toMatchObject({
      complete: true,
    });
  });

  it("a health check reads one page only, kept apart from visitors' readings", async () => {
    const { fetchPage, asked } = pages(5, 0);
    const probe = await withWalletTokenPages(1, () => walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, fetchPage));
    expect(asked).toHaveLength(1);
    expect(probe).toMatchObject({ complete: false, completing: false });
    const visitor = await walletTokens(alchemy, OWNER, "eth-mainnet", 5_000, fetchPage);
    expect(visitor.complete).toBe(true);
    expect(asked.length).toBeGreaterThan(1); // its own reading, not the probe's one page
  });
});
