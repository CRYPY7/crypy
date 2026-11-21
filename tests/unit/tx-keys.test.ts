import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";

/**
 * Every fixed text key the transaction page asks for must be a sentence, not a group of sentences (next-intl throws
 * INSUFFICIENT_PATH for a group). Found when "failure.message" pointed at the "message" failure category.
 */
const get = (path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), en);

describe("transaction page text keys", () => {
  it('every literal s(t, "…") key resolves to a string', () => {
    const bad: string[] = [];
    for (const file of ["src/components/entity/tx-story.tsx", "src/components/entity/tx-intel.tsx"]) {
      for (const [, key] of readFileSync(file, "utf8").matchAll(/\bs\(t, "([^"]+)"/g))
        if (typeof get(`entity.tx.story.${key}`) !== "string") bad.push(`${file}: ${key}`);
    }
    expect(bad).toEqual([]);
  });
});
