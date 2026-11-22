import type { ToolId } from "@/config/tools";

/**
 * Learn guides (SEO_ROADMAP.md, Phase 2). Each guide is one JSON file per language under
 * `src/content/learn/<locale>/<slug>.json`; English is the source and the fallback.
 *
 * Inline text supports two marks only, rendered as React elements (never as HTML):
 *   **bold**   and   [label](tool:<tool id>) or [label](guide:<slug>) for links inside CRYPY.
 */
export type LearnTopic = "token-scams" | "approvals" | "transactions" | "gas-units" | "wallet-safety";

export type LearnBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "warning"; text: string }
  | { type: "tip"; text: string }
  | {
      type: "figure";
      kind: "approval";
      /** Labels drawn inside the diagram: wallet, wallet detail, permission, permission detail, spender, spender detail. */
      labels: [string, string, string, string, string, string];
      caption: string;
      alt: string;
    };

export interface LearnSection {
  /** Anchor for "On this page" links: lower-case letters, digits and dashes. */
  id: string;
  heading: string;
  blocks: LearnBlock[];
}

export interface LearnGuideText {
  /** Shown on the page and on cards. */
  title: string;
  /** Search result title, 50–60 characters including "| CRYPY". */
  seoTitle: string;
  /** Search result description, 120–160 characters. */
  description: string;
  /** One line on cards. */
  summary: string;
  /** Three to four key points at the top of the guide. */
  inShort: string[];
  sections: LearnSection[];
  faq: { q: string; a: string }[];
}

export interface LearnGuideMeta {
  slug: string;
  topic: LearnTopic;
  /** The tool the guide leads to (shown as its call to action), or null for general guides. */
  tool: ToolId | null;
  /** Up to three related guides, by slug. */
  related: string[];
  published: string;
  updated: string;
}

export type LearnGuide = LearnGuideMeta & LearnGuideText & { minutes: number };
