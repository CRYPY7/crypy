"use client";

import { useId, useState } from "react";
import { ChainIcon } from "@/components/chain-icon";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/entity/copy-button";
import { FieldError, Panel, inputClass } from "../shared/ui";

export type TimestampStrings = Record<string, string>;
export interface TsChain {
  key: string;
  name: string;
}
type Mode = "date" | "block" | "unix";
type AtTime = { chain: string; block: number; time: number; estimate: boolean };

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** "2026-11-01T00:00" in UTC or the browser's zone → unix seconds; null when invalid. */
export function toUnix(value: string, zone: "utc" | "local"): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)) return null;
  const ms = zone === "utc" ? Date.parse(`${value}Z`) : new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
/** Seconds or milliseconds (13+ digits) → seconds. */
export function parseUnix(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,16}$/.test(v)) return null;
  const n = Number(v);
  return v.length >= 13 ? Math.floor(n / 1000) : n;
}

export function TimestampConverter({
  strings: s,
  locale,
  chains,
}: {
  strings: TimestampStrings;
  locale: string;
  chains: TsChain[];
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("date");
  const [date, setDate] = useState("");
  const [zone, setZone] = useState<"utc" | "local">("utc");
  const [block, setBlock] = useState("");
  const [chain, setChain] = useState(chains[0]?.key ?? "");
  const [unix, setUnix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [atTime, setAtTime] = useState<{ results: AtTime[]; unavailable: string[] } | null>(null);
  const [blockTime, setBlockTime] = useState<{ chain: string; block: number; time: number } | null>(null);

  const full = (sec: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(sec * 1000) +
    " UTC";
  const local = (sec: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(sec * 1000);
  const name = (key: string) => chains.find((c) => c.key === key)?.name ?? key;

  // Values are read from the form on submit, so typing before the page finished loading still counts.
  const findBlocks = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const t = toUnix(String(data.get("date") ?? date), (data.get("zone") as "utc" | "local") ?? zone);
    setAtTime(null);
    if (t === null) return setError(s.badDate!);
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/blocks?time=${t}`);
      const json = (await res.json()) as { ok: boolean; data?: { results: AtTime[]; unavailable: string[] } };
      if (!json.ok || !json.data) throw new Error();
      setAtTime(json.data);
    } catch {
      setError(s.failed!);
    } finally {
      setBusy(false);
    }
  };
  const findTime = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const value = String(data.get("block") ?? block).trim();
    const chainKey = String(data.get("chain") ?? chain);
    setBlockTime(null);
    if (!/^\d{1,12}$/.test(value)) return setError(s.badBlock!);
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/blocks?block=${value}&chain=${chainKey}`);
      const json = (await res.json()) as {
        ok: boolean;
        data?: { chain: string; block: number; time: number };
        error?: { code: string };
      };
      if (!json.ok || !json.data) return setError(json.error?.code === "NOT_FOUND" ? s.noBlock! : s.failed!);
      setBlockTime(json.data);
    } catch {
      setError(s.failed!);
    } finally {
      setBusy(false);
    }
  };
  const unixSec = parseUnix(unix);

  return (
    <Panel>
      <div role="group" aria-label={s.modes} className="mb-4 flex flex-wrap gap-2">
        {(["date", "block", "unix"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              mode === m ? "border-transparent bg-primary/14 font-semibold" : "hover:border-primary",
            )}
          >
            {s[`mode_${m}`]}
          </button>
        ))}
      </div>

      {mode === "date" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void findBlocks(e.currentTarget);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              {s.dateLabel}
              <input
                type="datetime-local"
                name="date"
                step="1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {s.zoneLabel}
              <select
                name="zone"
                value={zone}
                onChange={(e) => setZone(e.target.value as "utc" | "local")}
                className={inputClass}
              >
                <option value="utc">{s.zoneUtc}</option>
                <option value="local">{s.zoneLocal}</option>
              </select>
            </label>
            <button type="submit" disabled={busy} className={cn(buttonVariants({ size: "xl" }), "shrink-0")}>
              {busy ? s.working : s.findBlocks}
            </button>
          </div>
          {atTime && (
            <ul className="flex flex-col">
              {atTime.results.map((r) => (
                <li key={r.chain} className="flex flex-wrap items-center gap-3 border-t py-3">
                  <ChainIcon chain={r.chain} size={22} />
                  <span className="w-24 font-semibold">{name(r.chain)}</span>
                  <span className="technical text-base font-semibold">{r.block.toLocaleString(locale)}</span>
                  <span className="text-sm text-muted-foreground">{r.estimate ? s.estimate : full(r.time)}</span>
                  <span className="ms-auto">
                    <CopyButton value={String(r.block)} label={s.copy!} copiedLabel={s.copied!} />
                  </span>
                </li>
              ))}
              {atTime.unavailable.map((c) => (
                <li key={c} className="border-t py-3 text-sm text-muted-foreground">
                  {fill(s.chainDown!, { chain: name(c) })}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{s.dateNote}</p>
        </form>
      )}

      {mode === "block" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void findTime(e.currentTarget);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {s.chainLabel}
              <select name="chain" value={chain} onChange={(e) => setChain(e.target.value)} className={inputClass}>
                {chains.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              {s.blockLabel}
              <input
                inputMode="numeric"
                name="block"
                dir="ltr"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                placeholder="23694410"
                className={`${inputClass} technical`}
              />
            </label>
            <button type="submit" disabled={busy} className={cn(buttonVariants({ size: "xl" }), "shrink-0")}>
              {busy ? s.working : s.findTime}
            </button>
          </div>
          {blockTime && (
            <p className="rounded-lg border p-3 text-sm">
              {fill(s.blockResult!, { block: blockTime.block.toLocaleString(locale), chain: name(blockTime.chain) })}{" "}
              <b>{full(blockTime.time)}</b>
              <span className="text-muted-foreground"> · {fill(s.yourTime!, { time: local(blockTime.time) })}</span>
              <span className="text-muted-foreground"> · {fill(s.unixIs!, { unix: blockTime.time })}</span>
            </p>
          )}
        </form>
      )}

      {mode === "unix" && (
        <div className="flex flex-col gap-3">
          <label htmlFor={`${id}-unix`} className="text-sm font-medium">
            {s.unixLabel}
          </label>
          <input
            id={`${id}-unix`}
            inputMode="numeric"
            dir="ltr"
            value={unix}
            onChange={(e) => setUnix(e.target.value)}
            placeholder={String(1793491200)}
            className={`${inputClass} technical`}
          />
          {unix && unixSec === null && <FieldError id={`${id}-err`}>{s.badUnix}</FieldError>}
          {unixSec !== null && (
            <p className="text-sm">
              = <b>{full(unixSec)}</b>
              <span className="text-muted-foreground"> · {fill(s.yourTime!, { time: local(unixSec) })}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">{s.unixNote}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
    </Panel>
  );
}
