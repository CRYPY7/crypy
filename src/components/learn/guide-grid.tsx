"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GuideCard, type GuideCardData } from "./guide-card";

/**
 * All guides with topic filters. Every guide is linked in the server-rendered HTML (the featured one in its own card
 * above), so search engines and visitors without JavaScript reach every guide; the filter only changes what shows.
 */
export function GuideGrid({
  guides,
  featured,
  topics,
  allLabel,
  groupLabel,
}: {
  guides: GuideCardData[];
  /** Shown above the grid, so listed here only when a topic is chosen. */
  featured?: string;
  topics: { id: string; label: string }[];
  allLabel: string;
  groupLabel: string;
}) {
  const [topic, setTopic] = useState<string | null>(null);
  const shown = topic
    ? guides.filter((guide) => guide.topic === topic)
    : guides.filter((guide) => guide.slug !== featured);
  const chip = (active: boolean) =>
    cn(
      "min-h-10 rounded-full border px-4 text-sm transition-colors",
      active
        ? "border-primary bg-primary font-semibold text-primary-foreground"
        : "bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={topic === null}
          onClick={() => setTopic(null)}
          className={chip(topic === null)}
        >
          {allLabel}
        </button>
        {topics.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={topic === item.id}
            onClick={() => setTopic(item.id)}
            className={chip(topic === item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
        {shown.map((guide) => (
          <li key={guide.slug}>
            <GuideCard guide={guide} />
          </li>
        ))}
      </ul>
    </div>
  );
}
