/**
 * Checks every translation file against English:
 * - errors: keys that don't exist in English, or values of the wrong type (these break pages)
 * - missing: keys not yet translated (shown as English; informational for unreviewed languages)
 *
 * Run: pnpm i18n:check (fails if a "complete" language is missing keys or any file has errors).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localeConfigs, locales } from "../src/i18n/locales";

type Tree = Record<string, unknown>;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const read = (locale: string): Tree => JSON.parse(readFileSync(join(root, `${locale}.json`), "utf8"));

function walk(base: Tree, other: Tree, prefix: string, errors: string[], missing: string[]) {
  for (const [key, value] of Object.entries(base)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in other)) {
      missing.push(path);
      continue;
    }
    const otherValue = other[key];
    const baseIsTree = typeof value === "object" && value !== null && !Array.isArray(value);
    if (baseIsTree) {
      if (typeof otherValue !== "object" || otherValue === null || Array.isArray(otherValue)) {
        errors.push(`${path}: expected a group of texts`);
      } else {
        walk(value as Tree, otherValue as Tree, path, errors, missing);
      }
    } else if (
      Array.isArray(value) !== Array.isArray(otherValue) ||
      (!Array.isArray(value) && typeof otherValue !== "string")
    ) {
      errors.push(`${path}: wrong type`);
    }
  }
  for (const key of Object.keys(other)) {
    if (!(key in base)) errors.push(`${prefix ? `${prefix}.` : ""}${key}: not in English`);
  }
}

export function findTranslationProblems(): string[] {
  const en = read("en");
  const problems: string[] = [];
  for (const locale of locales) {
    if (locale === "en") continue;
    const errors: string[] = [];
    const missing: string[] = [];
    walk(en, read(locale), "", errors, missing);
    problems.push(...errors.map((e) => `${locale}: ${e}`));
    if (localeConfigs[locale].status === "complete" && missing.length > 0) {
      problems.push(...missing.map((m) => `${locale}: missing ${m}`));
    }
  }
  return problems;
}
