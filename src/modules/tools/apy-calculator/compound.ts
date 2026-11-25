import {
  type Dec,
  type DecError,
  ONE,
  ZERO,
  add,
  cmp,
  dec,
  div,
  isZero,
  mul,
  parseDec,
  pow,
  root,
  round,
  sub,
} from "@/lib/math/decimal";

/**
 * APR / APY & compound interest (U1), computed exactly in the browser with fixed-point decimals (30 digits after the
 * point, rounded only for display). An estimate of what a fixed rate would give: real crypto rates change all the time.
 *
 * Conventions (shown on the page):
 * - APR r compounded n times a year: each period grows by r ÷ n.
 * - APY a: each period grows by (1 + a)^(1/n) − 1, so a full year gives exactly a.
 * - A deposit is added at the end of each compounding period (after that period's interest).
 * - A part of a period at the end earns simple interest for that part.
 * - Years have 365 days; months are 1/12 year.
 */
export const frequencies = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
export type Frequency = (typeof frequencies)[number];
export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export const durationUnits = ["days", "months", "years"] as const;
export type DurationUnit = (typeof durationUnits)[number];

export interface CompoundInput {
  principal: string;
  rate: string;
  rateType: "apr" | "apy";
  frequency: Frequency;
  duration: string;
  durationUnit: DurationUnit;
  deposit: string;
}
export type Field = "principal" | "rate" | "duration" | "deposit";
export type CompoundError = DecError | "too-long" | "rate-too-high" | "whole-number" | "zero-duration";

export interface YearRow {
  year: number;
  balance: Dec;
  deposited: Dec;
  interest: Dec;
}
export interface Compound {
  finalBalance: Dec;
  deposited: Dec;
  interest: Dec;
  /** Effective yearly growth, in percent. */
  apy: Dec;
  /** Nominal yearly rate, in percent. */
  apr: Dec;
  periods: number;
  /** Fraction of a period left at the end (0 ≤ f < 1). */
  partial: Dec;
  years: YearRow[];
}
export type CompoundResult =
  { ok: true; value: Compound } | { ok: false; errors: Partial<Record<Field, CompoundError>> };

const P = 30;
const HUNDRED = dec(100);
export const MAX_YEARS = 100;
/** 100 000 % a year: higher rates are almost always typos (and would overflow any display). */
const MAX_RATE = dec(100_000);
const MAX_AMOUNT_DIGITS = 18;

export function compound(input: CompoundInput): CompoundResult {
  const errors: Partial<Record<Field, CompoundError>> = {};
  const read = (field: Field, optional = false): Dec | null => {
    if (optional && !input[field].trim()) return ZERO;
    const parsed = parseDec(input[field]);
    if (!parsed.ok) {
      errors[field] = parsed.error;
      return null;
    }
    if (div(parsed.value, ONE, 0).units.toString().length > MAX_AMOUNT_DIGITS) {
      errors[field] = "too-large";
      return null;
    }
    return parsed.value;
  };
  const principal = read("principal");
  const rate = read("rate");
  const duration = read("duration");
  const deposit = read("deposit", true);
  if (rate && cmp(rate, MAX_RATE) > 0) errors.rate = "rate-too-high";
  let durationYears: Dec | null = null;
  if (duration) {
    if (input.durationUnit === "days" && duration.scale > 0) errors.duration = "whole-number";
    else if (isZero(duration)) errors.duration = "zero-duration";
    else {
      durationYears =
        input.durationUnit === "years" ? duration : div(duration, dec(input.durationUnit === "months" ? 12 : 365), P);
      if (cmp(durationYears, dec(MAX_YEARS)) > 0) errors.duration = "too-long";
    }
  }
  if (Object.keys(errors).length || !principal || !rate || !durationYears || !deposit) return { ok: false, errors };

  const n = PERIODS_PER_YEAR[input.frequency];
  const yearly = div(rate, HUNDRED, P);
  // Growth per period, as a rate.
  const periodRate = input.rateType === "apr" ? div(yearly, dec(n), P) : sub(root(add(ONE, yearly), n, P), ONE);
  const factor = add(ONE, periodRate);

  // Whole periods and the part of one left over. Exact: duration in periods = years × n.
  const exactPeriods = mul(durationYears, dec(n));
  // At most 100 years × 365 periods, so a plain number is exact.
  const whole = Number(floor(exactPeriods));
  const partial = sub(exactPeriods, dec(whole));

  let balance = principal;
  let deposited = principal;
  const years: YearRow[] = [];
  for (let k = 1; k <= whole; k++) {
    balance = round(mul(balance, factor), P);
    if (!isZero(deposit)) {
      balance = add(balance, deposit);
      deposited = add(deposited, deposit);
    }
    if (k % n === 0) years.push({ year: k / n, balance, deposited, interest: sub(balance, deposited) });
  }
  if (!isZero(partial)) balance = round(add(balance, mul(balance, mul(periodRate, partial))), P);

  const apy = mul(sub(pow(factor, n, P), ONE), HUNDRED);
  const apr = mul(mul(periodRate, dec(n)), HUNDRED);
  return {
    ok: true,
    value: {
      finalBalance: balance,
      deposited,
      interest: sub(balance, deposited),
      apy: round(apy, 6),
      apr: round(apr, 6),
      periods: whole,
      partial: round(partial, 6),
      years,
    },
  };
}

function floor(a: Dec): bigint {
  return a.units / 10n ** BigInt(a.scale);
}
