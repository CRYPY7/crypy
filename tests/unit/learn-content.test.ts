import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toolIds } from "@/config/tools";
import { featuredGuide, getGuide, getGuides, guideMetas, learnTopics, readingMinutes } from "@/content/learn";
import { guideSlugs } from "@/content/learn/slugs";
import { plainText } from "@/components/learn/inline-text";
import type { LearnGuide } from "@/content/learn/types";

const LINK = /\[([^\]]+)\]\((tool|guide):([a-z0-9-]+)\)/g;

/** Every piece of text a guide shows, for link and mark checks. */
function allText(guide: LearnGuide): string[] {
  return [
    ...guide.inShort,
    ...guide.sections.flatMap((section) =>
      section.blocks.flatMap((block) => {
        if (block.type === "list" || block.type === "steps") return block.items;
        if (block.type === "figure") return [block.caption, block.alt, ...block.labels];
        return [block.text];
      }),
    ),
    ...guide.faq.flatMap((item) => [item.q, item.a]),
  ];
}

describe("Learn guides", () => {
  const guides = getGuides("en");

  it("has one English file per guide, and the slug list matches", () => {
    const files = readdirSync("src/content/learn/en").map((name) => name.replace(/\.json$/, ""));
    expect(files.sort()).toEqual([...guideSlugs].sort());
    expect(guideMetas.map((meta) => meta.slug)).toEqual([...guideSlugs]);
    expect(guides).toHaveLength(guideSlugs.length);
    expect(guideSlugs).toContain(featuredGuide);
  });

  it.each(guideSlugs)("%s: search title and description fit search results", (slug) => {
    const guide = getGuide(slug, "en")!;
    expect(guide.seoTitle.length).toBeGreaterThanOrEqual(30);
    expect(guide.seoTitle.length).toBeLessThanOrEqual(60);
    expect(guide.seoTitle.endsWith("| CRYPY")).toBe(true);
    expect(guide.description.length).toBeGreaterThanOrEqual(110);
    expect(guide.description.length).toBeLessThanOrEqual(160);
  });

  it.each(guideSlugs)("%s: structure, links and related guides are valid", (slug) => {
    const guide = getGuide(slug, "en")!;
    expect(learnTopics).toContain(guide.topic);
    if (guide.tool) expect(toolIds).toContain(guide.tool);
    expect(guide.inShort.length).toBeGreaterThanOrEqual(3);
    expect(guide.sections.length).toBeGreaterThanOrEqual(3);
    expect(guide.faq.length).toBeGreaterThanOrEqual(2);
    for (const other of guide.related) {
      expect(guideSlugs, `${slug} relates to ${other}`).toContain(other);
      expect(other).not.toBe(slug);
    }
    const ids = guide.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      // Reserved for the page's own headings.
      expect(["in-short", "questions", "guide-cta", "related-guides"]).not.toContain(id);
    }
    for (const text of allText(guide)) {
      for (const [, , kind, target] of text.matchAll(LINK)) {
        expect(kind === "tool" ? toolIds : guideSlugs, `${slug}: link to ${kind}:${target}`).toContain(target);
        expect(target, `${slug} links to itself`).not.toBe(slug);
      }
      // No raw HTML: guide text is rendered as React text, so tags would show literally.
      expect(text).not.toMatch(/<[a-z/]/i);
      // Unbalanced bold marks would show as stray asterisks.
      expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0);
    }
  });

  it("every guide's tool and every tool's guides line up: each live tool page gets at most a few guides", () => {
    const perTool = new Map<string, number>();
    for (const guide of guides) if (guide.tool) perTool.set(guide.tool, (perTool.get(guide.tool) ?? 0) + 1);
    for (const count of perTool.values()) expect(count).toBeLessThanOrEqual(3);
  });

  it("falls back to English for a language without a translation", () => {
    const guide = getGuide("token-approvals", "ur")!;
    expect(guide.translated).toBe(false);
    expect(guide.title).toBe(getGuide("token-approvals", "en")!.title);
    expect(getGuide("token-approvals", "en")!.translated).toBe(true);
    expect(getGuide("not-a-guide", "en")).toBeUndefined();
  });

  it("reading time counts the words and never says less than 2 minutes", () => {
    const short = { ...getGuide("gas-fees", "en")!, inShort: [], sections: [], faq: [] };
    expect(readingMinutes(short)).toBe(2);
    for (const guide of guides) expect(guide.minutes).toBeGreaterThanOrEqual(2);
  });

  it("strips marks for structured data", () => {
    expect(plainText("Use the **Approval Checker**: [open it](tool:approval-checker).")).toBe(
      "Use the Approval Checker: open it.",
    );
  });
});
