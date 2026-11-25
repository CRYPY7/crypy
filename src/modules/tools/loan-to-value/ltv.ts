import { type Dec, cmp, dec, div, isZero, mul, sub } from "@/lib/math/decimal";
import { readFields } from "../shared/read-dec";

/**
 * Loan-to-value and liquidation (U2): what a lending position looks like from the numbers typed. Lending protocols
 * use their own prices, thresholds and fees, so this is a model of the usual rule, not any protocol's answer.
 */
export interface LtvInput {
  collateral: string;
  price: string;
  debt: string;
  maxLtv: string;
  threshold: string;
}
export type Field = keyof LtvInput;
export type LtvError = "empty" | "format" | "negative" | "comma" | "too-large" | "too-precise" | "over-100" | "zero";

export interface Ltv {
  collateralValue: Dec;
  /** Debt ÷ collateral value, %. */
  ltv: Dec | null;
  /** Collateral value × max LTV − debt (negative: over the limit). */
  available: Dec | null;
  /** Collateral value × threshold ÷ debt; below 1 the position can be liquidated. */
  healthFactor: Dec | null;
  /** Collateral price at which the health factor reaches 1. */
  liquidationPrice: Dec | null;
  /** How far the price can fall before that, %. */
  dropToLiquidation: Dec | null;
  state: "safe" | "close" | "liquidatable" | "no-debt" | null;
}
export type LtvResult = { ok: true; value: Ltv } | { ok: false; errors: Partial<Record<Field, LtvError>> };

const HUNDRED = dec(100);

export function loanToValue(input: LtvInput): LtvResult {
  const { values, errors } = readFields<Field>({ ...input }, ["debt", "maxLtv", "threshold"]);
  const errs: Partial<Record<Field, LtvError>> = { ...errors };
  for (const field of ["maxLtv", "threshold"] as const)
    if (values[field] && cmp(values[field]!, HUNDRED) > 0) errs[field] = "over-100";
  if (Object.keys(errs).length) return { ok: false, errors: errs };
  const { collateral, price, debt, maxLtv, threshold } = values as Record<Field, Dec | null>;
  const value = mul(collateral!, price!);
  if (isZero(value)) return { ok: false, errors: { collateral: "zero" } };

  const hasDebt = debt !== null && !isZero(debt);
  const ltv = debt !== null ? div(mul(debt, HUNDRED), value, 6) : null;
  const available = maxLtv ? sub(div(mul(value, maxLtv), HUNDRED, 18), debt ?? dec(0)) : null;
  const healthFactor = hasDebt && threshold ? div(div(mul(value, threshold), HUNDRED, 30), debt!, 6) : null;
  const liquidationPrice =
    hasDebt && threshold && !isZero(threshold) ? div(mul(debt!, HUNDRED), mul(collateral!, threshold), 18) : null;
  const dropToLiquidation =
    liquidationPrice && !isZero(price!) ? mul(sub(dec(1), div(liquidationPrice, price!, 18)), HUNDRED) : null;
  const state = !hasDebt
    ? debt !== null
      ? "no-debt"
      : null
    : healthFactor
      ? cmp(healthFactor, dec(1)) < 0
        ? "liquidatable"
        : cmp(healthFactor, dec(12, 1)) < 0
          ? "close"
          : "safe"
      : null;
  return {
    ok: true,
    value: { collateralValue: value, ltv, available, healthFactor, liquidationPrice, dropToLiquidation, state },
  };
}
