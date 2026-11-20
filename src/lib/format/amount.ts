/**
 * Formats a raw on-chain integer amount without floating-point loss (rounds half up).
 * formatAmount("1234567890000000000000", 18, "en") → "1,234.5679"
 */
export function formatAmount(raw: string, decimals: number, locale: string, maxFraction = 4): string {
  if (!/^-?\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0) return raw;
  const negative = raw.startsWith("-");
  let value = BigInt(negative ? raw.slice(1) : raw);

  let shownDecimals = decimals;
  if (decimals > maxFraction) {
    const divisor = 10n ** BigInt(decimals - maxFraction);
    const remainder = value % divisor;
    value = value / divisor + (remainder * 2n >= divisor ? 1n : 0n);
    shownDecimals = maxFraction;
  }

  const base = 10n ** BigInt(shownDecimals);
  const whole = value / base;
  const fraction = shownDecimals > 0 ? (value % base).toString().padStart(shownDecimals, "0").replace(/0+$/, "") : "";

  const wholeText = new Intl.NumberFormat(locale, { useGrouping: true }).format(whole);
  const decimalSeparator =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const text = fraction ? `${wholeText}${decimalSeparator}${fraction}` : wholeText;
  return negative && value !== 0n ? `-${text}` : text;
}

/** "0x1234…5678" — for titles and tight spaces. Full values are always shown on the page. */
export function shortenId(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
