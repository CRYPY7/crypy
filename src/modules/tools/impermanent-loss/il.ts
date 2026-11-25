import { type Dec, add, cmp, dec, div, isZero, mul, root, sub } from "@/lib/math/decimal";
import { readFields } from "../shared/read-dec";

/**
 * Impermanent loss (U2) for a 50/50 constant-product pool (Uniswap v2 style): the value of the pool share compared with
 * simply holding the two tokens, after their prices change. Trading fees and rewards are not included; concentrated
 * liquidity (v3) loses more inside its range and is not modelled.
 *   r = (1 + change A) ÷ (1 + change B);  loss = 2·√r ÷ (1 + r) − 1
 */
export interface IlInput {
  changeA: string;
  changeB: string;
  deposit: string;
}
export type Field = keyof IlInput;
export type IlError = "empty" | "format" | "negative" | "comma" | "too-large" | "too-precise" | "below-minus-100";

export interface Il {
  /** Pool value vs holding, % (zero or negative). */
  loss: Dec;
  ratio: Dec;
  held: Dec | null;
  pooled: Dec | null;
  difference: Dec | null;
}
export type IlResult = { ok: true; value: Il } | { ok: false; errors: Partial<Record<Field, IlError>> };

const HUNDRED = dec(100);
const P = 30;

export function impermanentLoss(input: IlInput): IlResult {
  const { values, errors } = readFields<Field>({ ...input }, ["changeB", "deposit"], {
    allowNegative: ["changeA", "changeB"],
  });
  const errs: Partial<Record<Field, IlError>> = { ...errors };
  for (const field of ["changeA", "changeB"] as const)
    if (values[field] && cmp(values[field]!, dec(-100)) <= 0) errs[field] = "below-minus-100";
  if (Object.keys(errs).length) return { ok: false, errors: errs };
  const a = add(dec(1), div(values.changeA!, HUNDRED, P));
  const b = add(dec(1), div(values.changeB ?? dec(0), HUNDRED, P));
  const ratio = div(a, b, P);
  const factor = div(mul(dec(2), root(ratio, 2, P)), add(dec(1), ratio), P);
  const loss = mul(sub(factor, dec(1)), HUNDRED);
  const deposit = values.deposit;
  const held = deposit && !isZero(deposit) ? div(mul(deposit, add(a, b)), dec(2), P) : null;
  const pooled = held ? mul(held, factor) : null;
  return {
    ok: true,
    value: { loss, ratio, held, pooled, difference: held && pooled ? sub(pooled, held) : null },
  };
}
