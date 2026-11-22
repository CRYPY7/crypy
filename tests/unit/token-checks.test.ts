import { afterAll, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

process.env.PGLITE_DIR = "memory";
const { liveChains } = await import("@/config/chains");
const { allCuratedTokens, chainKeyFromSlug, chainSlugs, curatedTokens, findCuratedToken } =
  await import("@/config/seo-pages");
const { formatTax, measuredTaxes, sellStatus } = await import("@/lib/token-checks/summary");
const { resetDb } = await import("@/server/db/client");
const checks = await import("@/server/services/token-checks");
import type { SecurityReport, TradeOutcome } from "@/lib/security/types";

function fakeReport(address: string, outcome: TradeOutcome = "ok", taxes = { buy: 0, sell: 0.003 }): SecurityReport {
  return {
    facts: {
      address,
      token: { name: "Test Token", symbol: "TST", decimals: 18, totalSupply: "1000" },
      trade: {
        outcome,
        venue: null,
        amountIn: null,
        nativeSymbol: "ETH",
        buyTax: outcome === "ok" ? taxes.buy : null,
        sellTax: outcome === "ok" ? taxes.sell : null,
        transferTax: outcome === "ok" ? 0 : null,
        reason: null,
      },
    },
    checks: [],
    counts: { critical: 0, high: 1, medium: 2, low: 0, passed: 3, unchecked: 0 },
    level: "warnings",
    comparison: null,
  } as unknown as SecurityReport;
}

describe("curated token list", () => {
  it("only lists each chain's well-known tokens, whose addresses are checked on-chain by the live tests", () => {
    for (const [chain, tokens] of Object.entries(curatedTokens)) {
      const config = liveChains.find((c) => c.key === chain);
      expect(config, chain).toBeDefined();
      const known = config!.commonTokens.map((a) => a.toLowerCase());
      for (const token of tokens) {
        expect(known, `${chain}/${token.slug}`).toContain(token.address.toLowerCase());
        expect(getAddress(token.address)).toBe(token.address);
        expect(token.slug).toMatch(/^[a-z0-9-]+$/);
      }
      expect(new Set(tokens.map((t) => t.slug)).size).toBe(tokens.length);
      expect(tokens.length).toBeGreaterThanOrEqual(8);
    }
    expect(allCuratedTokens()).toHaveLength(50);
  });

  it("maps readable chain names in links both ways", () => {
    for (const [key, slug] of Object.entries(chainSlugs)) expect(chainKeyFromSlug(slug)).toBe(key);
    expect(chainKeyFromSlug("bsc")).toBeUndefined();
    expect(findCuratedToken("bsc", "cake")?.symbol).toBe("CAKE");
    expect(findCuratedToken("bsc", "not-listed")).toBeUndefined();
  });
});

describe("which tokens are checked next", () => {
  const tokens = allCuratedTokens().slice(0, 5);
  const now = Date.UTC(2026, 10, 22, 12);
  const day = checks.CHECK_EVERY_MS;

  it("never-checked tokens first, then the oldest due ones; fresh ones wait", () => {
    const saved = new Map<string, Date>([
      [checks.checkId(tokens[0]!.chain, tokens[0]!.address), new Date(now - 2 * day)],
      [checks.checkId(tokens[1]!.chain, tokens[1]!.address), new Date(now - 1000)],
      [checks.checkId(tokens[2]!.chain, tokens[2]!.address), new Date(now - day - 5)],
    ]);
    const due = checks.dueTokens(tokens, saved, now, 10).map((t) => t.slug);
    expect(due).toEqual([tokens[3]!.slug, tokens[4]!.slug, tokens[0]!.slug, tokens[2]!.slug]);
    expect(due).not.toContain(tokens[1]!.slug);
    expect(checks.dueTokens(tokens, saved, now, 2)).toHaveLength(2);
  });

  it("matches saved checks regardless of letter case in the address", () => {
    const saved = new Map([[checks.checkId(tokens[0]!.chain, tokens[0]!.address.toUpperCase()), new Date(now)]]);
    expect(checks.dueTokens([tokens[0]!], saved, now, 5)).toEqual([]);
  });
});

describe("summaries shown in the list", () => {
  it("says whether the test trade could sell", () => {
    expect(sellStatus(fakeReport("0x1"))).toBe("yes");
    expect(sellStatus(fakeReport("0x1", "sell-failed"))).toBe("no");
    expect(sellStatus(fakeReport("0x1", "buy-failed"))).toBe("no");
    expect(sellStatus(fakeReport("0x1", "no-pool"))).toBe("no-pool");
    expect(sellStatus(fakeReport("0x1", "no-liquidity"))).toBe("no-pool");
    expect(sellStatus(fakeReport("0x1", "error"))).toBe("unchecked");
  });

  it("shows taxes only when the whole test trade ran", () => {
    expect(measuredTaxes(fakeReport("0x1"))).toEqual({ buy: 0, sell: 0.003, transfer: 0 });
    expect(measuredTaxes(fakeReport("0x1", "sell-failed"))).toBeNull();
    expect(formatTax(0.003, "en")).toBe("0.3%");
    expect(formatTax(0, "en")).toBe("0%");
  });
});

describe("saved checks (PGlite in memory, real migrations)", () => {
  afterAll(() => resetDb());
  const token = findCuratedToken("ethereum", "usdc")!;

  it("saves, updates and reads a check", async () => {
    expect(await checks.savedCheck("ethereum", token.address)).toBeNull();
    await checks.saveCheck("ethereum", token, fakeReport(token.address), new Date("2026-11-21T06:00:00Z"));
    await checks.saveCheck(
      "ethereum",
      token,
      fakeReport(token.address, "sell-failed"),
      new Date("2026-11-22T06:00:00Z"),
    );
    const saved = await checks.savedCheck("ethereum", token.address.toLowerCase());
    expect(saved?.slug).toBe("usdc");
    expect(saved?.checkedAt.toISOString()).toBe("2026-11-22T06:00:00.000Z");
    expect(saved?.report.facts.trade.outcome).toBe("sell-failed");
    expect(await checks.allSavedChecks()).toHaveLength(1);
  });

  it("a worker round checks due tokens and keeps going when one fails", async () => {
    const lookups = await import("@/server/services/lookups");
    const spy = vi
      .spyOn(lookups, "tokenSecurityReport")
      .mockImplementation(async (chain, address) => (address.endsWith("7") ? null : fakeReport(address)));
    const { checked, failed } = await checks.runDueTokenChecks(3);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(checked + failed.length).toBe(3);
    for (const call of spy.mock.calls) expect(call[2]).toBe("background");
    spy.mockRestore();
  });
});
