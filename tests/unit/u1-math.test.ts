import { describe, expect, it } from "vitest";
import { div, parseDec, pow, root, toDisplay, toPlain } from "@/lib/math/decimal";
import { compound } from "@/modules/tools/apy-calculator/compound";
import { valuate } from "@/modules/tools/token-valuation/valuation";

const d = (s: string) => {
  const r = parseDec(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("exact decimals", () => {
  it("parses what people type and refuses the rest", () => {
    expect(toPlain(d("1,234,567.8900"))).toBe("1234567.89");
    expect(toPlain(d("1e18"))).toBe("1000000000000000000");
    expect(toPlain(d("1.5e-3"))).toBe("0.0015");
    expect(toPlain(d(".5"))).toBe("0.5");
    expect(toPlain(d("0"))).toBe("0");
    expect(parseDec("1,5")).toEqual({ ok: false, error: "comma" });
    expect(parseDec("-1")).toEqual({ ok: false, error: "negative" });
    expect(parseDec("abc")).toEqual({ ok: false, error: "format" });
    expect(parseDec("")).toEqual({ ok: false, error: "empty" });
    expect(parseDec("1".repeat(41))).toEqual({ ok: false, error: "too-large" });
    expect(parseDec(`0.${"1".repeat(37)}`)).toEqual({ ok: false, error: "too-precise" });
  });
  it("divides, powers and roots exactly enough", () => {
    expect(toPlain(div(d("1"), d("3"), 10))).toBe("0.3333333333");
    expect(toPlain(div(d("2"), d("3"), 4))).toBe("0.6667");
    expect(toPlain(pow(d("1.1"), 3))).toBe("1.331");
    expect(toPlain(root(d("1.331"), 3, 20))).toBe("1.1");
  });
  it("shows values for reading without hiding tiny ones", () => {
    expect(toDisplay(d("1234567.891"), { locale: "en-US" })).toBe("1,234,567.89");
    expect(toDisplay(d("0.0000123456"), { locale: "en-US" })).toBe("0.00001235");
    expect(toDisplay(d("1000"), { locale: "en-US" })).toBe("1,000.00");
    expect(toDisplay(d("1000"), { places: 0, locale: "en-US" })).toBe("1,000");
    expect(toDisplay(d("0"), { locale: "en-US" })).toBe("0");
  });
});

describe("token valuation", () => {
  it("market cap uses the circulating supply, FDV the maximum (or total) supply", () => {
    const r = valuate({ total: "1,000,000,000", circulating: "250,000,000", max: "2,000,000,000", price: "0.05" });
    if (!r.ok) throw new Error("expected ok");
    expect(toPlain(r.value.marketCap!)).toBe("12500000");
    expect(toPlain(r.value.fdv!)).toBe("100000000");
    expect(r.value.fdvBasis).toBe("max");
    expect(toPlain(r.value.circulatingOfTotal!)).toBe("25");
    expect(toPlain(r.value.circulatingOfMax!)).toBe("12.5");
    expect(toPlain(r.value.notCirculating!)).toBe("750000000");
    expect(toPlain(r.value.notYetIssued!)).toBe("1000000000");
    expect(toPlain(r.value.fdvRatio!)).toBe("8");
  });
  it("without a maximum, FDV uses the total supply and says so; without a price, no values", () => {
    const r = valuate({ total: "100", circulating: "", max: "", price: "2" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.fdvBasis).toBe("total");
    expect(toPlain(r.value.fdv!)).toBe("200");
    expect(r.value.marketCap).toBeNull();
    const noPrice = valuate({ total: "100", circulating: "50", max: "", price: "" });
    if (!noPrice.ok) throw new Error("expected ok");
    expect(noPrice.value.marketCap).toBeNull();
    expect(noPrice.value.fdv).toBeNull();
  });
  it("keeps huge supplies and tiny prices exact", () => {
    const r = valuate({ total: "420690000000000", circulating: "420690000000000", max: "", price: "0.00001234" });
    if (!r.ok) throw new Error("expected ok");
    expect(toPlain(r.value.marketCap!)).toBe("5191314600");
  });
  it("refuses supplies that contradict each other", () => {
    expect(valuate({ total: "100", circulating: "101", max: "", price: "1" })).toEqual({
      ok: false,
      errors: { circulating: "circulating-over-total" },
    });
    expect(valuate({ total: "300", circulating: "", max: "200", price: "" })).toEqual({
      ok: false,
      errors: { total: "total-over-max" },
    });
  });
});

describe("compound interest", () => {
  const base = {
    principal: "1000",
    rate: "10",
    rateType: "apr" as const,
    frequency: "yearly" as const,
    duration: "2",
    durationUnit: "years" as const,
    deposit: "",
  };
  it("yearly compounding matches the textbook formula", () => {
    const r = compound(base);
    if (!r.ok) throw new Error("expected ok");
    expect(toPlain(r.value.finalBalance)).toBe("1210");
    expect(toPlain(r.value.interest)).toBe("210");
    expect(toPlain(r.value.apy)).toBe("10");
    expect(r.value.years.map((y) => toPlain(y.balance))).toEqual(["1100", "1210"]);
  });
  it("monthly APR compounding gives the known effective yield", () => {
    const r = compound({ ...base, frequency: "monthly", duration: "1" });
    if (!r.ok) throw new Error("expected ok");
    // (1 + 0.1/12)^12 − 1 = 10.4713067…%
    expect(toPlain(r.value.apy)).toBe("10.471307");
    expect(toDisplay(r.value.finalBalance, { locale: "en-US" })).toBe("1,104.71");
  });
  it("an APY rate gives exactly that growth over a year, whatever the compounding", () => {
    const r = compound({ ...base, rateType: "apy", rate: "12", frequency: "daily", duration: "1" });
    if (!r.ok) throw new Error("expected ok");
    expect(toDisplay(r.value.finalBalance, { places: 8, locale: "en-US" })).toBe("1,120.00000000");
    expect(toPlain(r.value.apy)).toBe("12");
  });
  it("adds deposits at the end of each period and counts them apart from interest", () => {
    const r = compound({
      ...base,
      rate: "0",
      frequency: "monthly",
      duration: "12",
      durationUnit: "months",
      deposit: "100",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(toPlain(r.value.finalBalance)).toBe("2200");
    expect(toPlain(r.value.deposited)).toBe("2200");
    expect(toPlain(r.value.interest)).toBe("0");
  });
  it("a part of a period earns simple interest for that part", () => {
    const r = compound({ ...base, duration: "1.5" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.periods).toBe(1);
    expect(toPlain(r.value.partial)).toBe("0.5");
    expect(toPlain(r.value.finalBalance)).toBe("1155");
  });
  it("refuses impossible inputs", () => {
    expect(compound({ ...base, duration: "101" })).toEqual({ ok: false, errors: { duration: "too-long" } });
    expect(compound({ ...base, rate: "200000" })).toEqual({ ok: false, errors: { rate: "rate-too-high" } });
    expect(compound({ ...base, durationUnit: "days", duration: "1.5" })).toEqual({
      ok: false,
      errors: { duration: "whole-number" },
    });
    expect(compound({ ...base, principal: "-5" })).toEqual({ ok: false, errors: { principal: "negative" } });
    expect(compound({ ...base, duration: "0" })).toEqual({ ok: false, errors: { duration: "zero-duration" } });
  });
  it("100 years of daily compounding stays fast", () => {
    const started = Date.now();
    const r = compound({ ...base, frequency: "daily", duration: "100", deposit: "1" });
    expect(r.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

import { manualFee } from "@/modules/tools/gas-tracker/manual-fee";
import { formatExact, parseAmount, parseDecimals } from "@/modules/tools/unit-converter/units";

describe("token decimals", () => {
  it("converts both ways for any decimals, exactly", () => {
    const usdc = parseAmount("1234.56", 6);
    expect(usdc).toEqual({ ok: true, wei: 1_234_560_000n });
    expect(formatExact(1_234_560_000n, 6)).toBe("1234.56");
    expect(parseAmount("0.00000001", 8)).toEqual({ ok: true, wei: 1n });
    expect(parseAmount("0.000000001", 8)).toEqual({ ok: false, error: "too-precise" });
    expect(parseAmount("5", 0)).toEqual({ ok: true, wei: 5n });
    expect(formatExact(1n, 36)).toBe(`0.${"0".repeat(35)}1`);
  });
  it("accepts 0–36 decimals only", () => {
    expect(parseDecimals("6")).toEqual({ ok: true, decimals: 6 });
    expect(parseDecimals("0")).toEqual({ ok: true, decimals: 0 });
    expect(parseDecimals("37")).toEqual({ ok: false, error: "range" });
    expect(parseDecimals("1.5")).toEqual({ ok: false, error: "whole-number" });
    expect(parseDecimals("-1")).toEqual({ ok: false, error: "whole-number" });
  });
});

describe("manual gas fee", () => {
  it("gas × price, exact in wei, gwei and coin", () => {
    const r = manualFee({ gas: "21000", price: "1.5", priceUnit: "gwei", usd: "" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.wei).toBe(31_500_000_000_000n);
    expect(r.value.gwei).toBe("31500");
    expect(r.value.native).toBe("0.0000315");
    expect(r.value.usd).toBeNull();
  });
  it("adds dollars only from a typed price", () => {
    const r = manualFee({ gas: "65000", price: "2000000000", priceUnit: "wei", usd: "3,000" });
    if (!r.ok) throw new Error("expected ok");
    expect(toPlain(r.value.usd!)).toBe("0.39");
  });
  it("refuses fractional gas, sub-wei prices and absurd gas", () => {
    expect(manualFee({ gas: "21000.5", price: "1", priceUnit: "gwei", usd: "" })).toEqual({
      ok: false,
      errors: { gas: "whole-number" },
    });
    expect(manualFee({ gas: "21000", price: "1.5", priceUnit: "wei", usd: "" })).toEqual({
      ok: false,
      errors: { price: "whole-number" },
    });
    expect(manualFee({ gas: "21000", price: "0.0000000001", priceUnit: "gwei", usd: "" })).toEqual({
      ok: false,
      errors: { price: "too-precise" },
    });
    expect(manualFee({ gas: "5000000000", price: "1", priceUnit: "gwei", usd: "" })).toEqual({
      ok: false,
      errors: { gas: "gas-too-large" },
    });
    expect(manualFee({ gas: "0", price: "1", priceUnit: "gwei", usd: "" }).ok).toBe(true);
  });
});
