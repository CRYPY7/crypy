import { describe, expect, it } from "vitest";
import { combinePortfolio, portfolioCsv, type WalletOverview } from "@/lib/portfolio/combine";
import type { ChainHoldings, Holding } from "@/lib/portfolio/holdings";
import { checkWalletInput, cleanLabel } from "@/lib/portfolio/input";
import {
  MAX_WALLETS,
  SNAPSHOT_MIN_AGE_MS,
  emptyPortfolio,
  nextSnapshot,
  parsePortfolio,
  serializePortfolio,
} from "@/lib/portfolio/storage";

const A = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const B = "0x28C6c06298d514Db089934071355E5743bf21d60";

describe("checkWalletInput", () => {
  it("accepts an address and returns it checksummed", () => {
    expect(checkWalletInput(` ${A.toLowerCase()} `)).toEqual({ kind: "ok", address: A });
    expect(checkWalletInput(A)).toEqual({ kind: "ok", address: A });
  });
  it("refuses a seed phrase or a private key", () => {
    const phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    expect(checkWalletInput(phrase).kind).toBe("secret");
    expect(checkWalletInput(`0x${"ab".repeat(32)}`).kind).toBe("secret");
    expect(checkWalletInput("ab".repeat(32)).kind).toBe("secret");
  });
  it("catches a wrong checksum, junk and empty input", () => {
    expect(checkWalletInput(A.replace("d8dA", "d8Da")).kind).toBe("checksum");
    expect(checkWalletInput("0x1234").kind).toBe("invalid");
    expect(checkWalletInput("vitalik.eth").kind).toBe("invalid");
    expect(checkWalletInput("  ").kind).toBe("empty");
  });
});

describe("cleanLabel", () => {
  it("trims, caps the length and strips invisible or direction-changing characters", () => {
    expect(cleanLabel("  Main‮ wallet​ ")).toBe("Main wallet");
    expect(cleanLabel("x".repeat(60))).toHaveLength(40);
  });
});

describe("portfolio storage", () => {
  it("round-trips and drops malformed or duplicate entries", () => {
    const saved = serializePortfolio({
      wallets: [
        { address: A, label: "Main", addedAt: 1 },
        { address: A.toLowerCase(), label: "Dup", addedAt: 2 },
        { address: "nope", label: "Bad", addedAt: 3 },
        { address: B, label: 42 as unknown as string, addedAt: 4 },
      ],
      snapshot: { totalUsd: 10, at: 5 },
    });
    expect(parsePortfolio(saved)).toEqual({
      wallets: [
        { address: A, label: "Main", addedAt: 1 },
        { address: B, label: "", addedAt: 4 },
      ],
      snapshot: { totalUsd: 10, at: 5 },
    });
  });
  it("never keeps more than the wallet limit, and survives bad data", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      label: "",
      addedAt: 0,
    }));
    expect(parsePortfolio(JSON.stringify({ v: 1, wallets: many })).wallets).toHaveLength(MAX_WALLETS);
    expect(parsePortfolio("{oops")).toEqual(emptyPortfolio);
    expect(parsePortfolio(JSON.stringify({ v: 2, wallets: [] }))).toEqual(emptyPortfolio);
    expect(parsePortfolio(null)).toEqual(emptyPortfolio);
  });
  it("keeps the comparison point for at least an hour", () => {
    expect(nextSnapshot(null, 100, 1000)).toEqual({ compareTo: null, keep: { totalUsd: 100, at: 1000 } });
    const old = { totalUsd: 80, at: 0 };
    expect(nextSnapshot(old, 100, 1000)).toEqual({ compareTo: old, keep: old });
    const later = SNAPSHOT_MIN_AGE_MS + 1;
    expect(nextSnapshot(old, 100, later)).toEqual({ compareTo: old, keep: { totalUsd: 100, at: later } });
  });
});

