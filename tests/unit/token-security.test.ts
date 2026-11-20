/** Token security rules (pure), contract-code reading, GoPlus parsing and the trade-test build guard. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import goplus from "../fixtures/goplus-cake.json";
import { compare, evaluate } from "@/lib/security/evaluate";
import type { PoolFact, TokenSecurityFacts } from "@/lib/security/types";
import { hasSelfdestruct, minimalProxyTarget, powersIn, selectorsIn } from "@/server/chains/evm/security/bytecode";
import { taxOf } from "@/server/chains/evm/security/trade";
import { SOURCE_SHA256 } from "@/server/chains/evm/security/trade-test-v2";
import { parseGoPlus } from "@/server/security/external";

const OWNER = "0x1111111111111111111111111111111111111111";
/** Check time (ms). */
const NOW = 1_790_000_000_000;
function facts(over: Partial<TokenSecurityFacts> = {}): TokenSecurityFacts {
  return {
    chain: "bsc",
    address: "0x2222222222222222222222222222222222222222",
    block: "1",
    checkedAt: NOW,
    token: { name: "Example", symbol: "EXM", decimals: 18, totalSupply: "1000" },
    priceUsd: 500,
    trade: {
      outcome: "ok",
      venue: { dex: "PancakeSwap v2", protocol: "uniswap-v2", pool: OWNER, router: OWNER },
      amountIn: "1",
      nativeSymbol: "BNB",
      buyTax: 0,
      sellTax: 0,
      transferTax: 0,
      reason: null,
    },
    owner: { owner: null, renounced: false, ownerIsContract: null, roleBased: false },
    powers: [],
    proxy: { kind: null, implementation: null, admin: null },
    pools: [
      {
        dex: "PancakeSwap v2",
        protocol: "uniswap-v2",
        address: OWNER,
        fee: null,
        listed: true,
        pairedWith: "WBNB",
        liquidityUsd: 500_000,
        holders: lpHolders({ burn: 1 }),
      },
    ],
    source: { status: "verified", provider: "Sourcify" },
    external: null,
    externalStatus: "unavailable",
    ...over,
  };
}
/** Builds a pool's holders from simple shares; lockedFor = [share, days until unlock]. */
function lpHolders(shares: {
  burn?: number;
  owner?: number;
  wallet?: number;
  lockedFor?: [number, number];
}): PoolFact["holders"] {
  const now = Math.floor(NOW / 1000);
  const h: NonNullable<PoolFact["holders"]>["holders"] = [];
  const base = { name: null, lockRead: null, locks: [] };
  if (shares.burn)
    h.push({ ...base, address: "0x000000000000000000000000000000000000dEaD", kind: "burn", share: shares.burn });
  if (shares.owner) h.push({ ...base, address: OWNER, kind: "owner", share: shares.owner });
  if (shares.wallet) h.push({ ...base, address: OWNER, kind: "wallet", share: shares.wallet });
  if (shares.lockedFor) {
    const [share, days] = shares.lockedFor;
    h.push({
      ...base,
      address: OWNER,
      kind: "locker",
      name: "UNCX",
      share,
      lockRead: "read",
      locks: [{ share, unlockAt: now + days * 86_400, vesting: false }],
    });
  }
  return { kind: "lp-token", found: h.reduce((s, x) => s + x.share, 0), holders: h, sources: ["known"] };
}
const find = (r: ReturnType<typeof evaluate>, id: string) => r.checks.find((c) => c.id === id);

