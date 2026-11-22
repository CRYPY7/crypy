"use client";

import { ChainIcon } from "@/components/chain-icon";
import { Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { Locale } from "@/i18n/locales";
import { classifySearch } from "@/lib/search/classify";
import { formatAmount } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type SearchMessageKey =
  "invalid" | "empty" | "bad-checksum" | "not-found-tx" | "unavailable" | "rate-limited" | "error";

export interface SearchStrings {
  label: string;
  placeholder: string;
  submit: string;
  checking: string;
  lookupAnyway: string;
  close: string;
  choose: string;
  /** Contains "{chains}". */
  partial: string;
  result: Record<SearchMessageKey, string>;
  chains: Record<string, string>;
  nativeSymbols: Record<string, string>;
  /** Templates with {count}, {total}, {chains}, {amount}, {symbol}. */
  found: {
    title: string;
    overview: string;
    inactive: string;
    sentTx: string;
    holds: string;
    noBalance: string;
    open: Record<"token" | "account" | "contract", string>;
    kinds: Record<"account" | "delegated" | "token" | "contract" | "tx", string>;
  };
}

interface ChoiceLookup {
  kind: "account" | "token" | "contract";
  hasActivity: boolean;
  delegated?: boolean;
  token?: { name: string; symbol: string };
  nativeBalance?: { raw: string; decimals: number };
}

interface Choice {
  chain: string;
  kind: "account" | "token" | "contract" | "tx";
  path: string;
  lookup?: ChoiceLookup;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "message"; key: SearchMessageKey; tone: "warning" | "danger"; lowercase?: string }
  | { kind: "choose"; choices: Choice[]; partial: string[]; overview?: string; inactive: string[] };

interface ResolveResponse {
  ok: boolean;
  data?: {
    status: string;
    target?: string | null;
    choices?: Choice[];
    unavailable?: string[];
    overview?: string;
    inactive?: string[];
  };
  error?: { code: string };
}

/**
 * Universal search. Recognises the format instantly in the browser, then asks the server
 * where the address or transaction lives and opens the right page.
 * Without JavaScript the form still works through /<locale>/search.
 */
export function UniversalSearch({
  strings,
  locale,
  variant = "hero",
  className,
}: {
  strings: SearchStrings;
  locale: Locale;
  variant?: "hero" | "compact";
  className?: string;
}) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const hero = variant === "hero";
  const rootRef = useRef<HTMLDivElement>(null);
  const open = state.kind === "message" || state.kind === "choose";

  // The compact (header) result floats like a dropdown: close it on Esc or a click outside.
  useEffect(() => {
    if (hero || !open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setState({ kind: "idle" });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setState({ kind: "idle" });
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [hero, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const local = classifySearch(value);
    if (local.kind === "empty" || local.kind === "invalid") {
      setState({ kind: "message", key: local.kind, tone: "warning" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/v1/search/resolve?q=${encodeURIComponent(local.value)}`);
      const body = (await response.json()) as ResolveResponse;
      if (!body.ok || !body.data) {
        const code = body.error?.code;
        setState({
          kind: "message",
          key: code === "RATE_LIMITED" ? "rate-limited" : code === "UPSTREAM_UNAVAILABLE" ? "unavailable" : "error",
          tone: "warning",
        });
        return;
      }
      const data = body.data;
      if (data.status === "bad-checksum") {
        // Looking an address up is harmless; the lowercase form carries no checksum. Sending funds is not.
        return setState({ kind: "message", key: "bad-checksum", tone: "danger", lowercase: local.value.toLowerCase() });
      }
      if (data.status === "invalid") return setState({ kind: "message", key: "invalid", tone: "warning" });
      if (data.status === "not-found") return setState({ kind: "message", key: "not-found-tx", tone: "warning" });
      if (data.target) {
        router.push(localePath(locale, data.target));
        setState({ kind: "idle" });
        return;
      }
      setState({
        kind: "choose",
        choices: data.choices ?? [],
        partial: data.unavailable ?? [],
        overview: data.overview,
        inactive: data.inactive ?? [],
      });
    } catch {
      setState({ kind: "message", key: "unavailable", tone: "warning" });
    }
  }

  const loading = state.kind === "loading";

  return (
    <div ref={rootRef} className={cn(!hero && "relative", className)}>
      <form
        role="search"
        action={localePath(locale, "/search")}
        method="get"
        onSubmit={submit}
        aria-busy={loading}
        className={cn(
          // Visible focus for keyboard users (the input itself has no outline; WCAG 2.4.7).
          "flex items-center gap-2 border bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background",
          hero ? "flex-wrap rounded-2xl border-border-strong p-2" : "h-10 rounded-lg px-3",
        )}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {strings.label}
        </label>
        <div className={cn("flex min-w-0 flex-1 items-center gap-2", hero && "basis-72 px-3")}>
          {loading ? (
            <Loader2
              className={cn("shrink-0 animate-spin text-primary", hero ? "size-5" : "size-4")}
              aria-hidden="true"
            />
          ) : (
            <Search className={cn("shrink-0 text-muted-foreground", hero ? "size-5" : "size-4")} aria-hidden="true" />
          )}
          <input
            id={`${id}-q`}
            name="q"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={200}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (state.kind !== "loading") setState({ kind: "idle" });
            }}
            placeholder={strings.placeholder}
            aria-describedby={`${id}-result`}
            className={cn(
              "technical min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-muted-foreground",
              hero ? "h-12 text-base" : "h-full text-sm",
            )}
          />
        </div>
        {hero && (
          <button type="submit" disabled={loading} className={cn(buttonVariants({ size: "xl" }), "grow sm:grow-0")}>
            {strings.submit}
          </button>
        )}
      </form>
      <div
        id={`${id}-result`}
        aria-live="polite"
        className={cn(
          "empty:hidden",
          // Header search: a floating panel under the field, so the header never changes height.
          !hero &&
            "absolute inset-x-0 top-full z-50 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-popover shadow-lg",
        )}
      >
        {loading && hero && <p className="mt-3 text-start text-sm text-muted-foreground">{strings.checking}</p>}
        {state.kind === "message" && (
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-start text-sm",
              hero && "mt-3",
              state.tone === "danger" ? "border-critical/50" : "border-high/40",
            )}
          >
            <div className="min-w-0 flex-1">
              <p>{strings.result[state.key]}</p>
              {state.lowercase && (
                <Link
                  href={localePath(locale, `/address/${state.lowercase}`)}
                  prefetch={false}
                  onClick={() => setState({ kind: "idle" })}
                  className="mt-2 inline-block font-medium text-primary underline-offset-4 hover:underline"
                >
                  {strings.lookupAnyway}
                </Link>
              )}
            </div>
            {!hero && <CloseButton label={strings.close} onClick={() => setState({ kind: "idle" })} />}
          </div>
        )}
        {state.kind === "choose" && (
          <ChoicePanel
            state={state}
            strings={strings}
            locale={locale}
            hero={hero}
            onClose={() => setState({ kind: "idle" })}
          />
        )}
      </div>
    </div>
  );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** What the address is on one chain, in a few words. */
function choiceFact(choice: Choice, strings: SearchStrings, locale: Locale): string {
  const lookup = choice.lookup;
  if (!lookup) return "";
  if (lookup.kind === "token" && lookup.token) {
    return lookup.token.name ? `${lookup.token.name} (${lookup.token.symbol})` : lookup.token.symbol;
  }
  const balance = lookup.nativeBalance;
  if (balance && BigInt(balance.raw) > 0n) {
    return fill(strings.found.holds, {
      amount: formatAmount(balance.raw, balance.decimals, locale, 4),
      symbol: strings.nativeSymbols[choice.chain] ?? "",
    });
  }
  return lookup.hasActivity && lookup.kind === "account" ? strings.found.sentTx : strings.found.noBalance;
}

const kindTone: Record<string, string> = {
  token: "text-primary",
  account: "text-low",
  delegated: "text-low",
  contract: "text-high",
  tx: "text-muted-foreground",
};

function ChoicePanel({
  state,
  strings,
  locale,
  hero,
  onClose,
}: {
  state: Extract<State, { kind: "choose" }>;
  strings: SearchStrings;
  locale: Locale;
  hero: boolean;
  onClose: () => void;
}) {
  const total = state.choices.length + state.inactive.length + state.partial.length;
  const isTx = state.choices.some((choice) => choice.kind === "tx");
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card text-start text-sm", hero && "mt-3")}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="font-semibold">
          {isTx ? strings.choose : fill(strings.found.title, { count: state.choices.length, total })}
        </p>
        {!hero && <CloseButton label={strings.close} onClick={onClose} />}
      </div>
      <ul className="divide-y">
        {state.choices.map((choice) => {
          const kindKey = choice.lookup?.delegated ? "delegated" : choice.kind;
          const action = choice.kind === "tx" ? strings.found.kinds.tx : strings.found.open[choice.kind];
          return (
            <li key={choice.path} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  <ChainIcon chain={choice.chain} size={18} />
                  {strings.chains[choice.chain] ?? choice.chain}
                </span>
                <span className={cn("ms-2 text-xs font-semibold", kindTone[kindKey])}>
                  {strings.found.kinds[kindKey]}
                </span>
                {choice.lookup && (
                  <span className="block truncate text-muted-foreground">{choiceFact(choice, strings, locale)}</span>
                )}
              </span>
              <Link
                href={localePath(locale, choice.path)}
                onClick={onClose}
                className={buttonVariants({ variant: "outline", size: "md" })}
              >
                {action}
              </Link>
            </li>
          );
        })}
      </ul>
      {state.inactive.length > 0 && (
        <p className="border-t px-4 py-2.5 text-muted-foreground">
          {fill(strings.found.inactive, {
            chains: state.inactive.map((chain) => strings.chains[chain] ?? chain).join(", "),
          })}
        </p>
      )}
      {state.partial.length > 0 && (
        <p className="border-t px-4 py-2.5 text-muted-foreground">
          {strings.partial.replace("{chains}", state.partial.map((c) => strings.chains[c] ?? c).join(", "))}
        </p>
      )}
      {state.overview && (
        <Link
          href={localePath(locale, state.overview)}
          onClick={onClose}
          className="block bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {strings.found.overview} →
        </Link>
      )}
    </div>
  );
}
