import "server-only";
import type { Locale } from "@/i18n/locales";
import type { LearnBlock, LearnGuide, LearnGuideMeta, LearnGuideText, LearnTopic } from "./types";
import { guides as en } from "./en";
import { guides as es } from "./es";
import { guides as ptBR } from "./pt-BR";
import { guides as ru } from "./ru";
import { guides as tr } from "./tr";
import { guides as vi } from "./vi";
import { guides as zhCN } from "./zh-CN";

/** Topics in the order the Learn hub shows them. */
export const learnTopics: readonly LearnTopic[] = [
  "token-scams",
  "approvals",
  "transactions",
  "gas-units",
  "wallet-safety",
];

/** Every guide, in the hub's order. The slug is also the file name under `src/content/learn/<locale>/`. */
export const guideMetas: readonly LearnGuideMeta[] = [
  {
    slug: "check-token-scam",
    topic: "token-scams",
    tool: "token-security",
    related: ["honeypot-token", "liquidity-lock", "token-approvals"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "honeypot-token",
    topic: "token-scams",
    tool: "token-security",
    related: ["check-token-scam", "liquidity-lock", "why-transaction-failed"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "liquidity-lock",
    topic: "token-scams",
    tool: "token-security",
    related: ["check-token-scam", "honeypot-token", "token-approvals"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "token-approvals",
    topic: "approvals",
    tool: "approval-checker",
    related: ["unlimited-approvals", "address-poisoning", "seed-phrase-safety"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "unlimited-approvals",
    topic: "approvals",
    tool: "approval-checker",
    related: ["token-approvals", "seed-phrase-safety", "check-token-scam"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "address-poisoning",
    topic: "wallet-safety",
    tool: "address-analyzer",
    related: ["checksum-addresses", "seed-phrase-safety", "token-approvals"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "seed-phrase-safety",
    topic: "wallet-safety",
    tool: null,
    related: ["token-approvals", "address-poisoning", "check-token-scam"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "why-transaction-failed",
    topic: "transactions",
    tool: "tx-checker",
    related: ["read-a-transaction", "gas-fees", "honeypot-token"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "read-a-transaction",
    topic: "transactions",
    tool: "tx-checker",
    related: ["why-transaction-failed", "gas-fees", "token-approvals"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "gas-fees",
    topic: "gas-units",
    tool: "gas-tracker",
    related: ["wei-gwei-ether", "why-transaction-failed", "read-a-transaction"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "wei-gwei-ether",
    topic: "gas-units",
    tool: "unit-converter",
    related: ["gas-fees", "read-a-transaction", "checksum-addresses"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
  {
    slug: "checksum-addresses",
    topic: "wallet-safety",
    tool: "address-formatter",
    related: ["address-poisoning", "wei-gwei-ether", "seed-phrase-safety"],
    published: "2026-11-22",
    updated: "2026-11-22",
  },
];

/** The guide shown first on the hub ("Start here"). */
export const featuredGuide = "seed-phrase-safety";

/** Translated guide texts by language. English is the source; a missing translation falls back to it. */
const texts: Partial<Record<Locale, Record<string, LearnGuideText>>> = {
  en,
  es,
  "pt-BR": ptBR,
  "zh-CN": zhCN,
  ru,
  tr,
  vi,
};

const WORDS_PER_MINUTE = 200;

function blockText(block: LearnBlock): string {
  switch (block.type) {
    case "list":
    case "steps":
      return block.items.join(" ");
    case "figure":
      return [block.caption, ...block.labels].join(" ");
    default:
      return block.text;
  }
}

/** Reading time from the words a reader actually reads, at least 2 minutes. */
export function readingMinutes(text: LearnGuideText): number {
  const all = [
    text.title,
    ...text.inShort,
    ...text.sections.flatMap((section) => [section.heading, ...section.blocks.map(blockText)]),
    ...text.faq.flatMap((item) => [item.q, item.a]),
  ].join(" ");
  // Chinese has no spaces between words: about two characters count as one word for reading speed.
  const han = all.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words =
    all
      .replace(/\p{Script=Han}/gu, " ")
      .split(/\s+/)
      .filter(Boolean).length +
    han / 2;
  return Math.max(2, Math.round(words / WORDS_PER_MINUTE));
}

/** A guide in the visitor's language, or in English when it isn't translated yet (`translated: false`). */
export function getGuide(slug: string, locale: Locale): (LearnGuide & { translated: boolean }) | undefined {
  const meta = guideMetas.find((guide) => guide.slug === slug);
  const english = texts.en?.[slug];
  if (!meta || !english) return undefined;
  const local = texts[locale]?.[slug];
  const text = local ?? english;
  return { ...meta, ...text, minutes: readingMinutes(text), translated: Boolean(local) || locale === "en" };
}

export function getGuides(locale: Locale): (LearnGuide & { translated: boolean })[] {
  return guideMetas.map((meta) => getGuide(meta.slug, locale)).filter((guide) => guide !== undefined);
}