describe("evaluate", () => {
  it("a clean token: no risks found, never a safe verdict", () => {
    const r = evaluate(facts());
    expect(r.level).toBe("none-found");
    expect(r.counts.critical + r.counts.high + r.counts.medium).toBe(0);
    expect(find(r, "sell")).toMatchObject({ status: "pass", class: "simulated" });
  });

  it("selling blocked in the trade test is critical (serious risks)", () => {
    const r = evaluate(
      facts({ trade: { ...facts().trade, outcome: "sell-failed", sellTax: null, reason: "Trading not enabled" } }),
    );
    expect(r.level).toBe("serious");
    expect(find(r, "sell")).toMatchObject({
      status: "risk",
      severity: "critical",
      values: { reason: "Trading not enabled" },
    });
  });

  it("tax bands: 0.3% low, 6% medium, 12% high, 60% critical", () => {
    const sev = (tax: number) =>
      find(evaluate(facts({ trade: { ...facts().trade, sellTax: tax } })), "sellTax")?.severity;
    expect([sev(0.003), sev(0.06), sev(0.12), sev(0.6)]).toEqual(["low", "medium", "high", "critical"]);
    expect(find(evaluate(facts({ trade: { ...facts().trade, sellTax: 0.0004 } })), "sellTax")?.status).toBe("pass");
  });

  it("owner powers: never critical; lower when the owner is a contract; low when renounced", () => {
    const powers = [{ power: "mint" as const, functions: ["mint(address,uint256)"] }];
    const wallet = evaluate(
      facts({ powers, owner: { owner: OWNER, renounced: false, ownerIsContract: false, roleBased: false } }),
    );
    expect(find(wallet, "power.mint")).toMatchObject({ severity: "high", class: "heuristic" });
    const contract = evaluate(
      facts({ powers, owner: { owner: OWNER, renounced: false, ownerIsContract: true, roleBased: false } }),
    );
    expect(find(contract, "power.mint")?.severity).toBe("medium");
    const renounced = evaluate(
      facts({
        powers,
        owner: {
          owner: "0x000000000000000000000000000000000000dEaD",
          renounced: true,
          ownerIsContract: null,
          roleBased: false,
        },
      }),
    );
    expect(find(renounced, "power.mint")).toMatchObject({ severity: "low", values: { usable: "no" } });
    const roles = evaluate(
      facts({
        powers,
        owner: {
          owner: "0x000000000000000000000000000000000000dEaD",
          renounced: true,
          ownerIsContract: null,
          roleBased: true,
        },
      }),
    );
    expect(find(roles, "power.mint")?.severity).toBe("high");
  });

  it("proxies: active admin high, burned admin low, EIP-1167 clone passes", () => {
    const sev = (proxy: TokenSecurityFacts["proxy"]) => find(evaluate(facts({ proxy })), "proxy");
    expect(sev({ kind: "eip1967", implementation: OWNER, admin: OWNER })).toMatchObject({
      status: "risk",
      severity: "high",
    });
    expect(
      sev({ kind: "eip1967", implementation: OWNER, admin: "0x000000000000000000000000000000000000dEaD" }),
    ).toMatchObject({ severity: "low" });
    expect(sev({ kind: "minimal", implementation: OWNER, admin: null })).toMatchObject({ status: "pass" });
  });

  it("liquidity: owner holding LP is high; unprotected LP is low in deep pools, medium in small ones; empty pools", () => {
    const pool = facts().pools[0]!;
    const lp = (liquidityUsd: number, shares: Parameters<typeof lpHolders>[0]) =>
      find(evaluate(facts({ pools: [{ ...pool, liquidityUsd, holders: lpHolders(shares) }] })), "lp");
    expect(lp(500_000, { owner: 0.92, wallet: 0.08 })).toMatchObject({ severity: "high" });
    expect(lp(500_000, { burn: 0.1, wallet: 0.9 })).toMatchObject({ severity: "low" });
    expect(lp(20_000, { burn: 0.1, wallet: 0.9 })).toMatchObject({ severity: "medium" });
    expect(lp(20_000, { burn: 0.5, lockedFor: [0.45, 400], wallet: 0.05 })).toMatchObject({ status: "pass" });
    const empty = evaluate(
      facts({ pools: [{ ...pool, liquidityUsd: 0 }], trade: { ...facts().trade, outcome: "no-liquidity" } }),
    );
    expect(find(empty, "liquidity")).toMatchObject({ severity: "high", values: { state: "empty" } });
    expect(find(empty, "tradeTest")).toMatchObject({ status: "unchecked" });
  });

  it("suspicious names", () => {
    expect(find(evaluate(facts({ token: { ...facts().token, name: "visit claim-usdt.com" } })), "name")?.severity).toBe(
      "high",
    );
    expect(find(evaluate(facts({ token: { ...facts().token, name: "Free Airdrop" } })), "name")?.severity).toBe(
      "medium",
    );
  });
});

describe("second opinion", () => {
  it("parses a real GoPlus answer (CAKE) and compares only shared checks", () => {
    const entry = Object.values(goplus.result)[0] as Record<string, unknown>;
    const ext = parseGoPlus(entry, 1);
    expect(ext).toMatchObject({ provider: "GoPlus", honeypot: false, mintable: true, proxy: false });
    expect(ext.holders?.count).toBeGreaterThan(1_000_000);
    expect(ext.holders?.top10).toBeGreaterThan(0); // burn address (94%) excluded
    expect(ext.holders?.top10).toBeLessThan(0.5);
    const c = compare(facts({ external: ext, powers: [{ power: "mint", functions: ["mint(uint256)"] }] }));
    expect(c?.differences.map((d) => d.id)).not.toContain("mintable");
    const disagree = compare(
      facts({ external: { ...ext, sellTax: 0.1 }, powers: [{ power: "mint", functions: ["mint(uint256)"] }] }),
    );
    expect(disagree?.differences).toEqual([expect.objectContaining({ id: "sellTax", ours: "0", theirs: "10" })]);
  });

  it("never trusts field types", () => {
    const ext = parseGoPlus({ is_honeypot: "yes", buy_tax: "7", holders: "x", owner_address: 5 }, 1);
    expect(ext).toMatchObject({ honeypot: null, buyTax: null, holders: null, ownerRenounced: null });
  });
});

describe("contract code", () => {
  it("reads PUSH4 selectors and skips push data", () => {
    // PUSH4 40c10f19 (mint), then PUSH32 whose data contains 63 a0712d68 (must be ignored), then SELFDESTRUCT inside data only.
    const code = `0x6340c10f19${"7f"}63a0712d68${"ff".repeat(27)}00`;
    expect([...selectorsIn(code)]).toEqual(["0x40c10f19"]);
    expect(hasSelfdestruct(code)).toBe(false);
    expect(powersIn([code])).toEqual([{ power: "mint", functions: ["mint(address,uint256)"] }]);
    expect(hasSelfdestruct("0x6000ff")).toBe(true);
  });

  it("recognises EIP-1167 minimal clones", () => {
    const clone = "0x363d3d373d3d3d363d73024f18294970b5c76c0691b87f138a03171564225af43d82803e903d91602b57fd5bf3";
    expect(minimalProxyTarget(clone)).toBe("0x024f18294970b5c76c0691b87f138a0317156422");
    expect(minimalProxyTarget("0x6000")).toBeNull();
  });

  it("tax maths", () => {
    expect(taxOf(997n, 1000n)).toBeCloseTo(0.003);
    expect(taxOf(1001n, 1000n)).toBe(0);
    expect(taxOf(5n, 0n)).toBeNull();
  });

  it("the simulated code was built from the published source", () => {
    const source = readFileSync(new URL("../../contracts/security/CrypyTradeTestV2.sol", import.meta.url));
    expect(createHash("sha256").update(source).digest("hex")).toBe(SOURCE_SHA256);
  });
});
