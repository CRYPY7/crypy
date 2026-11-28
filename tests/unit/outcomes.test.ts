import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  classifyActivity,
  classifyApprovals,
  classifyGas,
  classifyOverview,
  classifyPortfolioBalances,
  classifyPortfolioSafety,
  classifySearch,
  classifyTokenSecurity,
  cleanReason,
  errorOutcome,
  toolForRoute,
} from "@/lib/outcomes/classify";

process.env.PGLITE_DIR = "memory";
process.env.CRYPY_OUTCOMES = "off";
const { resetDb, getDb } = await import("@/server/db/client");
const { visitorOutcomes } = await import("@/server/db/schema");
const rec = await import("@/server/outcomes/record");
const store = await import("@/server/outcomes/store");

describe("classifying what a visitor got", () => {
  it("balances: full, partial with chain-level reasons, error when no chain answered", () => {
    const ok = { chain: "ethereum", coverage: "full" };
    expect(classifyOverview({ chains: [ok], unavailable: [], pricesAvailable: true })).toEqual({
      outcome: "full",
      reasons: [],
    });
    expect(
      classifyOverview({
        chains: [ok, { chain: "bsc", coverage: "common-only" }],
        unavailable: ["base"],
        pricesAvailable: false,
      }),
    ).toEqual({
      outcome: "partial",
      reasons: ["chain unavailable: base", "token list common-only: bsc", "prices unavailable"],
    });
    expect(classifyOverview({ chains: [], unavailable: ["ethereum"], pricesAvailable: true }).outcome).toBe("error");
  });

  it("approvals: GoPlus not ok or recent events not searched make it partial", () => {
    const chain = (goplus: string, recentLogs = true) => ({ chain: "bsc", sources: { goplus, recentLogs } });
    expect(classifyApprovals({ chains: [chain("ok")], unavailable: [] }).outcome).toBe("full");
    // No tokens held on the chain: nothing to search, not a partial result.
    expect(
      classifyApprovals({
        chains: [{ chain: "arbitrum", sources: { goplus: "ok", recentLogs: false, knownSpenders: false } }],
        unavailable: [],
      }).outcome,
    ).toBe("full");
    expect(classifyApprovals({ chains: [chain("unavailable", false)], unavailable: [] })).toEqual({
      outcome: "partial",
      reasons: ["goplus unavailable: bsc", "recent events not searched: bsc"],
    });
  });

  it("activity, token security, gas, search, portfolio", () => {
    expect(classifyActivity({ chains: [{ chain: "ethereum", source: "recent" }] }).reasons).toEqual([
      "history recent: ethereum",
    ]);
    expect(classifyActivity({ chains: [{ chain: "ethereum", source: "unavailable" }] }).outcome).toBe("error");
    // "Not a token" is an answer, not a failure (the owner's audit asked for two on purpose).
    expect(classifyTokenSecurity(null).outcome).toBe("full");
    expect(classifyTokenSecurity({ facts: { externalStatus: "unavailable" } }).outcome).toBe("partial");
    expect(classifyTokenSecurity({ facts: { externalStatus: "not-listed" } }).outcome).toBe("full");
    expect(classifyGas({ chains: [], unavailable: ["base"] }).outcome).toBe("error");
    expect(classifySearch({ status: "address", unavailable: ["polygon"] }).outcome).toBe("partial");
    expect(classifySearch({ status: "not-found", unavailable: [] }).outcome).toBe("full");
    const overview = { chains: [{ chain: "ethereum", coverage: "full" }], unavailable: [], pricesAvailable: true };
    expect(classifyPortfolioBalances({ overview }).outcome).toBe("full");
    expect(classifyPortfolioSafety({ approvals: null, flagged: { skipped: 2 } }).reasons).toEqual([
      "approvals not checked",
      "token flags partly skipped",
    ]);
    expect(classifyPortfolioSafety({ approvals: { partial: false }, flagged: { skipped: 0 } }).outcome).toBe("full");
  });

  it("reasons never carry addresses, hashes, URLs or long numbers", () => {
    const text = cleanReason(
      "failed for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 tx 0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060 at https://eth-mainnet.g.alchemy.com/v2/KEY block 19000000",
    );
    expect(text).toBe("failed for 0x… tx 0x… at <url> block <n>");
    expect(errorOutcome(new TypeError("Cannot convert undefined to a BigInt"))).toEqual({
      outcome: "error",
      reasons: ["TypeError: Cannot convert undefined to a BigInt"],
    });
  });

  it("maps routes to tools", () => {
    expect(toolForRoute("/[locale]/address/[address]/approvals")).toBe("approvals");
    expect(toolForRoute("/[locale]/address/[address]")).toBe("balances");
    expect(toolForRoute("/api/v1/token/[chain]/[address]/security")).toBe("token-security");
    expect(toolForRoute("/api/v1/watchlist/[id]")).toBe("account");
    expect(toolForRoute("/[locale]/learn/[slug]")).toBeNull();
  });
});

