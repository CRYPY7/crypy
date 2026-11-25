import { describe, expect, it } from "vitest";
import { toPlain, round } from "@/lib/math/decimal";
import { impermanentLoss } from "@/modules/tools/impermanent-loss/il";
import { loanToValue } from "@/modules/tools/loan-to-value/ltv";
import { priceImpact, tolerance } from "@/modules/tools/slippage-calculator/slippage";

const r = (d: Parameters<typeof toPlain>[0], places = 4) => toPlain(round(d, places));

describe("loan to value", () => {
  it("works out LTV, room left, health factor and the liquidation price", () => {
    const res = loanToValue({ collateral: "10", price: "2000", debt: "8000", maxLtv: "75", threshold: "80" });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    expect(toPlain(res.value.collateralValue)).toBe("20000");
    expect(toPlain(res.value.ltv!)).toBe("40");
    expect(toPlain(res.value.available!)).toBe("7000");
    expect(toPlain(res.value.healthFactor!)).toBe("2");
    expect(toPlain(res.value.liquidationPrice!)).toBe("1000");
    expect(toPlain(res.value.dropToLiquidation!)).toBe("50");
    expect(res.value.state).toBe("safe");
  });
  it("flags positions that can be liquidated, and over-borrowed ones", () => {
    const res = loanToValue({ collateral: "1", price: "1000", debt: "900", maxLtv: "75", threshold: "80" });
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.state).toBe("liquidatable");
    expect(toPlain(res.value.available!)).toBe("-150");
  });
  it("refuses impossible numbers", () => {
    expect(loanToValue({ collateral: "1", price: "1", debt: "", maxLtv: "120", threshold: "" })).toEqual({
      ok: false,
      errors: { maxLtv: "over-100" },
    });
    expect(loanToValue({ collateral: "0", price: "1", debt: "", maxLtv: "", threshold: "" })).toEqual({
      ok: false,
      errors: { collateral: "zero" },
    });
  });
});

describe("impermanent loss", () => {
  it("matches the known table for a 50/50 pool", () => {
    const at = (a: string) => {
      const res = impermanentLoss({ changeA: a, changeB: "", deposit: "" });
      if (!res.ok) throw new Error("expected ok");
      return r(res.value.loss, 2);
    };
    expect(at("0")).toBe("0");
    expect(at("100")).toBe("-5.72"); // 2×: −5.72 %
    expect(at("300")).toBe("-20"); // 4×: −20 %
    expect(at("-50")).toBe("-5.72"); // ½×: same as 2×
    expect(at("400")).toBe("-25.46"); // 5×
  });
  it("uses the price ratio between the two tokens and values a deposit", () => {
    const res = impermanentLoss({ changeA: "50", changeB: "50", deposit: "1000" });
    if (!res.ok) throw new Error("expected ok");
    expect(r(res.value.loss)).toBe("0");
    expect(toPlain(res.value.held!)).toBe("1500");
    const res2 = impermanentLoss({ changeA: "100", changeB: "0", deposit: "1000" });
    if (!res2.ok) throw new Error("expected ok");
    expect(toPlain(res2.value.held!)).toBe("1500");
    expect(r(res2.value.pooled!, 2)).toBe("1414.21");
  });
  it("refuses a fall of 100 % or more", () => {
    expect(impermanentLoss({ changeA: "-100", changeB: "", deposit: "" })).toEqual({
      ok: false,
      errors: { changeA: "below-minus-100" },
    });
  });
});

describe("slippage", () => {
  it("minimum received and maximum sent from a tolerance", () => {
    const res = tolerance({ amount: "1000", tolerance: "0.5" });
    if (!res.ok) throw new Error("expected ok");
    expect(toPlain(res.value.minReceived)).toBe("995");
    expect(toPlain(res.value.maxSent)).toBe("1005");
  });
  it("price impact in a v2 pool, fee kept apart", () => {
    // 1,000 in a 100,000 / 100,000 pool with no fee: out = 990.099…, impact = 0.990…%
    const res = priceImpact({ reserveIn: "100000", reserveOut: "100000", amountIn: "1000", fee: "0" });
    if (!res.ok) throw new Error("expected ok");
    expect(r(res.value.amountOut, 3)).toBe("990.099");
    expect(r(res.value.priceImpact, 3)).toBe("0.99");
    const fee = priceImpact({ reserveIn: "100000", reserveOut: "100000", amountIn: "1000", fee: "" });
    if (!fee.ok) throw new Error("expected ok");
    // Default fee 0.3 %: out = 987.158…
    expect(r(fee.value.amountOut, 3)).toBe("987.158");
    expect(r(fee.value.totalCost, 3)).toBe("1.284");
  });
  it("refuses empty pools and tolerances of 100 % or more", () => {
    expect(priceImpact({ reserveIn: "0", reserveOut: "1", amountIn: "1", fee: "" })).toEqual({
      ok: false,
      errors: { reserveIn: "zero" },
    });
    expect(tolerance({ amount: "1", tolerance: "100" })).toEqual({ ok: false, errors: { tolerance: "over-100" } });
  });
});
