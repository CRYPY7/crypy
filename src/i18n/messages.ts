import "server-only";
import type { Locale } from "./locales";
import en from "../../messages/en.json";

export type Messages = typeof en;
/** Translations may lack any key (new texts are translated after a batch is built); English fills the gaps. */
type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/**
 * Each locale has one JSON file in `/messages`. Missing keys fall back to English,
 * so an incomplete translation never breaks a page.
 */
const loaders: Record<Locale, () => Promise<DeepPartial<Messages>>> = {
  en: async () => en,
  ur: () => import("../../messages/ur.json").then((m) => m.default),
  ar: () => import("../../messages/ar.json").then((m) => m.default),
  hi: () => import("../../messages/hi.json").then((m) => m.default),
  es: () => import("../../messages/es.json").then((m) => m.default),
  fr: () => import("../../messages/fr.json").then((m) => m.default),
  de: () => import("../../messages/de.json").then((m) => m.default),
  "zh-CN": () => import("../../messages/zh-CN.json").then((m) => m.default),
  ru: () => import("../../messages/ru.json").then((m) => m.default),
  tr: () => import("../../messages/tr.json").then((m) => m.default),
  "pt-BR": () => import("../../messages/pt-BR.json").then((m) => m.default),
  vi: () => import("../../messages/vi.json").then((m) => m.default),
};

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === "en") return en;
  const translated = await loaders[locale]();
  return deepMerge(en, translated) as Messages;
}

type Tree = { [key: string]: unknown };

export function deepMerge(base: Tree, override: Tree): Tree {
  const result: Tree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isTree(current) && isTree(value)) {
      result[key] = deepMerge(current, value);
    } else if (typeof value === "string" && value.length > 0) {
      result[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
