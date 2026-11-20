"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** Dark / light / system choice. Selection is shown only after hydration to avoid a mismatch. */
export function ThemeChoice({ label, options }: { label: string; options: { value: string; label: string }[] }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = hydrated && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setTheme(option.value)}
            className={cn(
              "h-11 rounded-lg border px-4 text-sm font-medium",
              checked ? "border-primary bg-primary/12" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
