import { type Dec, type DecError, ZERO, add, cmp, dec, div, isZero, mul, parseDec, sub } from "@/lib/math/decimal";

/**
 * Profit, average cost and break-even (U5): one or more buys of the same coin, the fees paid, and a price to sell at.
 * Exact decimal maths; nothing is looked up, so the selling price is whatever the visitor types.
 */
export interface Buy {
  amount: string;
  price: string;
}
export interface ProfitInput {
  buys: readonly Buy[];
  /** Total fees paid on the buys, in USD (optional). */
  buyFees: string;
  /** Price to sell at (or today's price), USD. */
  sellPrice: string;
  /** Selling fee, % of the sale (optional). */
  sellFee: string;
}
export type ProfitError = DecError | "over-100" | "no-buys" | "half-row";
export type ProfitField = "buyFees" | "sellPrice" | "sellFee" | `amount-${number}` | `price-${number}`;

export interface Profit {
  amount: Dec;
  /** What the buys cost, fees included. */
  cost: Dec;
  /** Cost ÷ amount: the average price paid per coin, fees included. */
  averageCost: Dec;
  /** Amount × selling price. */
  saleValue: Dec;
  sellFeeUsd: Dec;
  /** Sale value − selling fee − cost. */
  profit: Dec;
  /** Profit ÷ cost, %; null when nothing was paid. */
  profitPercent: Dec | null;
  /** The selling price at which profit is zero, after the selling fee. */
  breakEven: Dec | null;
  /** (Selling price ÷ average cost) − 1, as a %, for "how far above or below my entry". */
  priceChange: Dec | null;
}
export type ProfitResult =
  { ok: true; value: Profit } | { ok: false; errors: Partial<Record<ProfitField, ProfitError>> };

export const MAX_BUYS = 10;
const HUNDRED = dec(100);

function read(text: string, optional: boolean): { value: Dec | null; error?: ProfitError } {
  if (!text.trim()) return optional ? { value: null } : { value: null, error: "empty" };
  const parsed = parseDec(text);
  return parsed.ok ? { value: parsed.value } : { value: null, error: parsed.error };
}

export function profitCalc(input: ProfitInput): ProfitResult {
  const errors: Partial<Record<ProfitField, ProfitError>> = {};
  let amount = ZERO;
  let spent = ZERO;
  let rows = 0;
  input.buys.slice(0, MAX_BUYS).forEach((buy, i) => {
    if (!buy.amount.trim() && !buy.price.trim()) return;
    const a = read(buy.amount, false);
    const p = read(buy.price, false);
    if (a.error) errors[`amount-${i}`] = a.error === "empty" ? "half-row" : a.error;
    if (p.error) errors[`price-${i}`] = p.error === "empty" ? "half-row" : p.error;
    if (a.value && p.value) {
      amount = add(amount, a.value);
      spent = add(spent, mul(a.value, p.value));
      rows += 1;
    }
  });
  const fees = read(input.buyFees, true);
  const sell = read(input.sellPrice, false);
  const sellFee = read(input.sellFee, true);
  if (fees.error) errors.buyFees = fees.error;
  if (sell.error) errors.sellPrice = sell.error;
  if (sellFee.error) errors.sellFee = sellFee.error;
  else if (sellFee.value && cmp(sellFee.value, HUNDRED) >= 0) errors.sellFee = "over-100";
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!rows || isZero(amount)) return { ok: false, errors: { "amount-0": "no-buys" } };

  const cost = add(spent, fees.value ?? ZERO);
  const saleValue = mul(amount, sell.value!);
  const feeRate = sellFee.value ? div(sellFee.value, HUNDRED, 30) : ZERO;
  const sellFeeUsd = mul(saleValue, feeRate);
  const profit = sub(sub(saleValue, sellFeeUsd), cost);
  const averageCost = div(cost, amount, 18);
  const keep = sub(dec(1), feeRate);
  return {
    ok: true,
    value: {
      amount,
      cost,
      averageCost,
      saleValue,
      sellFeeUsd,
      profit,
      profitPercent: isZero(cost) ? null : div(mul(profit, HUNDRED), cost, 6),
      breakEven: div(cost, mul(amount, keep), 18),
      priceChange: isZero(averageCost) ? null : mul(sub(div(sell.value!, averageCost, 18), dec(1)), HUNDRED),
    },
  };
}