describe("counting and saving", () => {
  beforeEach(() => rec.resetOutcomes());
  afterAll(() => resetDb());

  it("observe passes results and errors through unchanged and counts both", async () => {
    const t0 = Date.now();
    expect(
      await rec.observe(
        "gas",
        async () => 42,
        () => ({ outcome: "full", reasons: [] }),
      ),
    ).toBe(42);
    await expect(
      rec.observe(
        "gas",
        async () => Promise.reject(new Error("boom 0xabcdef0123")),
        () => ({ outcome: "full", reasons: [] }),
      ),
    ).rejects.toThrow("boom");
    // A classifier that throws never breaks the answer.
    expect(
      await rec.observe(
        "gas",
        async () => "x",
        () => {
          throw new Error("bad classifier");
        },
      ),
    ).toBe("x");
    const rows = rec.drainOutcomes();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bucket).toBe(rec.bucketOf(t0));
    expect(rows[0]!.tally).toMatchObject({ full: 1, errors: 1, reasons: { "Error: boom 0x…": 1 } });
  });

  it("keeps at most 12 reasons per bucket and counts the rest as other", () => {
    for (let i = 0; i < 15; i++) rec.recordOutcome("search", { outcome: "partial", reasons: [`r${i}`] }, 10);
    const [row] = rec.drainOutcomes();
    expect(Object.keys(row!.tally.reasons)).toHaveLength(13);
    expect(row!.tally.reasons.other).toBe(3);
    expect(row!.tally.partial).toBe(15);
  });

  it("saving adds counts and reasons to what is already saved", async () => {
    const now = Date.parse("2026-11-24T10:02:00Z");
    rec.recordOutcome("balances", { outcome: "partial", reasons: ["chain unavailable: bsc"] }, 4_000, now);
    rec.recordOutcome("balances", { outcome: "full", reasons: [] }, 100, now);
    expect(await store.saveOutcomes()).toBe(1);
    rec.recordOutcome(
      "balances",
      { outcome: "partial", reasons: ["chain unavailable: bsc", "prices unavailable"] },
      50,
      now,
    );
    rec.recordOutcome("balances", { outcome: "error", reasons: ["all chains unavailable"] }, 50, now);
    await store.saveOutcomes();
    const db = await getDb();
    const [row] = await db.select().from(visitorOutcomes);
    expect(row).toMatchObject({ full: 1, partial: 2, errors: 1, slow: 1, totalMs: 4_200 });
    expect(row!.reasons).toEqual({
      "chain unavailable: bsc": 2,
      "prices unavailable": 1,
      "all chains unavailable": 1,
    });
    const [summary] = await store.outcomesSince(now - 3_600_000);
    expect(summary).toMatchObject({ tool: "balances", total: 4, errors: 1, averageMs: 1_050 });
    expect(summary!.reasons[0]).toEqual({ reason: "chain unavailable: bsc", count: 2 });
  });
});

describe("owner messages", () => {
  const s = (tool: "gas" | "search", total: number, errors: number) => ({
    tool,
    total,
    full: total - errors,
    partial: 0,
    errors,
    slow: 0,
    averageMs: 100,
    reasons: errors ? [{ reason: "boom", count: errors }] : [],
  });

  it("over 2% with at least 3 errors is a problem; one message when it starts, one when it stops", () => {
    const state = new Map();
    expect(store.isFailing(s("gas", 1000, 20))).toBe(false); // exactly 2%
    expect(store.isFailing(s("gas", 10, 2))).toBe(false); // too few errors to tell
    const start = store.outcomeTransitions([s("gas", 100, 5), s("search", 100, 0)], state, 1_000);
    expect(start).toEqual([{ tool: "gas", kind: "problem", errors: 5, total: 100, reason: "boom", minutes: null }]);
    expect(store.outcomeTransitions([s("gas", 100, 6)], state, 61_000)).toEqual([]);
    expect(store.outcomeTransitions([s("gas", 100, 1)], state, 1_000 + 15 * 60_000)).toEqual([
      { tool: "gas", kind: "fixed", errors: 0, total: 0, reason: null, minutes: 15 },
    ]);
  });

  it("R3: chains still being read make a partial answer, never an error", async () => {
    const { classifyOverview } = await import("@/lib/outcomes/classify");
    expect(classifyOverview({ chains: [], unavailable: [], pricesAvailable: true, pending: ["polygon"] })).toEqual({
      outcome: "partial",
      reasons: ["chain still reading: polygon"],
    });
  });
});
