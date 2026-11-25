/**
 * Exact decimal numbers for the browser calculators (U1): a value is an integer `units` with `scale` digits after the
 * point (12.5 = { units: 125n, scale: 1 }). BigInt only, so typed amounts are never rounded by floating point.
 * Divisions and roots are rounded at a stated precision, and the tools say so.
 */
export interface Dec {
  units: bigint;
  scale: number;
}

export type DecError = "empty" | "format" | "negative" | "comma" | "too-large" | "too-precise";
export type DecResult = { ok: true; value: Dec } | { ok: false; error: DecError };

/** Digits a typed number may have before the point and after it: far beyond any real token supply or price. */
export const MAX_INT_DIGITS = 40;
export const MAX_FRACTION_DIGITS = 36;

/** "1,234.5" with commas as thousands separators, "1_000", "1e9", ".5" and spaces are accepted. */
export function parseDec(input: string, { allowNegative = false }: { allowNegative?: boolean } = {}): DecResult {
  let text = input.trim().replace(/[\s_]/g, "");
  if (!text) return { ok: false, error: "empty" };
  let negative = false;
  if (text.startsWith("-")) {
    if (!allowNegative) return { ok: false, error: "negative" };
    negative = true;
    text = text.slice(1);
  }
  // Commas are accepted only as thousands separators (1,234,567.8); "1,5" is ambiguous and refused.
  if (text.includes(",")) {
    if (!/^\+?\d{1,3}(,\d{3})+(\.\d*)?([eE][+-]?\d+)?$/.test(text)) return { ok: false, error: "comma" };
    text = text.replace(/,/g, "");
  }
  const match = /^\+?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return { ok: false, error: "format" };
  const whole = match[1] || "0";
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  const exponent = Number(match[3] ?? 0);
  let units = BigInt(`${whole}${fraction}` || "0");
  let scale = fraction.length - exponent;
  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }
  const value = normalize({ units: negative ? -units : units, scale });
  const intDigits = (abs(value.units) / 10n ** BigInt(value.scale)).toString().length;
  if (intDigits > MAX_INT_DIGITS) return { ok: false, error: "too-large" };
  if (value.scale > MAX_FRACTION_DIGITS) return { ok: false, error: "too-precise" };
  return { ok: true, value };
}

const abs = (n: bigint) => (n < 0n ? -n : n);

/** Drops trailing zeros after the point. */
export function normalize({ units, scale }: Dec): Dec {
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return { units, scale };
}

export const dec = (n: bigint | number, scale = 0): Dec => normalize({ units: BigInt(n), scale });
export const ZERO: Dec = { units: 0n, scale: 0 };
export const ONE: Dec = { units: 1n, scale: 0 };

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * 10n ** BigInt(scale - a.scale), b.units * 10n ** BigInt(scale - b.scale), scale];
}

export const add = (a: Dec, b: Dec): Dec => {
  const [x, y, scale] = align(a, b);
  return normalize({ units: x + y, scale });
};
export const sub = (a: Dec, b: Dec): Dec => {
  const [x, y, scale] = align(a, b);
  return normalize({ units: x - y, scale });
};
export const mul = (a: Dec, b: Dec): Dec => normalize({ units: a.units * b.units, scale: a.scale + b.scale });
export const cmp = (a: Dec, b: Dec): number => {
  const [x, y] = align(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
};
export const isZero = (a: Dec) => a.units === 0n;

/** Rounds half away from zero to `places` digits after the point. */
export function round(a: Dec, places: number): Dec {
  if (a.scale <= places) return a;
  const factor = 10n ** BigInt(a.scale - places);
  const half = factor / 2n;
  const q = a.units >= 0n ? (a.units + half) / factor : -((-a.units + half) / factor);
  return normalize({ units: q, scale: places });
}

/** a ÷ b, rounded to `places` digits after the point. */
export function div(a: Dec, b: Dec, places = 30): Dec {
  if (b.units === 0n) throw new RangeError("division by zero");
  // a/b = (a.units / 10^a.scale) / (b.units / 10^b.scale); scale up the numerator for `places` + 1 guard digit.
  const extra = places + 1 + b.scale - a.scale;
  const num = extra >= 0 ? a.units * 10n ** BigInt(extra) : a.units / 10n ** BigInt(-extra);
  return round({ units: num / b.units, scale: places + 1 }, places);
}

/** a^n for a whole n ≥ 0, keeping `places` digits after each step. */
export function pow(a: Dec, n: number, places = 30): Dec {
  let result = ONE;
  let base = a;
  let e = n;
  while (e > 0) {
    if (e & 1) result = round(mul(result, base), places);
    base = round(mul(base, base), places);
    e = Math.floor(e / 2);
  }
  return result;
}

/** The positive n-th root of a > 0, by Newton's method, to `places` digits. */
export function root(a: Dec, n: number, places = 30): Dec {
  if (n === 1) return a;
  if (a.units <= 0n) return ZERO;
  // Start from a floating-point guess, then refine exactly.
  let x = fromNumber(Math.pow(toNumber(a), 1 / n));
  if (x.units <= 0n) x = ONE;
  const N = dec(n);
  const N1 = dec(n - 1);
  for (let i = 0; i < 200; i++) {
    // x ← ((n−1)·x + a / x^(n−1)) / n
    const next = div(add(mul(N1, x), div(a, pow(x, n - 1, places + 5), places + 5)), N, places + 5);
    if (cmp(round(next, places), round(x, places)) === 0) return round(next, places);
    x = next;
  }
  return round(x, places);
}

export function toNumber(a: Dec): number {
  return Number(a.units) / 10 ** a.scale;
}

export function fromNumber(n: number): Dec {
  if (!Number.isFinite(n)) return ZERO;
  const parsed = parseDec(n.toFixed(20));
  return parsed.ok ? parsed.value : ZERO;
}

/** Plain digits without grouping (copy-safe), e.g. "-1234.5". */
export function toPlain(a: Dec): string {
  const negative = a.units < 0n;
  const digits = abs(a.units)
    .toString()
    .padStart(a.scale + 1, "0");
  const whole = a.scale ? digits.slice(0, -a.scale) : digits;
  const fraction = a.scale ? digits.slice(-a.scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * For reading: groups thousands with the visitor's separators and keeps `places` digits after the point; values too
 * small to show at that precision keep `significant` significant digits instead (0.000012345 → "0.00001235").
 */
export function toDisplay(
  a: Dec,
  { places = 2, significant = 4, locale }: { places?: number; significant?: number; locale?: string } = {},
): string {
  let shown = round(a, places);
  if (isZero(shown) && !isZero(a)) {
    const digits = abs(a.units).toString().length;
    // Digits after the point to reach `significant` significant digits.
    const keep = a.scale - digits + significant;
    shown = round(a, Math.max(places, keep));
  }
  const plain = toPlain(shown);
  const [whole, fraction] = plain.replace("-", "").split(".");
  const group = new Intl.NumberFormat(locale).formatToParts(1000).find((p) => p.type === "group")?.value ?? ",";
  const point = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const fixed =
    places > 0 && (fraction ?? "").length < places && !isZero(shown)
      ? (fraction ?? "").padEnd(places, "0")
      : (fraction ?? "");
  return `${shown.units < 0n ? "-" : ""}${grouped}${fixed ? `${point}${fixed}` : ""}`;
}
