/**
 * Checks every translation file against English:
 * - errors: keys that don't exist in English, values of the wrong type, or a text whose placeholders ({count},
 *   {name}…), plural/select arguments or rich-text tags differ from English (these break pages or show wrong values)
 * - missing: keys not yet translated (shown as English)
 *
 * Run: pnpm i18n:check. Fails if any file has errors, or if a "complete" or "beta" language is missing keys
 * (the private admin dashboard, `admin.*`, stays English and may be missing).
 *
 * While a batch of new tools is being built, its new texts may be English-only: their key prefixes are listed in
 * `messages/pending-translation.json` (English shows meanwhile). The check prints how many are still untranslated;
 * a batch is deployed only once that list is empty again.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localeConfigs, locales } from "../src/i18n/locales";

type Tree = Record<string, unknown>;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const read = (locale: string): Tree => JSON.parse(readFileSync(join(root, `${locale}.json`), "utf8"));

/** Texts allowed to stay English in every language. */
const ENGLISH_ONLY = ["admin"];

/** Key prefixes of the batch being built: allowed to be missing for now, but counted. */
export function pendingPrefixes(): string[] {
  try {
    const list: unknown = JSON.parse(readFileSync(join(root, "pending-translation.json"), "utf8"));
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
const under = (key: string, prefixes: string[]) => prefixes.some((p) => key === p || key.startsWith(`${p}.`));

/**
 * The arguments a message uses, as "name" or "name:plural" etc., and its rich-text tags. A small ICU reader: plural
 * and select branches are read recursively; `#` and plain text are ignored; '…' quoting is respected.
 */
export function messageShape(message: string): { args: string[]; tags: string[] } {
  const args = new Set<string>();
  const tags = new Set<string>();
  let i = 0;
  const readText = (stopAtBrace: boolean) => {
    while (i < message.length) {
      const c = message[i]!;
      if (c === "'" && (message[i + 1] === "{" || message[i + 1] === "}")) {
        const end = message.indexOf("'", i + 1);
        i = end === -1 ? message.length : end + 1;
        continue;
      }
      if (c === "{") {
        readArgument();
        continue;
      }
      if (c === "}" && stopAtBrace) return;
      if (c === "<") {
        const m = /^<\/?([a-zA-Z][\w-]*)>/.exec(message.slice(i));
        if (m) {
          tags.add(m[1]!);
          i += m[0].length;
          continue;
        }
      }
      i += 1;
    }
  };
  const readArgument = () => {
    i += 1; // "{"
    const head = /^\s*([\w-]+)\s*(?:,\s*(\w+)\s*(?:,)?)?/.exec(message.slice(i));
    if (!head) {
      readText(true);
      i += 1;
      return;
    }
    const [, name, type] = head;
    i += head[0].length;
    if (type === "plural" || type === "select" || type === "selectordinal") {
      args.add(`${name}:${type === "selectordinal" ? "plural" : type}`);
      // branches: selector {message} …
      while (i < message.length) {
        while (/\s/.test(message[i] ?? "")) i += 1;
        if (message[i] === "}") {
          i += 1;
          return;
        }
        const selector = /^(offset:\d+|=?[\w-]+)/.exec(message.slice(i));
        if (!selector) {
          i += 1;
          continue;
        }
        i += selector[0].length;
        while (/\s/.test(message[i] ?? "")) i += 1;
        if (message[i] === "{") {
          i += 1;
          readText(true);
          i += 1;
        }
      }
      return;
    }
    args.add(type ? `${name}:${type}` : name!);
    // Skip to the closing brace of a simple or formatted argument.
    let depth = 1;
    while (i < message.length && depth > 0) {
      if (message[i] === "{") depth += 1;
      else if (message[i] === "}") depth -= 1;
      i += 1;
    }
  };
  readText(false);
  return { args: [...args].sort(), tags: [...tags].sort() };
}

function sameShape(a: string, b: string): boolean {
  const x = messageShape(a);
  const y = messageShape(b);
  return x.args.join() === y.args.join() && x.tags.join() === y.tags.join();
}

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
    } else if (typeof value === "string" && !sameShape(value, otherValue as string)) {
      errors.push(`${path}: placeholders differ from English`);
    } else if (Array.isArray(value) && Array.isArray(otherValue) && value.length !== otherValue.length) {
      errors.push(`${path}: ${otherValue.length} items, English has ${value.length}`);
    }
  }
  for (const key of Object.keys(other)) {
    if (!(key in base)) errors.push(`${prefix ? `${prefix}.` : ""}${key}: not in English`);
  }
}

export function findTranslationProblems(pending = pendingPrefixes()): string[] {
  const en = read("en");
  const problems: string[] = [];
  for (const locale of locales) {
    if (locale === "en") continue;
    const errors: string[] = [];
    const missing: string[] = [];
    walk(en, read(locale), "", errors, missing);
    problems.push(...errors.map((e) => `${locale}: ${e}`));
    if (localeConfigs[locale].status !== "planned") {
      const required = missing.filter((m) => !under(m, ENGLISH_ONLY) && !under(m, pending));
      problems.push(...required.map((m) => `${locale}: missing ${m}`));
    }
  }
  return problems;
}

/** Missing keys per language (for translators). */
export function missingKeys(locale: string): string[] {
  const missing: string[] = [];
  walk(read("en"), read(locale), "", [], missing);
  return missing;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = findTranslationProblems();
  console.log(problems.length ? problems.join("\n") : "No translation problems.");
  const pending = pendingPrefixes();
  if (pending.length) {
    const waiting = locales
      .filter((l) => l !== "en" && localeConfigs[l].status !== "planned")
      .map((l) => `${l} ${missingKeys(l).filter((m) => under(m, pending)).length}`);
    console.log(`Waiting for translation (batch in progress: ${pending.join(", ")}): ${waiting.join(", ")}`);
  }
  process.exitCode = problems.length ? 1 : 0;
}
