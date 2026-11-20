import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/security/evaluate";
import { holderParts, holderState, liquiditySummary, lockPart, poolSplit } from "@/lib/security/liquidity";
import type { LpHolder, PoolFact, TokenSecurityFacts } from "@/lib/security/types";
import { positionValue } from "@/server/chains/evm/security/lp-holders";
import { parseGoPlusLeads } from "@/server/security/external";

const NOW = 1_790_000_000; // seconds
const DAY = 86_400;
const A = "0x1111111111111111111111111111111111111111";

const holder = (over: Partial<LpHolder>): LpHolder => ({
  address: A,
  kind: "wallet",
  name: null,
  share: 0,
  lockRead: null,
  locks: [],
  ...over,
});
const lock = (share: number, days: number | null, vesting = false) => ({
  share,
  unlockAt: days === null ? null : NOW + days * DAY,
  vesting,
});
const pool = (usd: number, holders: LpHolder[], found?: number): PoolFact => ({
  dex: "PancakeSwap v2",
  protocol: "uniswap-v2",
  address: `0x${usd.toString(16).padStart(40, "0")}`,
  fee: null,
  listed: true,
  pairedWith: "WBNB",
  liquidityUsd: usd,
  holders: {
    kind: "lp-token",
    found: found ?? holders.reduce((s, h) => s + h.share, 0),
    holders,
    sources: ["known"],
  },
});

describe("liquidity parts", () => {
  it("locks: more than 30 days is locked; within 30 days is soon; past is ended; no end date is locked", () => {
    expect(lockPart(NOW + 31 * DAY, NOW)).toBe("locked");
    expect(lockPart(NOW + 12 * DAY, NOW)).toBe("soon");
    expect(lockPart(NOW - 1, NOW)).toBe("expired");
    expect(lockPart(null, NOW)).toBe("locked");
  });

  it("a locker's share is split by its locks; anything its locks don't cover is unknown", () => {
    const h = holder({ kind: "locker", share: 0.9, lockRead: "read", locks: [lock(0.6, 400), lock(0.2, 5)] });
    const parts = holderParts(h, NOW);
    expect(parts.map((p) => p.part)).toEqual(["soon", "locked", "unknown"]);
    expect(parts.find((p) => p.part === "unknown")!.share).toBeCloseTo(0.1);
    // Locks never count for more than the locker actually holds.
    const over = holderParts(holder({ kind: "locker", share: 0.5, lockRead: "read", locks: [lock(0.8, 400)] }), NOW);
    expect(over).toEqual([{ part: "locked", share: 0.5, unlockAt: NOW + 400 * DAY }]);
  });

  it("a locker whose terms couldn't be read is unknown, never protected", () => {
    expect(holderParts(holder({ kind: "locker", share: 0.7, lockRead: "unread" }), NOW)).toEqual([
      { part: "unknown", share: 0.7 },
    ]);
  });

  it("multisig: 2-of-3 is controlled; 1-of-n is one person's decision", () => {
    expect(holderState(holder({ kind: "multisig", share: 1, multisig: { threshold: 2, signers: 3 } }), NOW)).toBe(
      "controlled",
    );
    expect(holderState(holder({ kind: "multisig", share: 1, multisig: { threshold: 1, signers: 3 } }), NOW)).toBe(
      "removable",
    );
  });

  it("each kind maps to one part; the shown state is the holder's weakest part", () => {
    const kinds: [LpHolder["kind"], string][] = [
      ["burn", "burned"],
      ["timelock", "controlled"],
      ["farm", "controlled"],
      ["exchange", "controlled"],
      ["owner", "owner"],
      ["wallet", "removable"],
      ["token", "unknown"],
      ["contract", "unknown"],
    ];
    for (const [kind, part] of kinds) expect(holderState(holder({ kind, share: 0.1 }), NOW)).toBe(part);
    const mixed = holder({ kind: "locker", share: 0.5, lockRead: "read", locks: [lock(0.4, 400), lock(0.1, -2)] });
    expect(holderState(mixed, NOW)).toBe("expired");
  });

  it("a pool's split adds up to 1, with holders not found shown as such", () => {
    const p = pool(100_000, [holder({ kind: "burn", share: 0.5 }), holder({ kind: "wallet", share: 0.2 })], 0.7);
    const s = poolSplit(p, NOW);
    expect(s.burned).toBeCloseTo(0.5);
    expect(s.removable).toBeCloseTo(0.2);
    expect(s.notFound).toBeCloseTo(0.3);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(poolSplit({ ...p, holders: null }, NOW).notFound).toBe(1);
  });
});

