import Link from "next/link";
import { cn } from "@/lib/utils";

/** What a guide card shows; plain data so the same card renders on the server and in the topic filter. */
export interface GuideCardData {
  slug: string;
  href: string;
  topic: string;
  topicLabel: string;
  title: string;
  summary: string;
  readTime: string;
  /** "Tool: Approval Checker" */
  toolLine: string;
}

/** Topic colours: one per topic, readable in both themes. */
export const topicClass: Record<string, string> = {
  "token-scams": "bg-critical/12 text-critical",
  approvals: "bg-high/12 text-high",
  transactions: "bg-primary/12 text-primary",
  "gas-units": "bg-low/12 text-low",
  "wallet-safety": "bg-muted text-foreground",
};

export function TopicTag({ topic, label }: { topic: string; label: string }) {
  return (
    <span className={cn("self-start rounded-full px-2 py-0.5 text-xs font-semibold", topicClass[topic])}>{label}</span>
  );
}

export function GuideCard({ guide, large = false }: { guide: GuideCardData; large?: boolean }) {
  return (
    <Link
      prefetch={false}
      data-intent-prefetch=""
      href={guide.href}
      className="flex h-full flex-col gap-2.5 rounded-2xl border bg-card p-5 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <TopicTag topic={guide.topic} label={guide.topicLabel} />
      <span className={cn("font-heading leading-snug font-bold", large ? "text-2xl" : "text-lg")}>{guide.title}</span>
      <span className={cn("text-muted-foreground", large ? "text-base" : "text-sm")}>{guide.summary}</span>
      <span className="mt-auto flex flex-wrap gap-x-2 pt-1 text-xs text-muted-foreground">
        <span>{guide.readTime}</span>
        <span aria-hidden="true">·</span>
        <span>{guide.toolLine}</span>
      </span>
    </Link>
  );
}
