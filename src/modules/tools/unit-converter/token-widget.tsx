"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { cn } from "@/lib/utils";
import { type CommonStrings, FieldError, LinkButton, Panel, fill, inputClass } from "../shared/ui";
import { type DecimalsError, type ParseError, formatExact, parseAmount, parseDecimals } from "./units";

export interface TokenDecimalsStrings {
  title: string;
  intro: string;
  decimals: string;
  common: string;
  amount: string;
  base: string;
  baseHint: string;
  explain: string;
  local: string;
  errors: Record<ParseError | DecimalsError | "base-whole", string>;
}

/** Well-known decimals, as examples only: always check the token's own decimals. */
const presets = [
  { label: "USDC / USDT (Ethereum)", decimals: 6 },
  { label: "WBTC", decimals: 8 },
  { label: "ETH, BNB, most tokens", decimals: 18 },
];

type State = { decimals: string; source: "amount" | "base"; text: string };

export function TokenDecimalsConverter({ strings, common }: { strings: TokenDecimalsStrings; common: CommonStrings }) {
  const id = useId();
  const [state, setState] = useState<State>({ decimals: "18", source: "amount", text: "" });
  const decimals = parseDecimals(state.decimals);
  const d = decimals.ok ? decimals.decimals : null;
  const parsed = d !== null && state.text.trim() ? parseAmount(state.text, state.source === "amount" ? d : 0) : null;
  const base = parsed?.ok ? parsed.wei : null;
  const amountShown = state.source === "amount" ? state.text : base !== null && d !== null ? formatExact(base, d) : "";
  const baseShown = state.source === "base" ? state.text : base !== null ? base.toString() : "";
  const errorFor = (source: State["source"]) => {
    if (state.source !== source || !parsed || parsed.ok) return "";
    if (source === "base" && parsed.error === "too-precise") return strings.errors["base-whole"];
    return strings.errors[parsed.error];
  };

  const field = (source: State["source"], label: string, value: string, hint?: string) => {
    const inputId = `${id}-${source}`;
    const error = errorFor(source);
    return (
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            inputMode={source === "base" ? "numeric" : "decimal"}
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            value={value}
            placeholder="0"
            disabled={d === null}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={`${inputId}-error${hint ? ` ${inputId}-hint` : ""}`}
            onChange={(event) => setState((s) => ({ ...s, source, text: event.target.value }))}
            className={`${inputClass} technical`}
          />
          <CopyButton value={value} label={`${common.copy}: ${label}`} copiedLabel={common.copied} />
        </div>
        {hint && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        <FieldError id={`${inputId}-error`}>{error}</FieldError>
      </div>
    );
  };

  return (
    <Panel id="token-decimals" aria-labelledby={`${id}-title`} className="mt-8 scroll-mt-24">
      <h2 id={`${id}-title`} className="font-heading text-lg font-semibold">
        {strings.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{strings.intro}</p>
      <div className="mt-5">
        <label htmlFor={`${id}-decimals`} className="mb-1.5 block text-sm font-medium">
          {strings.decimals}
        </label>
        <input
          id={`${id}-decimals`}
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          value={state.decimals}
          aria-invalid={!decimals.ok || undefined}
          aria-describedby={`${id}-decimals-error`}
          onChange={(event) => setState((s) => ({ ...s, decimals: event.target.value }))}
          className={`${inputClass} technical max-w-40`}
        />
        <FieldError id={`${id}-decimals-error`}>{decimals.ok ? "" : strings.errors[decimals.error]}</FieldError>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{strings.common}</span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setState((s) => ({ ...s, decimals: String(preset.decimals) }))}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
                state.decimals === String(preset.decimals) && "border-primary text-primary",
              )}
            >
              {preset.label} · {preset.decimals}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-5">
        {field("amount", strings.amount, amountShown)}
        {field("base", strings.base, baseShown, strings.baseHint)}
      </div>
      {d !== null && base !== null && (
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          {fill(strings.explain, { decimals: d })}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton onClick={() => setState({ decimals: "6", source: "amount", text: "1234.56" })}>
            {common.example}
          </LinkButton>
          <LinkButton onClick={() => setState((s) => ({ ...s, text: "" }))}>{common.clear}</LinkButton>
        </div>
      </div>
    </Panel>
  );
}
