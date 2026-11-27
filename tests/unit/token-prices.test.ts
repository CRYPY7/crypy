import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { resetDb, getDb } = await import("@/server/db/client");
const { tokens } = await import("@/server/db/schema");
const { resetPriceMemory, resetTokenMemory, tokenDetails, tokensToReprice, storedPrices } =
  await import("@/server/tokens/registry");
const { FRESH_MS, NO_PRICE_MS, STALE_MS, pricesFor, resetNativePrices } = await import("@/server/tokens/prices");

const A = "0x1111111111111111111111111111111111111111";
const SPAM = "0x2222222222222222222222222222222222222222";
const WELL_KNOWN = "0x3333333333333333333333333333333333333333";
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
const T0 = Date.now();

/** Registry rows for the tokens (prices are kept on a token's row). */
async function register(...addresses: string[]) {
  await tokenDetails(
    "bsc",
    addresses,
    async (list) => new Map(list.map((a) => [a, { name: "T", symbol: "T", decimals: 18 }] as const)),
    undefined,
    T0,
  );
  await settle();
}

/** A live pricer that records what it was asked; A costs 2, the native coin 600, nothing else has a pool. */
function engine(fail = false) {
  const asked: string[][] = [];
  const live = async (list: { address: string }[]) => {
    asked.push(list.map((t) => t.address.toLowerCase()));
    if (fail) throw new Error("nodes down");
    const out = new Map<string, { usd: number }>([["native", { usd: 600 }]]);
    if (list.some((t) => t.address.toLowerCase() === A)) out.set(A, { usd: 2 });
    return out;
  };
  return { live, asked };
}

const list = (...addresses: string[]) => addresses.map((address) => ({ address, decimals: 18 }));

describe("stored prices (R1 part 2)", () => {
  beforeEach(async () => {
    resetTokenMemory();
    resetPriceMemory();
    resetNativePrices();
    const db = await getDb();
    await db.delete(tokens);
    await register(A, SPAM, WELL_KNOWN);
  });
  afterAll(() => resetDb());

  it("prices live once; a fresh stored price is reused; spam's 'no price' is remembered", async () => {
    const first = engine();
    const p1 = await pricesFor("bsc", list(A, SPAM), first.live, { now: T0 });
    expect(p1?.get(A)).toEqual({ usd: 2 });
    expect(p1?.has(SPAM)).toBe(false);
    expect(p1?.get("native")).toEqual({ usd: 600 });
    await settle();

    const second = engine();
    const p2 = await pricesFor("bsc", list(A, SPAM), second.live, { now: T0 + 10_000 });
    expect(second.asked).toEqual([]); // stored price, remembered "no price", native from memory
    expect(p2?.get(A)).toEqual({ usd: 2 });

    // From the database too (as after a restart).
    resetPriceMemory();
    expect((await storedPrices("bsc", [A, SPAM])).get(SPAM)).toEqual({ usd: null, at: T0 });

    // Old enough: priced live again (a price after 3 minutes, "no price" after 6 hours).
    const soon = engine();
    await pricesFor("bsc", list(A, SPAM), soon.live, { now: T0 + FRESH_MS + 1 });
    expect(soon.asked).toEqual([[A]]);
    await settle();
    const later = engine();
    await pricesFor("bsc", list(SPAM), later.live, { now: T0 + NO_PRICE_MS + 1 });
    expect(later.asked).toEqual([[SPAM]]);
  });

  it("never marks a chain's well-known tokens as 'no price'", async () => {
    const first = engine();
    await pricesFor("bsc", list(WELL_KNOWN), first.live, { now: T0, keepTokens: new Set([WELL_KNOWN]) });
    const second = engine();
    await pricesFor("bsc", list(WELL_KNOWN), second.live, { now: T0 + 1000, keepTokens: new Set([WELL_KNOWN]) });
    expect(second.asked).toEqual([[WELL_KNOWN]]);
  });

  it("when live pricing fails, uses stored prices up to an hour old, and says nothing could be priced otherwise", async () => {
    await pricesFor("bsc", list(A), engine().live, { now: T0 });
    await settle();
    const failing = engine(true);
    const p = await pricesFor("bsc", list(A), failing.live, { now: T0 + FRESH_MS + 1 });
    expect(p?.get(A)).toEqual({ usd: 2 });
    expect(p?.get("native")).toEqual({ usd: 600 }); // the last native price
    resetNativePrices();
    expect(await pricesFor("bsc", list(A), failing.live, { now: T0 + STALE_MS + 1 })).toBeNull();
  });

  it("the price job's list: recently used tokens with a price getting old", async () => {
    await pricesFor("bsc", list(A, SPAM), engine().live, { now: T0 });
    await settle();
    const due = await tokensToReprice(
      "bsc",
      { usedWithinMs: 7 * 24 * 3_600_000, olderThanMs: 60_000, limit: 10 },
      T0 + 2 * 60_000,
    );
    expect(due).toEqual([{ address: A, decimals: 18 }]); // not the spam token, which has no price
    expect(
      await tokensToReprice("bsc", { usedWithinMs: 7 * 24 * 3_600_000, olderThanMs: 60_000, limit: 10 }, T0 + 30_000),
    ).toEqual([]);
  });
});
