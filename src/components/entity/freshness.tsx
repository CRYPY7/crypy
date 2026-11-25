"use client";

import { CircleMinus, Clock3, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * How fresh a result is (stabilization S2, boards 60–61). One look for every tool:
 * - `FreshLine`: read now / N minutes ago, with Refresh (state 1–2);
 * - `SavedNotice`: shown from an earlier reading because a fresh read failed now (state 3, amber);
 * - `NotCheckedNotice`: couldn't read now and nothing earlier (state 4, grey, never "empty").
 * Strings come from the server with `{ago}`, `{time}` and `{chain}` placeholders; ages are worked out in the browser
 * (the server's render shows the `pending` text until then, so nothing mismatches).
 */

/** Minute ticks in the browser; null on the server and before hydration. */
function subscribe(callback: () => void) {
  const id = setInterval(callback, 30_000);
  return () => clearInterval(id);
}
const minute = () => Math.floor(Date.now() / 30_000) * 30_000;

function useNow(): number | null {
  return useSyncExternalStore(subscribe, minute, () => null);
}

/** `atLeastAMinute`: a saved reading is never shown as "now". */
export function ago(at: number, now: number, locale: string, atLeastAMinute = false): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.max(atLeastAMinute ? 1 : 0, Math.round((now - at) / 60_000));
  if (minutes < 1) return rtf.format(0, "second");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

function fillText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function useText(
  template: string,
  pending: string,
  at: string,
  locale: string,
  values: Record<string, string>,
  saved = true,
) {
  const now = useNow();
  if (now === null) return fillText(pending, values);
  const time = new Date(at);
  return fillText(template, {
    ...values,
    ago: ago(time.getTime(), now, locale, saved),
    time: time.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
  });
}

function RetryButton({ label, busyLabel, primary }: { label: string; busyLabel: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => start(() => router.refresh())}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-60 w-full sm:w-auto",
        primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border text-primary hover:border-primary",
      )}
    >
      <RotateCw aria-hidden className={cn("size-4", busy && "animate-spin")} />
      {busy ? busyLabel : label}
    </button>
  );
}

export interface RetryLabels {
  retry: string;
  retrying: string;
}

/** State 1–2: "Read 12 minutes ago · 14:02" with Refresh. */
export function FreshLine({
  at,
  locale,
  text,
  pending,
  labels,
}: {
  at: string;
  locale: string;
  text: string;
  pending: string;
  labels: RetryLabels;
}) {
  const line = useText(text, pending, at, locale, {}, false);
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" data-freshness="fresh">
      <span>{line}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => start(() => router.refresh())}
        className="inline-flex items-center gap-1.5 rounded-md text-primary underline-offset-4 hover:underline disabled:opacity-60"
      >
        <RotateCw aria-hidden className={cn("size-3.5", busy && "animate-spin")} />
        {busy ? labels.retrying : labels.retry}
      </button>
    </p>
  );
}

/** State 3 (amber): shown from an earlier reading. */
export function SavedNotice({
  at,
  locale,
  title,
  pending,
  body,
  chain = "",
  labels,
  compact,
}: {
  at: string;
  locale: string;
  title: string;
  pending: string;
  body?: string;
  chain?: string;
  labels: RetryLabels;
  compact?: boolean;
}) {
  const heading = useText(title, pending, at, locale, { chain });
  return (
    <div
      role="status"
      data-freshness="saved"
      className={cn(
        "flex flex-col items-stretch gap-3 rounded-xl border border-medium/40 bg-medium/8 text-sm sm:flex-row sm:items-center",
        compact ? "px-3 py-2.5" : "px-4 py-3",
      )}
    >
      <div className="flex flex-1 items-start gap-3">
        <Clock3 aria-hidden className="mt-0.5 size-5 shrink-0 text-medium" />
        <div>
          <p className="font-semibold">{heading}</p>
          {body && <p className="mt-0.5 text-muted-foreground">{fillText(body, { chain })}</p>}
        </div>
      </div>
      <RetryButton label={labels.retry} busyLabel={labels.retrying} primary />
    </div>
  );
}

/** State 4 (grey, dashed): couldn't read now and nothing earlier. */
export function NotCheckedNotice({ title, body, labels }: { title: string; body: string; labels: RetryLabels }) {
  return (
    <div
      role="status"
      data-freshness="not-checked"
      className="flex flex-col items-stretch gap-3 rounded-xl border border-dashed px-4 py-3 text-sm sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 items-start gap-3">
        <CircleMinus aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-muted-foreground">{body}</p>
        </div>
      </div>
      <RetryButton label={labels.retry} busyLabel={labels.retrying} />
    </div>
  );
}

/** Small "from 2 hours ago" tag for a chain card. */
export function SavedTag({ at, locale, text, pending }: { at: string; locale: string; text: string; pending: string }) {
  const label = useText(text, pending, at, locale, {});
  return <span className="text-xs font-medium text-medium">{label}</span>;
}

/** One reload at a time, however many "checking" notices a page shows. */
let reloadPending = false;

/**
 * State 2: shown from an earlier reading while a slow fresh read finishes on the server. The page reloads itself a
 * few seconds later and then shows the new reading (the server keeps it ready for a minute).
 */
export function CheckingNotice({
  at,
  locale,
  title,
  pending,
  body,
  chain = "",
}: {
  at: string;
  locale: string;
  title: string;
  pending: string;
  body: string;
  chain?: string;
}) {
  const heading = useText(title, pending, at, locale, { chain });
  const router = useRouter();
  useEffect(() => {
    if (reloadPending) return;
    reloadPending = true;
    const id = setTimeout(() => {
      reloadPending = false;
      router.refresh();
    }, RELOAD_MS);
    return () => {
      clearTimeout(id);
      reloadPending = false;
    };
  }, [router]);
  return (
    <div
      role="status"
      data-freshness="checking"
      className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/8 px-4 py-3 text-sm"
    >
      <RotateCw aria-hidden className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
      <div>
        <p className="font-semibold">{heading}</p>
        <p className="mt-0.5 text-muted-foreground">{fillText(body, { chain })}</p>
      </div>
    </div>
  );
}

const RELOAD_MS = 5_000;