const holding = (h: Partial<Holding> & Pick<Holding, "chain" | "symbol">): Holding => ({
  kind: "token",
  name: h.symbol,
  amount: { raw: "1000000", decimals: 6 },
  ...h,
});
const chain = (key: ChainHoldings["chain"], visible: Holding[], extra: Partial<ChainHoldings> = {}): ChainHoldings => ({
  chain: key,
  coverage: "full",
  visible,
  hidden: [],
  unpricedCount: 0,
  totalUsd: visible.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
  ...extra,
});

describe("combinePortfolio", () => {
  const usdcEth = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const usdcBase = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const fakeUsdc = "0x1111111111111111111111111111111111111111";
  const wallets: WalletOverview[] = [
    {
      address: A,
      label: "Main",
      pricesAvailable: true,
      chains: [
        chain("ethereum", [
          holding({
            chain: "ethereum",
            kind: "native",
            symbol: "ETH",
            amount: { raw: "2000000000000000000", decimals: 18 },
            valueUsd: 6000,
          }),
          holding({ chain: "ethereum", symbol: "USDC", address: usdcEth, valueUsd: 1 }),
        ]),
        chain(
          "base",
          [
            holding({
              chain: "base",
              kind: "native",
              symbol: "ETH",
              amount: { raw: "1000000000000000000", decimals: 18 },
              valueUsd: 3000,
            }),
            holding({ chain: "base", symbol: "USDC", address: usdcBase, valueUsd: 1 }),
            holding({ chain: "base", symbol: "USDC", address: fakeUsdc }),
          ],
          { unpricedCount: 1, hidden: [holding({ chain: "base", symbol: "SPAM" })] },
        ),
      ],
    },
    {
      address: B,
      label: "Savings",
      pricesAvailable: true,
      chains: [
        chain("ethereum", [
          holding({ chain: "ethereum", symbol: "USDC", address: usdcEth.toLowerCase(), valueUsd: 1 }),
        ]),
      ],
    },
    { address: "0x0000000000000000000000000000000000000001", label: "Loading", pricesAvailable: true, chains: null },
  ];
  const summary = combinePortfolio(wallets);

  it("adds up totals by wallet and by chain", () => {
    expect(summary.totalUsd).toBe(9003);
    expect(summary.byChain).toEqual(
      [
        { chain: "base", totalUsd: 3001 },
        { chain: "ethereum", totalUsd: 6002 },
      ].sort((a, b) => b.totalUsd - a.totalUsd),
    );
    expect(summary.wallets.map((w) => [w.label, w.totalUsd, w.loaded])).toEqual([
      ["Main", 9002, true],
      ["Savings", 1, true],
      ["Loading", 0, false],
    ]);
    expect(summary.loadedWallets).toBe(2);
  });

  it("merges the native coin and checked tokens across chains, never a look-alike", () => {
    const eth = summary.holdings.find((h) => h.key === "native:ETH")!;
    expect(eth.amount).toBe(3);
    expect(eth.chains).toEqual(["ethereum", "base"]);
    expect(eth.link).toBeNull();
    const usdc = summary.holdings.find((h) => h.key === "asset:usdc")!;
    expect(usdc.amount).toBe(3);
    expect(usdc.valueUsd).toBe(3);
    expect(usdc.wallets).toBe(2);
    const fake = summary.holdings.find((h) => h.key === `base:${fakeUsdc}`)!;
    expect(fake.valueUsd).toBeNull();
    expect(fake.link).toEqual({ chain: "base", address: fakeUsdc });
    expect(summary.holdings[0]!.key).toBe("native:ETH");
    expect(summary.unpricedTokens).toBe(1);
    expect(summary.hiddenSpam).toBe(1);
  });

  it("exports CSV that a spreadsheet can't run as a formula", () => {
    const csv = portfolioCsv(
      combinePortfolio([
        {
          address: A,
          label: "",
          pricesAvailable: true,
          chains: [
            chain("bsc", [holding({ chain: "bsc", symbol: '=HYPERLINK("x")', address: fakeUsdc, valueUsd: 2 })]),
          ],
        },
      ]),
      (k) => k.toUpperCase(),
    );
    expect(csv.startsWith("﻿Token,Name,Chains")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",BSC,1,2.00,1");
  });
});