describe("liquidity summary across pools", () => {
  it("weights pools by value, leaves out pools under $1,000, and finds the next unlock", () => {
    const big = pool(412_050, [
      holder({ kind: "locker", share: 0.842, lockRead: "read", locks: [lock(0.842, 114)] }),
      holder({ kind: "locker", share: 0.064, lockRead: "read", locks: [lock(0.064, 12)] }),
      holder({ kind: "multisig", share: 0.04, multisig: { threshold: 2, signers: 3 } }),
      holder({ kind: "contract", share: 0.034 }),
      holder({ kind: "burn", share: 0.011 }),
      holder({ kind: "wallet", share: 0.009 }),
    ]);
    const v3 = pool(86_200, [
      holder({ kind: "locker", share: 0.61, lockRead: "read", locks: [lock(0.61, 800)] }),
      holder({ kind: "owner", share: 0.29 }),
      holder({ kind: "wallet", share: 0.1 }),
    ]);
    const dust = pool(38, [holder({ kind: "owner", share: 1 })]);
    const s = liquiditySummary([big, v3, dust], NOW)!;
    expect(s.counted).toBe(2);
    expect(s.totalUsd).toBe(498_250);
    const w1 = 412_050 / 498_250;
    const w2 = 86_200 / 498_250;
    expect(s.split.burned + s.split.locked).toBeCloseTo(w1 * (0.842 + 0.011) + w2 * 0.61, 6);
    expect(s.split.soon).toBeCloseTo(w1 * 0.064, 6);
    expect(s.split.owner).toBeCloseTo(w2 * 0.29, 6);
    expect(s.nextUnlock).toEqual({ at: NOW + 12 * DAY, share: expect.closeTo(w1 * 0.064, 6) });
    expect(Object.values(s.split).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("no totals when every pool is under $1,000", () => {
    expect(liquiditySummary([pool(900, [holder({ kind: "burn", share: 1 })])], NOW)).toBeNull();
  });
});

function facts(pools: PoolFact[]): TokenSecurityFacts {
  return {
    chain: "bsc",
    address: A,
    block: "1",
    checkedAt: NOW * 1000,
    token: { name: "Harbor", symbol: "HBR", decimals: 18, totalSupply: "1" },
    priceUsd: 600,
    trade: {
      outcome: "ok",
      venue: null,
      amountIn: "1",
      nativeSymbol: "BNB",
      buyTax: 0,
      sellTax: 0,
      transferTax: 0,
      reason: null,
    },
    owner: { owner: null, renounced: true, ownerIsContract: null, roleBased: false },
    powers: [],
    proxy: { kind: null, implementation: null, admin: null },
    pools,
    source: { status: "verified", provider: "Sourcify" },
    external: null,
    externalStatus: "unavailable",
  };
}
const check = (pools: PoolFact[], id: string) => evaluate(facts(pools)).checks.find((c) => c.id === id);

describe("liquidity checks", () => {
  it("unlocking within 30 days: medium from 5% of all liquidity, low below", () => {
    const p = (share: number) =>
      pool(200_000, [
        holder({ kind: "burn", share: 1 - share }),
        holder({ kind: "locker", share, lockRead: "read", locks: [lock(share, 12)] }),
      ]);
    expect(check([p(0.064)], "lp.soon")).toMatchObject({ severity: "medium", values: { date: NOW + 12 * DAY } });
    expect(check([p(0.02)], "lp.soon")).toMatchObject({ severity: "low" });
  });

  it("ended locks count as removable", () => {
    const p = pool(200_000, [holder({ kind: "locker", share: 0.71, lockRead: "read", locks: [lock(0.71, -50)] })], 1);
    expect(check([p], "lp.expired")).toMatchObject({ severity: "high" });
    expect(check([p], "lp")).toMatchObject({ status: "risk" });
  });

  it("owner share below half: medium from 10%, low below", () => {
    const p = (owner: number) =>
      pool(200_000, [holder({ kind: "burn", share: 1 - owner }), holder({ kind: "owner", share: owner })]);
    expect(check([p(0.29)], "lp.owner")).toMatchObject({ severity: "medium" });
    expect(check([p(0.05)], "lp.owner")).toMatchObject({ severity: "low" });
    expect(check([p(0.6)], "lp")).toMatchObject({ severity: "high", values: { state: "owner" } });
  });

  it("unidentified contracts are a heuristic note; holders not found are 'not checked', never safe", () => {
    const p = pool(200_000, [holder({ kind: "burn", share: 0.9 }), holder({ kind: "contract", share: 0.034 })], 0.934);
    expect(check([p], "lp.unknown")).toMatchObject({ severity: "low", class: "heuristic" });
    expect(check([p], "lp.coverage")).toMatchObject({ status: "unchecked", values: { share: "6.6%" } });
    expect(check([p], "lp")).toMatchObject({ status: "pass" });
  });
});

describe("GoPlus leads", () => {
  it("keeps only well-formed addresses, lowercased, and never anything else", () => {
    const leads = parseGoPlusLeads({
      lp_holders: [
        { address: "0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83", tag: "UNCX", is_locked: 1 },
        { address: "javascript:alert(1)" },
        { address: 42 },
      ],
      dex: [{ pair: "0x231d9e7181e8479a8b40930961e93e7ed798542c", name: "PancakeV2" }, { pair: "nope" }],
    });
    expect(leads).toEqual({
      lpHolders: ["0xc765bddb93b0d1c1a88282ba0fa6b2d00e3e0c83"],
      pairs: ["0x231d9e7181e8479a8b40930961e93e7ed798542c"],
    });
    expect(parseGoPlusLeads({})).toEqual({ lpHolders: [], pairs: [] });
  });
});

describe("v3 position value", () => {
  const Q96 = 2n ** 96n;
  it("in range: both sides, value in token1 units", () => {
    // Price 1 (tick 0), range ±10% around it.
    const v = positionValue(1_000_000n, -1000, 1000, Q96);
    const a = Math.pow(1.0001, -500);
    const b = Math.pow(1.0001, 500);
    expect(v).toBeCloseTo(1_000_000 * (1 - a) + (1_000_000 * (b - 1)) / b, 3);
  });
  it("out of range: all in one token", () => {
    expect(positionValue(1_000_000n, 1000, 2000, Q96)).toBeGreaterThan(0); // all token0, priced at 1
    expect(positionValue(1_000_000n, -2000, -1000, Q96)).toBeGreaterThan(0); // all token1
    expect(positionValue(0n, -1000, 1000, Q96)).toBe(0);
  });
});
