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
const { cachedTokenSecurity } = await import("@/server/services/lookups");
import type { TokenSecurityFacts } from "@/lib/security/types";

/**
 * Stabilization S2 on every tool: a chain that fails now shows its last good reading, marked as saved; a partial
 * check is never saved for the safety tools. Chain adapters are stubbed; the database is PGlite with real migrations.
 */
const evm = registry.adapters.find((a) => a.family === "evm")!;
const OWNER = "0x1111111111111111111111111111111111111111";
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const failOn = (chains: string[]) => (chain: { key: string }) => chains.includes(chain.key);

afterEach(() => vi.restoreAllMocks());
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
    // A later partial check (GoPlus partial) on Ethereum isn't saved; then both chains fail.
    goplus = "partial";
    await cachedApprovals(OWNER, ["ethereum"]);
    await settle();
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
    mode = "throw";
    await expect(cachedTokenSecurity("ethereum", TOKEN)).rejects.toThrow("all providers down");
    // A complete report is saved; the next failure shows it, marked with its time.
    mode = "ok";
    expect((await cachedTokenSecurity("ethereum", TOKEN))?.savedAt).toBeUndefined();
    await settle();
    mode = "throw";
    const saved = await cachedTokenSecurity("ethereum", TOKEN);
    expect(saved?.savedAt).toBeTruthy();
  });
});
