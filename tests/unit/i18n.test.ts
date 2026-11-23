import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { tools } from "@/config/tools";
import { deepMerge } from "@/i18n/messages";
import { detectableLocales, localeConfigs, locales, selectableLocales } from "@/i18n/locales";
import { negotiateLocale, parseAcceptLanguage } from "@/i18n/negotiate";
import { switchLocalePath } from "@/lib/routes";
import { findTranslationProblems } from "../../scripts/check-translations";

describe("locale registry", () => {
  it("has a config for every locale and English is complete", () => {
    expect(Object.keys(localeConfigs).sort()).toEqual([...locales].sort());
    expect(localeConfigs.en.status).toBe("complete");
  });

  it("marks Urdu and Arabic as right-to-left", () => {
    expect(localeConfigs.ur.dir).toBe("rtl");
    expect(localeConfigs.ar.dir).toBe("rtl");
  });

  it("never offers unreviewed languages", () => {
    expect(selectableLocales.every((c) => c.status !== "planned")).toBe(true);
    expect(detectableLocales.every((code) => localeConfigs[code].status === "complete")).toBe(true);
  });
});

describe("negotiateLocale", () => {
  const allowed = ["en", "ur", "de"] as const;

  it("prefers the saved cookie", () => {
    expect(negotiateLocale("ur", "de-DE,de;q=0.9", allowed)).toBe("ur");
  });

  it("uses the browser language by quality", () => {
    expect(negotiateLocale(undefined, "fr;q=0.9,de-AT;q=0.95,en;q=0.1", allowed)).toBe("de");
  });

  it("ignores cookies for languages that aren't allowed", () => {
    expect(negotiateLocale("ar", null, allowed)).toBe("en");
  });

  it("falls back to English", () => {
    expect(negotiateLocale(undefined, "ja-JP", allowed)).toBe("en");
  });

  it("ignores malformed headers", () => {
    expect(parseAcceptLanguage("<x>, ;q=abc, en")).toEqual(["en"]);
  });
});

describe("messages", () => {
  it("fills missing translations from English", () => {
    const merged = deepMerge(en, { home: { title: "عنوان" } }) as typeof en;
    expect(merged.home.title).toBe("عنوان");
    expect(merged.home.subtitle).toBe(en.home.subtitle);
  });

  it("has every text each registered tool needs", () => {
    for (const tool of tools) {
      const texts = (en.tools as Record<string, Record<string, unknown>>)[tool.id];
      expect(texts, tool.id).toBeDefined();
      for (const key of ["name", "question", "description", "input", "cta"]) {
        expect(typeof texts?.[key], `${tool.id}.${key}`).toBe("string");
      }
      expect(Array.isArray(texts?.features), `${tool.id}.features`).toBe(true);
    }
  });

  it("has no unknown or wrongly typed keys in any translation file", () => {
    expect(findTranslationProblems()).toEqual([]);
  });
});

describe("switchLocalePath", () => {
  it("keeps the rest of the path", () => {
    expect(switchLocalePath("/en/tools/gas-tracker", "ur")).toBe("/ur/tools/gas-tracker");
    expect(switchLocalePath("/en", "ar")).toBe("/ar");
  });
});

describe("translation checker", () => {
  it("reads placeholders, plurals and tags, and ignores the words inside plural branches", async () => {
    const { messageShape } = await import("../../scripts/check-translations");
    expect(messageShape("{names} {count, plural, one {is} other {are}} slow")).toEqual({
      args: ["count:plural", "names"],
      tags: [],
    });
    expect(
      messageShape(
        "Last checked {minutes, plural, =0 {less than a minute ago} one {# minute ago} other {# minutes ago}}",
      ),
    ).toEqual({ args: ["minutes:plural"], tags: [] });
    expect(messageShape("Hace {minutes, plural, =0 {menos de un minuto} other {# minutos}} en {chain}")).toEqual({
      args: ["chain", "minutes:plural"],
      tags: [],
    });
    expect(messageShape("Read <link>the guide</link> for {count, number} items '{'literal'}'")).toEqual({
      args: ["count:number"],
      tags: ["link"],
    });
  });

  it("reads every English text without errors", async () => {
    const { messageShape } = await import("../../scripts/check-translations");
    const walk = (o: unknown): void => {
      if (typeof o === "string") messageShape(o);
      else if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") Object.values(o).forEach(walk);
    };
    expect(() => walk(en)).not.toThrow();
  });
});
