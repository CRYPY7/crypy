/**
 * Shared Intl formatters (M9 performance). Creating an `Intl.NumberFormat` is far slower than using one; pages that
 * show hundreds of amounts created two per amount, which showed up as main-thread time on phones. Formatters are
 * kept per locale and options (a few dozen at most), on the server and in the browser.
 */
const numberFormats = new Map<string, Intl.NumberFormat>();

export function numberFormat(locale: string | undefined, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale ?? ""}|${options ? JSON.stringify(options) : ""}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    if (numberFormats.size > 200) numberFormats.clear();
    numberFormats.set(key, format);
  }
  return format;
}

const decimalSeparators = new Map<string, string>();

/** The locale's decimal separator ("." or "," and others). */
export function decimalSeparator(locale: string): string {
  let separator = decimalSeparators.get(locale);
  if (separator === undefined) {
    separator =
      numberFormat(locale)
        .formatToParts(1.1)
        .find((part) => part.type === "decimal")?.value ?? ".";
    decimalSeparators.set(locale, separator);
  }
  return separator;
}
