"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ToolCategory } from "@/config/tools";
import type { ToolView } from "@/lib/tools-view";

export interface ToolsDialogStrings {
  title: string;
  description: string;
  searchLabel: string;
  searchPlaceholder: string;
  /** Contains "{query}". */
  noResults: string;
  noWalletNeeded: string;
  shortcut: string;
  close: string;
}

export interface ToolsDialogProps {
  tools: ToolView[];
  categories: { id: ToolCategory; label: string }[];
  icons: Record<string, React.ReactNode>;
  strings: ToolsDialogStrings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One searchable list of every tool. Opened by the header "All tools" button,
 * the mobile Tools tab, or Ctrl/Cmd + K (see ToolsDialogLoader, which loads this lazily).
 */
export function ToolsDialog({ tools, categories, icons, strings, open, onOpenChange }: ToolsDialogProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const setOpen = onOpenChange;

  const groups = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const matches = tools.filter((tool) =>
      q === ""
        ? true
        : [tool.name, tool.question, tool.description, tool.categoryLabel].some((text) =>
            text.toLowerCase().includes(q),
          ),
    );
    return categories
      .map((category) => ({ ...category, tools: matches.filter((tool) => tool.category === category.id) }))
      .filter((group) => group.tools.length > 0);
  }, [deferredQuery, tools, categories]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-4 max-h-[calc(100dvh-2rem)] w-full translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-3xl md:top-16"
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
          <DialogTitle className="sr-only">{strings.title}</DialogTitle>
          <DialogDescription className="sr-only">{strings.description}</DialogDescription>
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="tool-search" className="sr-only">
            {strings.searchLabel}
          </label>
          <input
            id="tool-search"
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.searchPlaceholder}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
            {strings.shortcut}
          </kbd>
          <DialogClose
            aria-label={strings.close}
            className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-4 md:max-h-[60vh]">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {strings.noResults.replace("{query}", query.trim())}
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {groups.map((group) => (
                <section key={group.id} aria-labelledby={`tools-group-${group.id}`}>
                  <h2
                    id={`tools-group-${group.id}`}
                    className="mb-2 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {group.label}
                  </h2>
                  <ul className="flex flex-col gap-1">
                    {group.tools.map((tool) => (
                      <li key={tool.id}>
                        <Link
                          href={tool.href}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 rounded-lg p-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        >
                          <span className="mt-0.5 text-primary">{icons[tool.id]}</span>
                          <span className="flex min-w-0 flex-col">
                            <span className="flex flex-wrap items-center gap-2 font-medium">
                              {tool.name}
                              {tool.status !== "live" && (
                                <span className="rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                                  {tool.statusLabel}
                                </span>
                              )}
                            </span>
                            <span className="text-sm text-muted-foreground">{tool.question}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">{strings.noWalletNeeded}</p>
      </DialogContent>
    </Dialog>
  );
}
