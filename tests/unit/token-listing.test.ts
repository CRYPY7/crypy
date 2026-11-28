import { afterEach, describe, expect, it } from "vitest";
import { LISTING_KEEP_MS, type ListedToken, resetTokenListings, sharedTokenList } from "@/server/chains/evm/balances";

/** R2 part 2: one token list per wallet and chain, shared; a page shows what has arrived after FIRST_VIEW_MS. */
const ALCHEMY = { name: "alchemy", kind: "alchemy" as const, url: "https://example.invalid" };
const OWNER = "0x00000000000000000000000000000000000000Aa";
const token = (n: number): ListedToken => ({
  address: `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`,
  raw: 1n,
});

function controlledList() {
  let calls = 0;
  let pageFn: ((p: { tokens: ListedToken[]; entries: number }) => void) | undefined;
  let finish: ((r: { tokens: ListedToken[]; truncated: boolean; entries: number }) => void) | undefined;
  let fail: ((e: Error) => void) | undefined;
  const list = (_p: unknown, _o: string, onPage?: (p: { tokens: ListedToken[]; entries: number }) => void) => {
    calls += 1;
    pageFn = onPage;
    return new Promise<{ tokens: ListedToken[]; truncated: boolean; entries: number }>((res, rej) => {
      finish = res;
      fail = rej;
    });
  };
  return {
    list: list as never,
    calls: () => calls,
    page: (tokens: ListedToken[]) => pageFn?.({ tokens, entries: 100 }),
    finish: (tokens: ListedToken[]) => finish?.({ tokens, truncated: false, entries: 200 }),
    fail: () => fail?.(new Error("down")),
  };
}

afterEach(() => resetTokenListings());

describe("shared token list", () => {
  it("is shared while it runs, shows the pages so far, and warms each page's details", async () => {
    const c = controlledList();
    const warmed: number[] = [];
    const a = sharedTokenList(ALCHEMY, OWNER, "bsc", (p) => warmed.push(p.length), c.list);
    const b = sharedTokenList(ALCHEMY, OWNER.toLowerCase(), "bsc", () => {}, c.list);
    expect(b).toBe(a);
    expect(c.calls()).toBe(1);
    c.page([token(1), token(2)]);
    expect(a.sofar).toHaveLength(2);
    expect(a.entries).toBe(100);
    expect(warmed).toEqual([2]);
    // Other chains have their own list.
    sharedTokenList(ALCHEMY, OWNER, "base", () => {}, c.list);
    expect(c.calls()).toBe(2);
  });

  it("is kept for the reload after it finishes, then read again", async () => {
    const c = controlledList();
    const t0 = Date.now();
    const a = sharedTokenList(ALCHEMY, OWNER, "bsc", () => {}, c.list, t0);
    c.finish([token(1), token(2), token(3)]);
    expect((await a.full).tokens).toHaveLength(3);
    expect(sharedTokenList(ALCHEMY, OWNER, "bsc", () => {}, c.list, Date.now() + 1_000)).toBe(a);
    sharedTokenList(ALCHEMY, OWNER, "bsc", () => {}, c.list, Date.now() + LISTING_KEEP_MS + 1);
    expect(c.calls()).toBe(2);
  });

  it("a failed list isn't kept: the next request tries again", async () => {
    const c = controlledList();
    const a = sharedTokenList(ALCHEMY, OWNER, "bsc", () => {}, c.list);
    c.fail();
    await expect(a.full).rejects.toThrow("down");
    sharedTokenList(ALCHEMY, OWNER, "bsc", () => {}, c.list);
    expect(c.calls()).toBe(2);
  });
});
