"use client";

import Link from "next/link";
import { useState } from "react";
import type { ToolCategory } from "@/config/tools";
import type { ToolView } from "@/lib/tools-view";
import { cn } from "@/lib/utils";

const categoryColor: Record<ToolCategory, string> = {
  security: "text-critical",
  wallet: "text-primary",
  network: "text-low",
  monitoring: "text-high",
  utilities: "text-muted-foreground",
};

/** Tool cards with category filter chips. */
export function ToolsGrid({
  tools,
  categories,
  strings,
}: {
  tools: ToolView[];
  categories: { id: ToolCategory; label: string }[];
  strings: { all: string; filterLabel: string; youNeed: string; open: string };
}) {
  const [picked, setPicked] = useState<ToolCategory | "all">("all");
  const visible = picked === "all" ? tools : tools.filter((tool) => tool.category === picked);
  const chips: { id: ToolCategory | "all"; label: string }[] = [{ id: "all", label: strings.all }, ...categories];

  return (
    <div>
      <div role="group" aria-label={strings.filterLabel} className="mb-5 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={picked === chip.id}
            onClick={() => setPicked(chip.id)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
              picked === chip.id
                ? "border-primary bg-primary/12 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((tool) => (
          <li key={tool.id}>
            <Link
              prefetch={false}
              data-intent-prefetch=""
              href={tool.href}
              className="flex h-full flex-col gap-2.5 rounded-xl border bg-card p-5 transition-colors hover:border-border-strong"
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn("text-xs font-semibold tracking-wider uppercase", categoryColor[tool.category])}>
                  {tool.categoryLabel}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    tool.status === "live" ? "bg-primary/14 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {tool.statusLabel}
                </span>
              </span>
              <span className="font-heading text-lg font-semibold">{tool.name}</span>
              <span className="flex-1 text-sm text-muted-foreground">{tool.description}</span>
              <span className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-sm">
                <span className="text-muted-foreground">
                  {strings.youNeed} <span className="text-foreground">{tool.input}</span>
                </span>
                <span className="font-semibold text-primary">
                  {strings.open}{" "}
                  <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
                    →
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
