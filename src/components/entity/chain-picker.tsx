"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChainIcon } from "@/components/chain-icon";
import { CHAINS_COOKIE, CHAINS_PARAM, type ChainSelection, formatSelection } from "@/lib/chains/selection";
import { cn } from "@/lib/utils";

export interface ChainPickerStrings {
  button: string;
  used: string;
  all: string;
  title: string;
  usedTitle: string;
  usedDesc: string;
  allTitle: string;
  allDesc: string;
  pickTitle: string;
  pickDesc: string;
  isUsed: string;
  notUsed: string;
  cancel: string;
  /** ICU-free: "{count}" is replaced. */
  scan: string;
  scanOne: string;
  remembered: string;
  /** Shown on the button while the new scan loads. */
  updating: string;
}

/**
 * "Chains: Used (2) ▾" — chooses which chains an address tool scans. The choice goes into the link (?chains=)
 * and a first-party cookie, so it is remembered on this device. A panel under the button on wider screens, a
 * bottom sheet on phones (design boards 34–35). Reads nothing from the wallet and signs nothing.
 */
export function ChainPicker({
  selection,
  chains,
  scanCount,
  strings: s,
}: {
  selection: ChainSelection;
  chains: { key: string; name: string; used: boolean }[];
  scanCount: number;
  strings: ChainPickerStrings;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState(selection.mode);
  const [picked, setPicked] = useState<string[]>(selection.mode === "pick" ? selection.chains : []);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  });

  function close() {
    setOpen(false);
    setMode(selection.mode);
    setPicked(selection.mode === "pick" ? selection.chains : []);
    button.current?.focus();
  }

  const next: ChainSelection | null =
    mode === "pick"
      ? picked.length > 0
        ? { mode: "pick", chains: chains.map((c) => c.key).filter((k) => picked.includes(k)) }
        : null
      : { mode };
  const count = mode === "all" ? chains.length : mode === "used" ? chains.filter((c) => c.used).length : picked.length;

  function apply() {
    if (!next) return;
    const value = formatSelection(next);
    document.cookie = `${CHAINS_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    const url = new URL(window.location.href);
    url.searchParams.set(CHAINS_PARAM, value);
    url.searchParams.delete("chain");
    setOpen(false);
    // A narrowed or widened scan can take a while on busy wallets: the button shows it is working until it lands.
    startTransition(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
  }

  const label =
    selection.mode === "all"
      ? s.all
      : selection.mode === "used"
        ? `${s.used} (${scanCount})`
        : selection.chains.length === 1
          ? chains.find((c) => c.key === selection.chains[0])?.name
          : `${selection.chains.length}`;
  const option = (value: ChainSelection["mode"], title: string, desc: string) => (
    <label className={cn("flex cursor-pointer gap-3 rounded-lg px-3 py-2.5", mode === value && "bg-primary/14")}>
      <input
        type="radio"
        name={`${id}-mode`}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="mt-1 shrink-0 self-start accent-primary"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={pending || undefined}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm",
          open ? "border-primary" : "hover:border-primary",
        )}
      >
        <span className="flex -space-x-1">
          {chains
            .filter((c) =>
              selection.mode === "pick" ? selection.chains.includes(c.key) : selection.mode === "all" || c.used,
            )
            .slice(0, 3)
            .map((c) => (
              <ChainIcon key={c.key} chain={c.key} size={18} />
            ))}
        </span>
        <span>
          {s.button} <b>{label}</b>
        </span>
        {pending && (
          <span role="status" className="flex items-center gap-1 text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            {s.updating}
          </span>
        )}
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/40 sm:hidden" />
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={s.title}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border bg-card p-2 pb-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-12 sm:w-96 sm:rounded-2xl sm:pb-2"
          >
            <p className="px-3 pt-2 pb-1 font-semibold sm:sr-only">{s.title}</p>
            {option("used", s.usedTitle, s.usedDesc)}
            {option("all", s.allTitle, s.allDesc)}
            {option("pick", s.pickTitle, s.pickDesc)}
            {mode === "pick" && (
              <fieldset className="mx-1 mt-1 border-t pt-1">
                <legend className="sr-only">{s.pickTitle}</legend>
                {chains.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(c.key)}
                      onChange={(e) =>
                        setPicked((p) => (e.target.checked ? [...p, c.key] : p.filter((k) => k !== c.key)))
                      }
                      className="accent-primary"
                    />
                    <ChainIcon chain={c.key} size={20} />
                    <span className="flex-1">{c.name}</span>
                    <span className={cn("text-xs", c.used ? "text-low" : "text-muted-foreground")}>
                      {c.used ? s.isUsed : s.notUsed}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="mt-1 flex justify-end gap-2 border-t px-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border px-3 py-2 text-sm hover:border-primary"
              >
                {s.cancel}
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!next || count === 0}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {count === 1 ? s.scanOne : s.scan.replace("{count}", String(count))}
              </button>
            </div>
            <p className="px-3 pt-1 text-xs text-muted-foreground">{s.remembered}</p>
          </div>
        </>
      )}
    </div>
  );
}
