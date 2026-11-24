/**
 * Locale registry. Adding a language = one entry here + a `messages/<code>/` folder.
 *
 * `status` controls visibility:
 * - `complete`: reviewed translation, shown in the language selector, indexed by search engines.
 * - `beta`:     shown in the selector with a "Beta" label, not indexed.
 * - `planned`:  route exists for development and RTL testing only; hidden and not indexed.
 *               Missing strings fall back to English.
 */
export const locales = ["en", "es", "pt-BR", "zh-CN", "ru", "tr", "vi", "ur", "ar", "hi", "fr", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export type LocaleStatus = "complete" | "beta" | "planned";

export interface LocaleConfig {
  code: Locale;
  /** Name of the language in that language. */
  nativeName: string;
  dir: "ltr" | "rtl";
  status: LocaleStatus;
}

export const localeConfigs: Record<Locale, LocaleConfig> = {
  en: { code: "en", nativeName: "English", dir: "ltr", status: "complete" },
  // Wave 1 (owner decision 2026-11-23: the biggest crypto markets first). Beta until a native speaker reviews each.
  es: { code: "es", nativeName: "Español", dir: "ltr", status: "beta" },
  "pt-BR": { code: "pt-BR", nativeName: "Português (Brasil)", dir: "ltr", status: "beta" },
  "zh-CN": { code: "zh-CN", nativeName: "简体中文", dir: "ltr", status: "beta" },
  ru: { code: "ru", nativeName: "Русский", dir: "ltr", status: "beta" },
  tr: { code: "tr", nativeName: "Türkçe", dir: "ltr", status: "beta" },
  vi: { code: "vi", nativeName: "Tiếng Việt", dir: "ltr", status: "beta" },
  // Later (kept hidden; right-to-left support stays in place for Urdu and Arabic).
  ur: { code: "ur", nativeName: "اردو", dir: "rtl", status: "planned" },
  ar: { code: "ar", nativeName: "العربية", dir: "rtl", status: "planned" },
  hi: { code: "hi", nativeName: "हिन्दी", dir: "ltr", status: "planned" },
  fr: { code: "fr", nativeName: "Français", dir: "ltr", status: "planned" },
  de: { code: "de", nativeName: "Deutsch", dir: "ltr", status: "planned" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Locales users can pick and that are offered to search engines. */
export const selectableLocales: LocaleConfig[] = locales
  .map((code) => localeConfigs[code])
  .filter((config) => config.status !== "planned");

/**
 * Locales whose pages are built in advance (`generateStaticParams`). Hidden ("planned") locales still answer when
 * their address is opened, rendered on request, so the build doesn't spend time on pages nobody can choose.
 */
export const builtLocales: Locale[] = selectableLocales.map((config) => config.code);

/** Locales the proxy may auto-select from the browser's language. Only reviewed ones. */
export const detectableLocales: Locale[] = locales.filter((code) => localeConfigs[code].status === "complete");

export const LOCALE_COOKIE = "NEXT_LOCALE";
