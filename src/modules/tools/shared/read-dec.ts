import { type Dec, type DecError, parseDec } from "@/lib/math/decimal";

/** Reads several typed numbers at once: empty optional fields become null, errors are collected per field. */
export function readFields<F extends string>(
  input: Record<F, string>,
  optional: readonly F[] = [],
  options: { allowNegative?: readonly F[] } = {},
): { values: Record<F, Dec | null>; errors: Partial<Record<F, DecError>> } {
  const values = {} as Record<F, Dec | null>;
  const errors: Partial<Record<F, DecError>> = {};
  for (const field of Object.keys(input) as F[]) {
    const text = input[field];
    if (!text.trim()) {
      values[field] = null;
      if (!optional.includes(field)) errors[field] = "empty";
      continue;
    }
    const parsed = parseDec(text, { allowNegative: options.allowNegative?.includes(field) ?? false });
    if (parsed.ok) values[field] = parsed.value;
    else {
      values[field] = null;
      errors[field] = parsed.error;
    }
  }
  return { values, errors };
}
