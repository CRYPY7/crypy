import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// The page cache isn't available outside Next.js: the services' cache lifetimes do nothing here.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
// Token security's rules need full facts; here only the saving matters, so the report is the facts plus empty checks.
vi.mock("@/lib/security/evaluate", () => ({
  evaluate: (facts: unknown) => ({
    facts,
    checks: [],
    counts: { critical: 0, high: 0, medium: 0, low: 0, passed: 0, unchecked: 0 },
    level: "none-found",
    comparison: null,
  }),
}));
process.env.PGLITE_DIR = "memory";

const { resetDb } = await import("@/server/db/client");
const { registry } = await import("@/server/chains/registry");
const { cachedGas } = await import("@/server/services/gas");
const { cachedApprovals } = await import("@/server/services/approvals");
const { cachedActivity } = await import("@/server/services/activity");
const { cachedTokenSecurity, cachedTxDetails, resolveAddressPage } = await import("@/server/services/lookups");
const { pageOverview } = await import("@/server/services/overview");
const { resetFreshOrSaved } = await import("@/server/saved/fresh-or-saved");
import type { TokenSecurityFacts } from "@/lib/security/types";

/**
 * Stabilization S2 on every tool: a chain that fails now shows its last good reading, marked as saved; a partial
 * check is never saved for the safety tools. Chain adapters are stubbed; the database is PGlite with real migrations.
 */
const evm = registry.adapters.find((a) => a.family === "evm")!;
const OWNER = "0x1111111111111111111111111111111111111111";
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const failOn = (chains: string[]) => (chain: { key: string }) => chains.includes(chain.key);

afterEach(() => {
  vi.restoreAllMocks();
  resetFreshOrSaved();
});
afterAll(() => resetDb());

