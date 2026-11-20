"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { ChainIcon } from "@/components/chain-icon";
import { type RecentItem, addRecent, clearRecent, readRecent, recentEvent } from "./recent-store";

/** Records the current entity page in this browser's recent list. Renders nothing. */
export function RecordVisit({ path, kind, value, chain, label }: RecentItem) {
  useEffect(() => {
    addRecent({ path, kind, value, chain, label });
  }, [path, kind, value, chain, label]);
  return null;
}

function short(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

/** Home-page list of what this visitor looked up. Device-only; renders nothing on the server. */
export function RecentList({ title, clear, locale }: { title: string; clear: string; locale: string }) {
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => {
    const load = () => setItems(readRecent());
    load();
    window.addEventListener(recentEvent, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(recentEvent, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="mx-auto mt-6 max-w-3xl text-start" data-testid="recent">
      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <History className="size-4" aria-hidden="true" />
          {title}
        </span>
        <button type="button" onClick={clearRecent} className="hover:text-foreground">
          {clear}
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.path}>
            <Link
              href={`/${locale}${item.path}`}
              prefetch={false}
              className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary"
            >
              {item.chain && <ChainIcon chain={item.chain} size={14} />}
              {item.label && <span className="font-medium">{item.label}</span>}
              <span className="font-mono text-muted-foreground" dir="ltr">
                {short(item.value)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
