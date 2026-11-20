/** USD formatting for estimates: whole cents, "< $0.01" for dust, compact never (exact enough to compare). */
export function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

/** Token prices range from $0.00000001 to $100,000+: keep 4 significant digits below $1. */
export function formatPrice(value: number, locale: string): string {
  const options: Intl.NumberFormatOptions =
    value >= 1
      ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
      : { style: "currency", currency: "USD", maximumSignificantDigits: 4 };
  return new Intl.NumberFormat(locale, options).format(value);
}
