/**
 * Exact unit conversion for EVM amounts (wei ↔ gwei ↔ ETH/BNB). BigInt only, never floating point,
 * so 0.1 + 0.2 problems and precision loss on 18-decimal values cannot happen.
 */
export const units = [
  { id: "wei", decimals: 0 },
  { id: "gwei", decimals: 9 },
  { id: "ether", decimals: 18 },
] as const;
export type UnitId = (typeof units)[number]["id"];

export type ParseError = "empty" | "format" | "negative" | "comma" | "too-precise" | "too-large";
export type ParseResult = { ok: true; wei: bigint } | { ok: false; error: ParseError };

/** 2^256 − 1: the largest value an EVM uint256 can hold. */
export const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Parses a human amount in the given unit into wei.
 * Accepts "1", "1.5", ".5", "1e18", "1.5e9", spaces and underscores as digit separators.
 */
export function parseAmount(input: string, decimals: number): ParseResult {
  const value = input.trim().replace(/[\s_]/g, "");
  if (!value) return { ok: false, error: "empty" };
  if (value.startsWith("-")) return { ok: false, error: "negative" };
  if (value.includes(",")) return { ok: false, error: "comma" };
  const match = /^\+?(\d*)(?:\.(\d*))?(?:[eE]\+?(\d{1,3}))?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return { ok: false, error: "format" };

  const whole = match[1] || "0";
  let fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  const scale = decimals + exponent;

  // Trailing zeros after the decimal point never add precision.
  fraction = fraction.replace(/0+$/, "");
  if (fraction.length > scale) return { ok: false, error: "too-precise" };

  const digits = `${whole}${fraction.padEnd(scale, "0")}`;
  if (digits.replace(/^0+/, "").length > 78) return { ok: false, error: "too-large" };
  const wei = BigInt(digits || "0");
  if (wei > MAX_UINT256) return { ok: false, error: "too-large" };
  return { ok: true, wei };
}

/** Exact decimal string of a wei amount in the given unit, without rounding or grouping (copy-safe). */
export function formatExact(wei: bigint, decimals: number): string {
  if (decimals === 0) return wei.toString();
  const base = 10n ** BigInt(decimals);
  const whole = wei / base;
  const fraction = (wei % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function convertAll(wei: bigint): Record<UnitId, string> {
  return Object.fromEntries(units.map((unit) => [unit.id, formatExact(wei, unit.decimals)])) as Record<UnitId, string>;
}

/** Token decimals the converter accepts: every real token uses 0–36 (most use 6, 8 or 18). */
export const MAX_TOKEN_DECIMALS = 36;
export type DecimalsError = "empty" | "whole-number" | "range";
export function parseDecimals(input: string): { ok: true; decimals: number } | { ok: false; error: DecimalsError } {
  const text = input.trim();
  if (!text) return { ok: false, error: "empty" };
  if (!/^\d+$/.test(text)) return { ok: false, error: "whole-number" };
  const decimals = Number(text);
  return decimals <= MAX_TOKEN_DECIMALS ? { ok: true, decimals } : { ok: false, error: "range" };
}
