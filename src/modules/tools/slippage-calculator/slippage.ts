import { type Dec, add, cmp, dec, div, isZero, mul, sub } from "@/lib/math/decimal";
import { readFields } from "../shared/read-dec";

/**
 * Slippage and price impact (U2), read-only: nothing is traded or fetched.
 * - Tolerance: the least you accept (selling an exact amount) or the most you pay (buying an exact amount).
 * - Price impact in a constant-product pool (Uniswap v2 style), from its reserves:
 *   out = in·(1 − fee)·R_out ÷ (R_in + in·(1 − fee));  impact = in·(1 − fee) ÷ (R_in + in·(1 − fee)).
 */
export type ToleranceField = "amount" | "tolerance";
export type ImpactField = "reserveIn" | "reserveOut" | "amountIn" | "fee";
export type SlipError = "empty" | "format" | "negative" | "comma" | "too-large" | "too-precise" | "over-100" | "zero";

export function tolerance(
  input: Record<ToleranceField, string>,
):
  | { ok: true; value: { minReceived: Dec; maxSent: Dec } }
  | { ok: false; errors: Partial<Record<ToleranceField, SlipError>> } {
  const { values, errors } = readFields<ToleranceField>(input);
  const errs: Partial<Record<ToleranceField, SlipError>> = { ...errors };
  if (values.tolerance && cmp(values.tolerance, dec(100)) >= 0) errs.tolerance = "over-100";
  if (Object.keys(errs).length) return { ok: false, errors: errs };
  const t = div(values.tolerance!, dec(100), 30);
  return {
    ok: true,
    value: { minReceived: mul(values.amount!, sub(dec(1), t)), maxSent: mul(values.amount!, add(dec(1), t)) },
  };
}

export interface Impact {
  amountOut: Dec;
  /** Price before the trade: out per in. */
  spotPrice: Dec;
  /** What the trade gets: out ÷ in (fee included). */
  executionPrice: Dec;
  /** Move of the pool price caused by the trade size, % (fee excluded). */
  priceImpact: Dec;
  /** Everything lost against the spot price, % (impact + fee). */
  totalCost: Dec;
  /** Pool price after the trade: out per in. */
  priceAfter: Dec;
}

export function priceImpact(
  input: Record<ImpactField, string>,
): { ok: true; value: Impact } | { ok: false; errors: Partial<Record<ImpactField, SlipError>> } {
  const { values, errors } = readFields<ImpactField>(input, ["fee"]);
  const errs: Partial<Record<ImpactField, SlipError>> = { ...errors };
  for (const field of ["reserveIn", "reserveOut", "amountIn"] as const)
    if (values[field] && isZero(values[field]!)) errs[field] = "zero";
  if (values.fee && cmp(values.fee, dec(100)) >= 0) errs.fee = "over-100";
  if (Object.keys(errs).length) return { ok: false, errors: errs };
  const P = 30;
  const rIn = values.reserveIn!;
  const rOut = values.reserveOut!;
  const amountIn = values.amountIn!;
  const afterFee = mul(amountIn, sub(dec(1), div(values.fee ?? dec(3, 1), dec(100), P)));
  const amountOut = div(mul(afterFee, rOut), add(rIn, afterFee), P);
  const spotPrice = div(rOut, rIn, P);
  const executionPrice = div(amountOut, amountIn, P);
  const priceImpact = mul(div(afterFee, add(rIn, afterFee), P), dec(100));
  const totalCost = mul(sub(dec(1), div(executionPrice, spotPrice, P)), dec(100));
  const priceAfter = div(sub(rOut, amountOut), add(rIn, amountIn), P);
  return { ok: true, value: { amountOut, spotPrice, executionPrice, priceImpact, totalCost, priceAfter } };
}
