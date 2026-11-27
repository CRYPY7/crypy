import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { resetDb, getDb } = await import("@/server/db/client");
const { savedResults } = await import("@/server/db/schema");
const { parseDiscoveryPage, discoverTokens, MAX_PAGES } = await import("@/server/chains/evm/wallet-discovery");
const { discoverWalletChains, walletChains, resetWalletChains, FRESH_MS } =
  await import("@/server/wallet/activity-map");
const { saveResults, pruneSaved } = await import("@/server/saved/store");

const OWNER = "0x00000000000000000000000000000000000000aa";
const TOKEN = "0x00000000000000000000000000000000000000bb";
const NETS = ["eth-mainnet", "bnb-mainnet", "base-mainnet", "arb-mainnet", "polygon-mainnet"];

function entry(network: string, balance: string, tokenAddress: string | null = TOKEN) {
  return { address: OWNER, network, tokenAddress, tokenBalance: balance };
}
function page(tokens: unknown[], pageKey?: string) {
  return { data: { tokens, ...(pageKey ? { pageKey } : {}) } };
}

describe("wallet discovery page", () => {
  it("finds networks with a non-zero token; zero, native and broken entries don't count; Polygon alias", () => {
    const parsed = parseDiscoveryPage(
      page([
        entry("eth-mainnet", "0x0"),
        entry("bnb-mainnet", "0x1"),
        entry("base-mainnet", "0x5", null),
        entry("arb-mainnet", "not-hex"),
        entry("matic-mainnet", "0x2a"),
      ]),
    );
    expect([...parsed.held].sort()).toEqual(["bnb-mainnet", "polygon-mainnet"]);
    expect(parsed.pageKey).toBeNull();
  });

  it("refuses an answer that isn't the expected shape", () => {
    expect(() => parseDiscoveryPage({ tokens: [] })).toThrow();
  });

  it("stops after MAX_PAGES and reports networks it couldn't confirm as unknown", async () => {
    let calls = 0;
    const found = await discoverTokens(OWNER, NETS, async () => {
      calls += 1;
      return page([entry("eth-mainnet", "0x1")], `next-${calls}`);
    });
    expect(calls).toBe(MAX_PAGES);
    expect([...found.held]).toEqual(["eth-mainnet"]);
    expect([...found.unknown].sort()).toEqual(NETS.filter((n) => n !== "eth-mainnet").sort());
  });

  it("stops early once every network has a token", async () => {
    let calls = 0;
    const found = await discoverTokens(OWNER, ["eth-mainnet", "bnb-mainnet"], async () => {
      calls += 1;
      return page([entry("eth-mainnet", "0x1"), entry("bnb-mainnet", "0x1")], "more");
    });
    expect(calls).toBe(1);
    expect(found.unknown.size).toBe(0);
  });

  it("a complete list leaves nothing unknown", async () => {
    const found = await discoverTokens(OWNER, NETS, async () => page([entry("base-mainnet", "0x9")]));
    expect([...found.held]).toEqual(["base-mainnet"]);
    expect(found.unknown.size).toBe(0);
  });
});

describe("activity map", () => {
  beforeEach(async () => {
    resetWalletChains();
    const db = await getDb();
    await db.delete(savedResults);
  });
  afterAll(() => resetDb());

  it("one discovery request answers every chain; no per-chain checks when the list is complete", async () => {
    const checked: string[] = [];
    const map = await discoverWalletChains(OWNER, {
      fetchPage: async () => page([entry("bnb-mainnet", "0x1"), entry("polygon-mainnet", "0x0")]),
      holdsCommon: async (chain) => (checked.push(chain.key), false),
    });
    expect(map).toMatchObject({ tokens: ["bsc"], unknown: [], source: "alchemy" });
    expect(checked).toEqual([]);
  });

  it("falls back to the well-known-token check on every chain when discovery fails", async () => {
    const map = await discoverWalletChains(OWNER, {
      fetchPage: async () => {
        throw new Error("down");
      },
      holdsCommon: async (chain) => {
        if (chain.key === "arbitrum") throw new Error("node down");
        return chain.key === "ethereum";
      },
    });
    expect(map.source).toBe("rpc");
    expect(map.tokens).toEqual(["ethereum"]);
    expect(map.unknown).toEqual(["arbitrum"]); // a failed check is never read as "empty"
  });

  it("a cut-off list: unconfirmed chains are checked another way and stay unknown unless that finds a token", async () => {
    const map = await discoverWalletChains(OWNER, {
      fetchPage: async () => page([entry("eth-mainnet", "0x1")], "more"),
      holdsCommon: async (chain) => chain.key === "base",
    });
    expect(map.source).toBe("mixed");
    expect(map.tokens).toEqual(["ethereum", "base"]);
    expect(map.unknown.sort()).toEqual(["arbitrum", "bsc", "polygon"]);
  });

  it("a stored map is used at once (memory, then the database after a restart)", async () => {
    const stored = { tokens: ["base"], unknown: [], source: "alchemy", checkedAt: new Date().toISOString() };
    await saveResults("wallet-chains", OWNER, [{ chain: "*", data: stored }]);
    expect(await walletChains(OWNER)).toEqual(stored);
    resetWalletChains();
    expect(await walletChains(OWNER.toUpperCase().replace("0X", "0x"))).toEqual(stored);
    expect(FRESH_MS).toBe(6 * 3_600_000);
  });

  it("the map is kept 30 days after the last lookup; other saved results 7 days", async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    const map = { tokens: [], unknown: [], source: "rpc", checkedAt: new Date(now).toISOString() };
    await saveResults("wallet-chains", OWNER, [{ chain: "*", data: map }]);
    await saveResults("gas", "all", [{ chain: "ethereum", data: {} }]);
    await pruneSaved(now + 10 * DAY);
    const db = await getDb();
    expect((await db.select().from(savedResults)).map((r) => r.kind)).toEqual(["wallet-chains"]);
    await pruneSaved(now + 31 * DAY);
    expect(await db.select().from(savedResults)).toEqual([]);
  });
});
