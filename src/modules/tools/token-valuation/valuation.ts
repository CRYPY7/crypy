import { type Dec, type DecError, cmp, div, isZero, mul, parseDec, sub } from "@/lib/math/decimal";

/**
 * Token Supply & Valuation Calculator (U1). Everything comes from what the visitor types: nothing is fetched, and no
 * price is ever guessed. Market cap needs the circulating supply; FDV uses the maximum supply when given, otherwise
 * the total supply (and says which).
 */
export interface ValuationInput {
  total: string;
  circulating: string;
  max: string;
  price: string;
}

export type Field = keyof ValuationInput;
export type ValuationError = DecError | "circulating-over-total" | "total-over-max" | "circulating-over-max";

export interface Valuation {
  marketCap: Dec | null;
  fdv: Dec | null;
  /** Which supply the FDV used. */
  fdvBasis: "max" | "total" | null;
  /** Circulating ÷ total, in percent. */
  circulatingOfTotal: Dec | null;
  /** Circulating ÷ maximum, in percent. */
  circulatingOfMax: Dec | null;
  /** Total − circulating: issued but not circulating (locked, vesting, treasury…). */
  notCirculating: Dec | null;
  /** Maximum − total: may still be created. */
  notYetIssued: Dec | null;
  /** FDV ÷ market cap: how much bigger the valuation gets if everything circulates. */
  fdvRatio: Dec | null;
}

export type ValuationResult =
  { ok: true; value: Valuation } | { ok: false; errors: Partial<Record<Field, ValuationError>> };

const PERCENT = { units: 100n, scale: 0 };

export function valuate(input: ValuationInput): ValuationResult {
  const errors: Partial<Record<Field, ValuationError>> = {};
  const read = (field: Field): Dec | null => {
    if (!input[field].trim()) return null;
    const parsed = parseDec(input[field]);
    if (!parsed.ok) {
      errors[field] = parsed.error;
      return null;
    }
    return parsed.value;
  };
  const total = read("total");
  const circulating = read("circulating");
  const max = read("max");
  const price = read("price");

  if (total && circulating && cmp(circulating, total) > 0) errors.circulating = "circulating-over-total";
  if (total && max && cmp(total, max) > 0) errors.total = "total-over-max";
  if (!total && circulating && max && cmp(circulating, max) > 0) errors.circulating = "circulating-over-max";
  if (Object.keys(errors).length) return { ok: false, errors };

  const fdvSupply = max ?? total;
  const marketCap = circulating && price ? mul(circulating, price) : null;
  const fdv = fdvSupply && price ? mul(fdvSupply, price) : null;
  return {
    ok: true,
    value: {
      marketCap,
      fdv,
      fdvBasis: max ? "max" : total ? "total" : null,
      circulatingOfTotal: circulating && total && !isZero(total) ? div(mul(circulating, PERCENT), total, 6) : null,
      circulatingOfMax: circulating && max && !isZero(max) ? div(mul(circulating, PERCENT), max, 6) : null,
      notCirculating: circulating && total ? sub(total, circulating) : null,
      notYetIssued: total && max ? sub(max, total) : null,
      fdvRatio: marketCap && fdv && !isZero(marketCap) ? div(fdv, marketCap, 4) : null,
    },
  };
}
