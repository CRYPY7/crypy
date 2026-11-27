import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { resetDb, getDb } = await import("@/server/db/client");
const { tokens } = await import("@/server/db/schema");
const { KEEP_MS, UNREADABLE_RETRY_MS, pruneTokens, resetTokenMemory, tokenDetails } =
  await import("@/server/tokens/registry");
type Details = { name: string; symbol: string; decimals: number };

const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const SPAM = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

/** A chain reader that records what it was asked. */
function reader(answers: Record<string, Details | null>) {
  const asked: string[][] = [];
  const read = async (addresses: string[]) => {
    asked.push(addresses);
    return new Map(addresses.filter((a) => a in answers).map((a) => [a, answers[a]!] as const));
  };
  return { read, asked };
}

describe("shared token registry (PGlite in memory, real migrations)", () => {
  beforeEach(async () => {
    resetTokenMemory();
    const db = await getDb();
    await db.delete(tokens);
  });
  afterAll(() => resetDb());

  it("reads a token from the chain once; memory, then the database, answer after that", async () => {
    const usdt = { name: "Tether USD", symbol: "USDT", decimals: 6 };
    const chain = reader({ [USDT.toLowerCase()]: usdt });
    expect((await tokenDetails("ethereum", [USDT], chain.read)).get(USDT.toLowerCase())).toEqual(usdt);
    await settle();
    expect(await tokenDetails("ethereum", [USDT], chain.read)).toEqual(new Map([[USDT.toLowerCase(), usdt]]));
    resetTokenMemory(); // as after a restart: the database answers
    expect((await tokenDetails("ethereum", [USDT], chain.read)).get(USDT.toLowerCase())).toEqual(usdt);
    expect(chain.asked).toEqual([[USDT.toLowerCase()]]);
    // Chains are kept apart.
    await tokenDetails("bsc", [USDT], chain.read);
    expect(chain.asked).toHaveLength(2);
  });

  it("remembers unreadable contracts for a day, then asks again; a failed read isn't remembered", async () => {
    const now = Date.now();
    const chain = reader({ [SPAM]: null });
    expect((await tokenDetails("bsc", [SPAM], chain.read, undefined, now)).get(SPAM)).toBeNull();
    await settle();
    resetTokenMemory();
    await tokenDetails("bsc", [SPAM], chain.read, undefined, now + 1000);
    expect(chain.asked).toHaveLength(1);
    await tokenDetails("bsc", [SPAM], chain.read, undefined, now + UNREADABLE_RETRY_MS + 1000);
    expect(chain.asked).toHaveLength(2);
    // A reader that fails: nothing stored, asked again next time.
    let failures = 0;
    const failing = async () => {
      failures++;
      throw new Error("node down");
    };
    expect((await tokenDetails("bsc", [OTHER], failing)).has(OTHER)).toBe(false);
    await tokenDetails("bsc", [OTHER], failing);
    expect(failures).toBe(2);
  });

  it("stores details given by Alchemy without asking the chain; readable details are never overwritten by 'unreadable'", async () => {
    const given = new Map([[OTHER, { name: "Other", symbol: "OTH", decimals: 18 }]]);
    const chain = reader({});
    expect((await tokenDetails("base", [OTHER], chain.read, given)).get(OTHER)?.symbol).toBe("OTH");
    expect(chain.asked).toHaveLength(0);
    await settle();
    // Even if a later read says "unreadable", the stored details stay.
    resetTokenMemory();
    const later = Date.now() + 2 * UNREADABLE_RETRY_MS;
    const db = await getDb();
    const [row] = await db.select().from(tokens);
    expect(row).toMatchObject({ chain: "base", address: OTHER, symbol: "OTH", source: "alchemy", unreadable: false });
    expect(
      (await tokenDetails("base", [OTHER], reader({ [OTHER]: null }).read, undefined, later)).get(OTHER)?.symbol,
    ).toBe("OTH");
  });

  it("deletes tokens nobody looked at for 90 days", async () => {
    const now = Date.now();
    await tokenDetails(
      "ethereum",
      [USDT],
      reader({ [USDT.toLowerCase()]: { name: "T", symbol: "T", decimals: 6 } }).read,
      undefined,
      now - KEEP_MS - 1000,
    );
    await tokenDetails(
      "ethereum",
      [OTHER],
      reader({ [OTHER]: { name: "O", symbol: "O", decimals: 6 } }).read,
      undefined,
      now,
    );
    await settle();
    await pruneTokens(now);
    const db = await getDb();
    expect((await db.select({ address: tokens.address }).from(tokens)).map((r) => r.address)).toEqual([OTHER]);
  });
});
