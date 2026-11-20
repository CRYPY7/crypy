/** Batch Balance Scanner: list parsing, results maths, sorting/filtering and CSV safety (no network). */
import { describe, expect, it } from "vitest";
import { MAX_ADDRESSES, cleanLabel, parseList } from "@/modules/tools/batch-balance/parse";
import {
  type ScanAsset,
  type ScanRow,
  isEmptyRow,
  plainAmount,
  rowUsd,
  safeCell,
  summarize,
  toCsv,
  viewRows,
} from "@/modules/tools/batch-balance/results";

const A = "0xa4cE12B3bC1A612dd272Bd1C37EEC1CCc171B49d";
const B = "0x4B3C9BF53CCE6b3B2C1D6fFBdaeCeb97572C9Afa";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("parseList", () => {
  it("reads one address per line with optional labels before or after", () => {
    const r = parseList(`${VITALIK},vitalik.eth\nTreasury ${A.toLowerCase()}\n\naddress,label`);
    expect(r.entries.map((e) => [e.label, e.line])).toEqual([
      ["vitalik.eth", 1],
      ["Treasury", 2],
    ]);
    expect(r.entries[1]!.address.toLowerCase()).toBe(A.toLowerCase());
    expect(r.problems).toBe(0); // the header line is ignored quietly
  });

  it("merges duplicates (any case) and keeps the first label", () => {
    const r = parseList(`${VITALIK}\n${VITALIK.toLowerCase()},Main`);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.label).toBe("Main");
    expect(r.notes).toEqual([{ kind: "duplicate", line: 2, firstLine: 1 }]);
  });

  it("flags a mistyped checksum and never fixes it", () => {
    const typo = VITALIK.replace("dA6B", "Da6B");
    const r = parseList(typo);
    expect(r.entries).toEqual([]);
    expect(r.notes).toEqual([{ kind: "checksum", line: 1 }]);
  });

  it("flags addresses of the wrong length and transaction hashes", () => {
    const r = parseList(`0x1234567890abcdef1234567890abcdef1234567\n0x${"ab".repeat(32)}`);
    expect(r.notes.map((n) => n.kind)).toEqual(["invalid", "invalid"]);
    expect(r.entries).toEqual([]);
  });

  it("splits several addresses on one line, without labels", () => {
    const r = parseList(`${A.toLowerCase()}, ${B.toLowerCase()}; ${VITALIK}`);
    expect(r.entries.map((e) => e.label)).toEqual(["", "", ""]);
    expect(r.notes).toEqual([{ kind: "several", line: 1, count: 3 }]);
  });

  it("stops at the address limit and says so", () => {
    const list = Array.from({ length: MAX_ADDRESSES + 3 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
    const r = parseList(list.join("\n"));
    expect(r.entries).toHaveLength(MAX_ADDRESSES);
    expect(r.overLimit).toBe(3);
  });

  it("removes invisible and direction-changing characters from labels", () => {
    expect(cleanLabel("Tre‮asury​  wallet\u0007")).toBe("Treasury wallet");
    expect(cleanLabel("x".repeat(80))).toHaveLength(40);
  });
});

const native: ScanAsset = {
  key: "native",
  symbol: "ETH · BNB",
  name: "",
  chains: { ethereum: { address: "native", decimals: 18 }, bsc: { address: "native", decimals: 18 } },
};
const usdt: ScanAsset = {
  key: "usdt",
  symbol: "USDT",
  name: "Tether",
  chains: {
    ethereum: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    bsc: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  },
};
const prices = {
  ethereum: { native: 2000, "0xdac17f958d2ee523a2206206994597c13d831ec7": 1 },
  bsc: { native: 500 },
};
const row = (
  address: string,
  chain: string,
  balances: ScanRow["balances"],
  status: ScanRow["status"] = "ok",
): ScanRow => ({
  entry: { address, label: address === A ? '=HYPERLINK("x")' : "", line: 1 },
  chain,
  status,
  type: "wallet",
  balances,
  block: chain === "ethereum" ? "100" : "200",
});

describe("results", () => {
  const rows = [
    row(A, "ethereum", { native: "1500000000000000000", usdt: "2500000" }), // 1.5 ETH + 2.5 USDT
    row(A, "bsc", { native: "0", usdt: "1000000000000000000" }), // 1 USDT on BSC, no BSC price for USDT
    row(B, "ethereum", { native: "0", usdt: "0" }),
    row(B, "bsc", { native: null, usdt: null }, "failed"),
  ];

  it("values rows only with prices it has, never guessing missing ones", () => {
    expect(rowUsd(rows[0]!, [native, usdt], prices)).toBeCloseTo(3002.5);
    expect(rowUsd(rows[1]!, [native, usdt], prices)).toBe(0);
  });

  it("summarizes: with a balance, empty (only when every check succeeded), failed, totals per chain", () => {
    const sum = summarize(rows, [native, usdt], prices, 2);
    expect(sum).toMatchObject({ addresses: 2, checks: 4, withBalance: 1, empty: 0, failed: 1 });
    expect(sum.totalUsd).toBeCloseTo(3002.5);
    const usdtTotal = sum.assetTotals.find((t) => t.asset.key === "usdt")!;
    expect(usdtTotal.perChain).toEqual([
      { chain: "ethereum", raw: "2500000", decimals: 6 },
      { chain: "bsc", raw: "1000000000000000000", decimals: 18 },
    ]);
    expect(sum.blocks).toEqual({ ethereum: "100", bsc: "200" });
    expect(isEmptyRow(rows[2]!)).toBe(true);
    expect(isEmptyRow(rows[3]!)).toBe(false); // failed is not "empty"
  });

  it("filters empty rows, by chain and by search, and sorts by value", () => {
    const view = viewRows(rows, [native, usdt], prices, {
      search: "",
      chain: null,
      hideEmpty: true,
      sort: "value",
      descending: true,
    });
    expect(view.map((r) => `${r.entry.address.slice(0, 6)}-${r.chain}`)).toEqual([
      "0xa4cE-ethereum",
      "0xa4cE-bsc",
      "0x4B3C-bsc",
    ]);
    expect(
      viewRows(rows, [native, usdt], prices, {
        search: "4b3c",
        chain: "ethereum",
        hideEmpty: false,
        sort: "index",
        descending: false,
      }),
    ).toHaveLength(1);
  });

  it("exact plain amounts for CSV", () => {
    expect(plainAmount("1500000000000000000", 18)).toBe("1.5");
    expect(plainAmount("2500000", 6)).toBe("2.5");
    expect(plainAmount("7", 0)).toBe("7");
  });

  it("CSV cells can't run as spreadsheet formulas", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("+1")).toBe("'+1");
    expect(safeCell('a "b", c')).toBe('"a ""b"", c"');
    const csv = toCsv(
      rows,
      [native, usdt],
      prices,
      { label: "Label", address: "Address", chain: "Chain", type: "Type", value: "Value", status: "Status" },
      (k) => k,
      (t) => t ?? "",
      (s) => s,
    );
    expect(csv.startsWith("﻿Label,Address")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")",${A},ethereum,wallet,1.5,2.5,3002.50,ok`);
  });
});
