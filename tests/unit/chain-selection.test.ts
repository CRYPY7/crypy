import { describe, expect, it } from "vitest";
import { formatSelection, parseSelection, resolveScope } from "@/lib/chains/selection";

const KNOWN = ["bsc", "ethereum", "base"] as const;

describe("parseSelection", () => {
  it("reads used and all", () => {
    expect(parseSelection("used", KNOWN)).toEqual({ mode: "used" });
    expect(parseSelection(" ALL ", KNOWN)).toEqual({ mode: "all" });
  });
  it("keeps known chains only, in the supported order, without duplicates", () => {
    expect(parseSelection("base,bsc,bsc,solana", KNOWN)).toEqual({ mode: "pick", chains: ["bsc", "base"] });
  });
  it("rejects empty or unknown values so the next source applies", () => {
    expect(parseSelection(undefined, KNOWN)).toBeNull();
    expect(parseSelection("", KNOWN)).toBeNull();
    expect(parseSelection("solana,<script>", KNOWN)).toBeNull();
  });
  it("round-trips through the link format", () => {
    for (const v of ["used", "all", "bsc,base"]) expect(formatSelection(parseSelection(v, KNOWN)!)).toBe(v);
  });
});

describe("resolveScope", () => {
  const used = new Set(["bsc", "ethereum"]);
  it("used: scans only used chains and names the rest as unused", () => {
    const s = resolveScope({ mode: "used" }, KNOWN, used);
    expect(s.scan).toEqual(["bsc", "ethereum"]);
    expect(s.usedNotScanned).toEqual([]);
    expect(s.unusedNotScanned).toEqual(["base"]);
  });
  it("all: scans everything", () => {
    expect(resolveScope({ mode: "all" }, KNOWN, used).scan).toEqual([...KNOWN]);
  });
  it("pick: names used chains that were left out (approvals warning)", () => {
    const s = resolveScope({ mode: "pick", chains: ["bsc"] }, KNOWN, used);
    expect(s.scan).toEqual(["bsc"]);
    expect(s.usedNotScanned).toEqual(["ethereum"]);
    expect(s.unusedNotScanned).toEqual(["base"]);
  });
  it("ignores picked chains the tool doesn't support", () => {
    expect(resolveScope({ mode: "pick", chains: ["solana"] }, KNOWN, used).scan).toEqual([]);
  });
  it("an unused address scans nothing by default", () => {
    expect(resolveScope({ mode: "used" }, KNOWN, new Set()).scan).toEqual([]);
  });
});
