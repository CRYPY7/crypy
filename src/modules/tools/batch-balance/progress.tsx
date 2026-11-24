"use client";

import { Check, Clock, Pause, Play, RefreshCw, X } from "lucide-react";
import { ChainIcon } from "@/components/chain-icon";
import { cn } from "@/lib/utils";
import { fill } from "@/modules/tools/shared/ui";
import type { BatchChain, BatchStrings } from "./widget";

/** One chain's progress as the scan API reports it (lib/batch-scan/engine.ts ChainState). */
export interface ChainProgress {
  phase: "reading" | "waiting" | "stalled" | "cross-checking" | "done" | "cancelled" | "gave-up";
  read: number;
  total: number;
  blocks: [string, string] | null;
  reason: string | null;
  crossCheck: { compared: number; matched: number; corrected: number } | null;
  tokens: string[];
  notOnChain: string[];
  prices: Record<string, number> | null;
}

export type JobStatus = "queued" | "running" | "paused" | "done" | "cancelled";

const busyPhases = new Set(["waiting", "stalled"]);

/** Board 56 / 58: overall progress, each chain's state, pause and cancel. Nothing here ever says "failed". */
export function ScanProgress({
  s,
  locale,
  chains,
  wallets,
  assets,
  status,
  position,
  startsIn,
  progress,
  onPause,
  onResume,
  onCancel,
}: {
  s: BatchStrings;
  locale: string;
  chains: BatchChain[];
  wallets: number;
  /** Assets per chain (coin + tokens that exist there), to count balances. */
  assets: Record<string, number>;
  status: JobStatus | "starting";
  position: number | null;
  startsIn: number | null;
  progress: Record<string, ChainProgress>;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const number = new Intl.NumberFormat(locale);
  const total = chains.reduce((sum, c) => sum + wallets * (assets[c.key] ?? 1), 0);
  const read = chains.reduce((sum, c) => sum + (progress[c.key]?.read ?? 0) * (assets[c.key] ?? 1), 0);
  const percent = total ? Math.floor((read / total) * 100) : 0;
  const button =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none";
  const blocks = (p: ChainProgress) =>
    p.blocks
      ? p.blocks[0] === p.blocks[1]
        ? fill(s.run.block, { block: number.format(BigInt(p.blocks[0])) })
        : fill(s.run.blocks, { from: number.format(BigInt(p.blocks[0])), to: number.format(BigInt(p.blocks[1])) })
      : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl font-bold sm:text-2xl">
            {fill(s.run.heading, { wallets: number.format(wallets) })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{s.run.where}</p>
        </div>
        <div className="flex gap-2">
          {status === "paused" ? (
            <button type="button" className={button} onClick={onResume}>
              <Play className="size-4" aria-hidden="true" />
              {s.run.resume}
            </button>
          ) : (
            <button type="button" className={button} onClick={onPause} disabled={status !== "running"}>
              <Pause className="size-4" aria-hidden="true" />
              {s.run.pause}
            </button>
          )}
          <button type="button" className={button} onClick={onCancel}>
            <X className="size-4" aria-hidden="true" />
            {s.cancel}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label={s.run.chains}>
        {status === "queued" ? (
          <div className="flex items-start gap-3" role="status">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {fill(s.run.queued, { position: position ?? 1, seconds: startsIn ?? 30 })}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{s.run.queuedNote}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" role="status">
              <p className="font-semibold">
                {status === "starting"
                  ? s.run.starting
                  : fill(s.run.overall, { read: number.format(read), total: number.format(total) })}
              </p>
              <span className="text-sm text-muted-foreground">
                {new Intl.NumberFormat(locale, { style: "percent" }).format(percent / 100)}
                {status === "paused" ? ` · ${s.run.paused}` : ""}
              </span>
              <span className="ms-auto hidden text-xs text-muted-foreground sm:inline">{s.run.usable}</span>
            </div>
            <div
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={s.run.heading.replace("{wallets}", String(wallets))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
          </>
        )}

        <ul className="mt-4 flex flex-col">
          {chains.map((chain) => {
            const p = progress[chain.key];
            const share = p && p.total ? (p.read / p.total) * 100 : 0;
            const busy = p && busyPhases.has(p.phase);
            const done = p?.phase === "done";
            return (
              <li
                key={chain.key}
                className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-t py-3 first:border-t-0 sm:grid-cols-[160px_1fr_110px_minmax(0,340px)] sm:gap-x-4"
              >
                <span className="flex items-center gap-2 font-medium">
                  <ChainIcon chain={chain.key} size={18} />
                  {chain.name}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted sm:order-none">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      done ? "bg-low" : busy ? "bg-high" : "bg-primary",
                    )}
                    style={{ width: `${share}%` }}
                  />
                </div>
                <span className="hidden text-sm tabular-nums sm:block">
                  {number.format(p?.read ?? 0)} / {number.format(p?.total ?? wallets)}
                </span>
                <span
                  className={cn(
                    "col-span-2 flex items-center gap-2 text-sm sm:col-span-1",
                    done ? "text-low" : busy ? "text-high" : "text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                  ) : busy ? (
                    <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  <span>
                    {p ? s.run.phase[p.phase] : status === "queued" ? "" : s.run.starting}
                    {p && done && p.blocks ? ` · ${blocks(p)}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
