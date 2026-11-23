import { Check, CircleAlert, Minus, X } from "lucide-react";
import type { DayBar, DayState, HealthState } from "@/lib/health/status";
import { cn } from "@/lib/utils";

/**
 * Small shared pieces of the status page and the admin dashboard (boards 51–53). Colour is never the only signal:
 * every state also has its icon and words.
 */
export const stateText: Record<HealthState, string> = {
  operational: "text-low",
  degraded: "text-medium",
  down: "text-critical",
  unknown: "text-muted-foreground",
};

const dayBg: Record<DayState, string> = {
  operational: "bg-low",
  degraded: "bg-medium",
  down: "bg-critical",
  none: "bg-muted",
};

export function StateIcon({ state, className }: { state: HealthState; className?: string }) {
  const Icon = { operational: Check, degraded: CircleAlert, down: X, unknown: Minus }[state];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", className)} />;
}

export function StateChip({ state, label, className }: { state: HealthState; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap",
        stateText[state],
        className,
      )}
    >
      <StateIcon state={state} />
      {label}
    </span>
  );
}

/**
 * Daily bars, oldest first. On phones only the last 30 days show. Each bar's day and result are in its title (mouse)
 * and the whole row has one summary for screen readers.
 */
export function DayBars({
  bars,
  summary,
  titleFor,
}: {
  bars: readonly DayBar[];
  summary: string;
  titleFor: (bar: DayBar) => string;
}) {
  return (
    <div role="img" aria-label={summary} className="flex h-6 gap-[2px]">
      {bars.map((bar, i) => (
        <span
          key={bar.day}
          title={titleFor(bar)}
          className={cn("h-full flex-1 rounded-[2px]", dayBg[bar.state], i < bars.length - 30 && "hidden sm:block")}
        />
      ))}
    </div>
  );
}

export function LegendSwatch({ state }: { state: DayState }) {
  return <span aria-hidden="true" className={cn("size-3 rounded-[3px]", dayBg[state])} />;
}
