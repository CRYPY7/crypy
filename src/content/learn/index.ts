import "server-only";
import type { Locale } from "@/i18n/locales";
import type { LearnBlock, LearnGuide, LearnGuideMeta, LearnGuideText, LearnTopic } from "./types";
import checkTokenScam from "./en/check-token-scam.json";
import honeypotToken from "./en/honeypot-token.json";
import liquidityLock from "./en/liquidity-lock.json";
import tokenApprovals from "./en/token-approvals.json";
import unlimitedApprovals from "./en/unlimited-approvals.json";
import addressPoisoning from "./en/address-poisoning.json";
import seedPhraseSafety from "./en/seed-phrase-safety.json";
import whyTransactionFailed from "./en/why-transaction-failed.json";
import readATransaction from "./en/read-a-transaction.json";
import gasFees from "./en/gas-fees.json";
import weiGweiEther from "./en/wei-gwei-ether.json";
import checksumAddresses from "./en/checksum-addresses.json";

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
  en: {
    "check-token-scam": checkTokenScam as LearnGuideText,
    "honeypot-token": honeypotToken as LearnGuideText,
    "liquidity-lock": liquidityLock as LearnGuideText,
    "token-approvals": tokenApprovals as LearnGuideText,
    "unlimited-approvals": unlimitedApprovals as LearnGuideText,
    "address-poisoning": addressPoisoning as LearnGuideText,
    "seed-phrase-safety": seedPhraseSafety as LearnGuideText,
    "why-transaction-failed": whyTransactionFailed as LearnGuideText,
    "read-a-transaction": readATransaction as LearnGuideText,
    "gas-fees": gasFees as LearnGuideText,
    "wei-gwei-ether": weiGweiEther as LearnGuideText,
    "checksum-addresses": checksumAddresses as LearnGuideText,
  },
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
  const words = all.split(/\s+/).filter(Boolean).length;
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