describe("saved results in the services", () => {
  it("gas: a chain that fails now shows its last reading, marked as saved", async () => {
    const down: string[] = [];
    vi.spyOn(evm, "getGas").mockImplementation(async (chain) => {
      if (failOn(down)(chain)) throw new Error("all providers down");
      return {
        chain: chain.key,
        history: { baseFees: [1e9, 1e9], rewards: [[1e8, 2e8, 3e8]], newestBlock: 100 },
        checkedAt: Date.now(),
        spanSeconds: 12,
        coinUsd: 1,
        l1Fees: null,
      } as never;
    });
    const first = await cachedGas();
    expect(first.chains.every((c) => !c.saved)).toBe(true);
    await settle();
    resetFreshOrSaved();
    resetFreshOrSaved();
    down.push("bsc");
    const later = await cachedGas();
    expect(later.unavailable).toEqual([]);
    expect(later.chains.find((c) => c.chain === "bsc")?.saved).toBe(true);
    expect(later.chains.find((c) => c.chain === "ethereum")?.saved).toBeUndefined();
  });

  it("approvals: only complete checks are saved, and a failed chain shows the saved one", async () => {
    let goplus: "ok" | "partial" = "ok";
    const down: string[] = [];
    vi.spyOn(evm, "getBalances").mockRejectedValue(new Error("not needed"));
    vi.spyOn(evm, "getApprovals").mockImplementation(async (chain) => {
      if (failOn(down)(chain)) throw new Error("all providers down");
      return {
        chain: chain.key,
        owner: OWNER,
        block: "1",
        approvals: [],
        sources: { goplus, recentLogs: true, knownSpenders: true },
      } as never;
    });
    await cachedApprovals(OWNER, ["ethereum", "bsc"]);
    await settle();
    resetFreshOrSaved();
    // A later partial check (GoPlus partial) on Ethereum isn't saved; then both chains fail.
    goplus = "partial";
    await cachedApprovals(OWNER, ["ethereum"]);
    await settle();
    resetFreshOrSaved();
    down.push("ethereum", "bsc");
    const later = await cachedApprovals(OWNER, ["ethereum", "bsc"]);
    expect(later.unavailable).toEqual([]);
    expect(Object.keys(later.saved ?? {}).sort()).toEqual(["bsc", "ethereum"]);
    expect(later.chains.find((c) => c.chain === "ethereum")?.sources.goplus).toBe("ok");
    // A chain never checked in full stays "not checked".
    const other = await cachedApprovals("0x2222222222222222222222222222222222222222", ["bsc"]);
    expect(other.unavailable).toEqual(["bsc"]);
    expect(other.saved).toBeUndefined();
  });

  it("activity: the first page of a failed chain comes from the saved one; older pages never do", async () => {
    const down: string[] = [];
    vi.spyOn(evm, "getBalances").mockRejectedValue(new Error("not needed"));
    vi.spyOn(evm, "getActivity").mockImplementation(async (chain) => {
      if (failOn(down)(chain)) throw new Error("all providers down");
      return {
        chain: { chain: chain.key, source: "history", next: 50, first: null, internalIncluded: true },
        transfers: [{ id: `${chain.key}-1`, chain: chain.key, block: 60, time: 1 }],
      } as never;
    });
    await cachedActivity(OWNER, null, ["ethereum"]);
    await settle();
    resetFreshOrSaved();
    down.push("ethereum");
    const later = await cachedActivity(OWNER, null, ["ethereum"]);
    expect(later.saved?.ethereum).toBeTruthy();
    expect(later.chains[0]?.source).toBe("history");
    expect(later.transfers.map((t) => t.id)).toEqual(["ethereum-1"]);
    const older = await cachedActivity(OWNER, "ethereum:50", ["ethereum"]);
    expect(older.saved).toBeUndefined();
    expect(older.chains[0]?.source).toBe("unavailable");
  });

  it("token security: a failed check shows the last complete report with its time; a partial one isn't saved", async () => {
    const TOKEN = "0x3333333333333333333333333333333333333333";
    let mode: "ok" | "goplus-down" | "throw" = "goplus-down";
    const facts = (external: TokenSecurityFacts["externalStatus"]) =>
      ({ chain: "ethereum", address: TOKEN, externalStatus: external }) as unknown as TokenSecurityFacts;
    vi.spyOn(evm, "getTokenSecurity").mockImplementation(async () => {
      if (mode === "throw") throw new Error("all providers down");
      return facts(mode === "ok" ? "ok" : "unavailable");
    });
    // Partial (GoPlus down) isn't saved: a failure afterwards has nothing to show.
    expect((await cachedTokenSecurity("ethereum", TOKEN))?.facts.externalStatus).toBe("unavailable");
    await settle();
    resetFreshOrSaved();
    mode = "throw";
    await expect(cachedTokenSecurity("ethereum", TOKEN)).rejects.toThrow("all providers down");
    // A complete report is saved; the next failure shows it, marked with its time.
    mode = "ok";
    expect((await cachedTokenSecurity("ethereum", TOKEN))?.savedAt).toBeUndefined();
    await settle();
    resetFreshOrSaved();
    mode = "throw";
    const saved = await cachedTokenSecurity("ethereum", TOKEN);
    expect(saved?.savedAt).toBeTruthy();
  });

  it("address overview: a failed chain shows its last reading; a slow one shows it while the fresh read finishes", async () => {
    const ADDRESS = "0x4444444444444444444444444444444444444444";
    let mode: "ok" | "down" | "slow" = "ok";
    let price = 2;
    vi.spyOn(evm, "getBalances").mockImplementation(async (chain) => {
      if (chain.key === "bsc" && mode === "down") throw new Error("all providers down");
      if (chain.key === "bsc" && mode === "slow") await new Promise((resolve) => setTimeout(resolve, 3_000));
      return { chain: chain.key, native: { raw: "1000", decimals: 3 }, tokens: [], coverage: "full" } as never;
    });
    vi.spyOn(evm, "getUsdPrices").mockImplementation(async () => new Map([["native", { usd: price }]]));
    const first = await pageOverview(ADDRESS, ["ethereum", "bsc"]);
    expect(first.saved).toBeUndefined();
    expect(first.totalUsd).toBe(4);
    await settle();
    resetFreshOrSaved();
    // BNB Chain fails: its saved reading fills in (value at the old price), marked as saved.
    mode = "down";
    price = 3;
    const down = await pageOverview(ADDRESS, ["ethereum", "bsc"]);
    expect(down.unavailable).toEqual([]);
    expect(Object.keys(down.saved ?? {})).toEqual(["bsc"]);
    expect(down.totalUsd).toBe(5);
    resetFreshOrSaved();
    // BNB Chain is slow: the saved reading comes at once, marked as refreshing.
    mode = "slow";
    const started = Date.now();
    const slow = await pageOverview(ADDRESS, ["ethereum", "bsc"]);
    expect(Date.now() - started).toBeLessThan(2_900);
    expect(Object.keys(slow.refreshing ?? {})).toEqual(["bsc"]);
    expect(slow.saved).toBeUndefined();
    // When the fresh read is done, the next request gets it at once.
    await new Promise((resolve) => setTimeout(resolve, 700));
    const after = await pageOverview(ADDRESS, ["ethereum", "bsc"]);
    expect(after.refreshing).toBeUndefined();
    expect(after.totalUsd).toBe(6);
  }, 15_000);

  it("address overview: readings without prices are never saved; a lesser one never replaces a complete one", async () => {
    const ADDRESS = "0x5555555555555555555555555555555555555555";
    let coverage = "full";
    let prices = true;
    let down = false;
    vi.spyOn(evm, "getBalances").mockImplementation(async (chain) => {
      if (down) throw new Error("all providers down");
      return { chain: chain.key, native: { raw: "1000", decimals: 3 }, tokens: [], coverage } as never;
    });
    vi.spyOn(evm, "getUsdPrices").mockImplementation(async () => {
      if (!prices) throw new Error("no prices");
      return new Map([["native", { usd: coverage === "full" ? 10 : 1 }]]);
    });
    await pageOverview(ADDRESS, ["base"]);
    await settle();
    resetFreshOrSaved();
    coverage = "truncated";
    await pageOverview(ADDRESS, ["base"]);
    await settle();
    resetFreshOrSaved();
    prices = false;
    await pageOverview(ADDRESS, ["base"]);
    await settle();
    resetFreshOrSaved();
    down = true;
    const result = await pageOverview(ADDRESS, ["base", "arbitrum"]);
    expect(result.chains.find((c) => c.chain === "base")?.totalUsd).toBe(10);
    expect(result.unavailable).toEqual(["arbitrum"]);
  });

  it("transaction: a confirmed one is saved and shown when the chain can't be read; a pending one never is", async () => {
    const HASH = "0x" + "ab".repeat(32);
    const PENDING = "0x" + "cd".repeat(32);
    let down = false;
    vi.spyOn(evm, "getTransactionDetails").mockImplementation(async (_chain, hash) => {
      if (down) throw new Error("all providers down");
      return {
        hash,
        status: hash === PENDING ? "pending" : "success",
        confirmations: hash === PENDING ? null : 1_000,
        finalized: hash === PENDING ? null : true,
      } as never;
    });
    await cachedTxDetails("ethereum", HASH);
    await cachedTxDetails("ethereum", PENDING);
    await settle();
    down = true;
    const saved = await cachedTxDetails("ethereum", HASH);
    expect(saved?.savedAt).toBeTruthy();
    expect(saved?.status).toBe("success");
    await expect(cachedTxDetails("ethereum", PENDING)).rejects.toThrow("all providers down");
  });

  it("address page: when no chain answers the lookup, a valid address still opens (its saved readings can show)", async () => {
    vi.spyOn(evm, "lookupAddress").mockRejectedValue(new Error("all providers down"));
    const result = await resolveAddressPage("0x6666666666666666666666666666666666666666");
    expect(result.status).toBe("address");
    if (result.status !== "address") return;
    expect(result.lookups).toEqual([]);
    expect(result.unavailable.length).toBeGreaterThan(0);
    // A mistyped checksum still isn't opened.
    const typo = await resolveAddressPage("0x8894E0a0c962CB723c1976a4421c95949bE2D4e3");
    expect(typo.status).not.toBe("address");
  });
});
