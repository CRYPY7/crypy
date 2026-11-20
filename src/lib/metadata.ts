import type { Metadata } from "next";
import { type Locale, localeConfigs, selectableLocales } from "@/i18n/locales";
import { localePath } from "@/lib/routes";

/**
 * Canonical URL, language alternates (hreflang) and indexing rules for a page.
 * Unreviewed languages are not indexed, so search engines only show finished translations.
 */
export function pageAlternates(locale: Locale, path = ""): Pick<Metadata, "alternates" | "robots"> {
  const languages = Object.fromEntries(
    selectableLocales
      .filter((config) => config.status === "complete")
      .map((config) => [config.code, localePath(config.code, path)]),
  );
  return {
    alternates: {
      canonical: localePath(locale, path),
      languages: { ...languages, "x-default": localePath("en", path) },
    },
    robots: localeConfigs[locale].status === "complete" ? undefined : { index: false, follow: true },
  };
}
