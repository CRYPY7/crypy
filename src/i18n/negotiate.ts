import { type Locale, defaultLocale, isLocale } from "./locales";

/**
 * Picks the best locale for a visitor.
 * Order: saved cookie choice → browser Accept-Language → English.
 * Only locales in `allowed` can be returned, so unreviewed languages are never auto-selected.
 */
export function negotiateLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
  allowed: readonly Locale[],
): Locale {
  if (isLocale(cookieValue) && allowed.includes(cookieValue)) return cookieValue;

  const preferences = parseAcceptLanguage(acceptLanguage);
  for (const tag of preferences) {
    const exact = allowed.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split("-")[0];
    const byBase = allowed.find((l) => l.toLowerCase() === base || l.toLowerCase().startsWith(`${base}-`));
    if (byBase) return byBase;
  }
  return allowed.includes(defaultLocale) ? defaultLocale : (allowed[0] ?? defaultLocale);
}

/** Returns lower-case language tags sorted by quality, highest first. */
export function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .slice(0, 20)
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: (rawTag ?? "").toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(
      (entry) => entry.tag && entry.tag !== "*" && entry.quality > 0 && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(entry.tag),
    )
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}
