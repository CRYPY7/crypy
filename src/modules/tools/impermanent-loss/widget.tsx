"use client";

import { useId, useState } from "react";
import { type Dec, toDisplay, toPlain } from "@/lib/math/decimal";
import { type CommonStrings, Figure, LinkButton, NumberField, Panel, ValueRow } from "../shared/ui";
import { type Field, type IlError, type IlInput, impermanentLoss } from "./il";

export interface IlStrings {
  changeA: string;
  changeAHint: string;
  changeB: string;
  changeBHint: string;
  deposit: string;
  depositHint: string;
  results: string;
  loss: string;
  lossHelp: string;
  held: string;
  pooled: string;
  difference: string;
  formula: string;
  limits: string;
  local: string;
  empty: string;
  errors: Record<IlError, string>;
}

const EMPTY: IlInput = { changeA: "", changeB: "", deposit: "" };

export function ImpermanentLossCalculator({
  strings,
  common,
  locale,
}: {
  strings: IlStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [input, setInput] = useState<IlInput>(EMPTY);
  const result = Object.values(input).some((v) => v.trim()) ? impermanentLoss(input) : null;
  const errors = result && !result.ok ? result.errors : {};
  const v = input.changeA.trim() && result?.ok ? result.value : null;
  const usd = (d: Dec) => `$${toDisplay(d, { places: 2, significant: 4, locale })}`;
  const field = (key: Field, unit?: string) => (
    <NumberField
      id={`${id}-${key}`}
      label={strings[key]}
      hint={strings[`${key}Hint` as keyof IlStrings] as string}
      unit={unit}
      value={input[key]}
      onChange={(value) => setInput((s) => ({ ...s, [key]: value }))}
      error={errors[key] && input[key].trim() ? strings.errors[errors[key]!] : ""}
    />
  );
  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-3">
        {field("changeA", "%")}
        {field("changeB", "%")}
        {field("deposit", "USD")}
      </div>
      <section aria-labelledby={`${id}-results`} aria-live="polite" className="mt-6 border-t border-border pt-5">
        <h2 id={`${id}-results`} className="font-heading text-lg font-semibold">
          {strings.results}
        </h2>
        {!v ? (
          <p className="mt-2 text-sm text-muted-foreground">{strings.empty}</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Figure
                label={strings.loss}
                value={`${toDisplay(v.loss, { places: 2, significant: 3, locale })}%`}
                help={strings.lossHelp}
                tone={v.loss.units < 0n ? "medium" : undefined}
                copy={toPlain(v.loss)}
                common={common}
              />
            </div>
            {v.held && v.pooled && v.difference && (
              <dl className="mt-4">
                <ValueRow label={strings.held} value={usd(v.held)} common={common} />
                <ValueRow label={strings.pooled} value={usd(v.pooled)} common={common} />
                <ValueRow label={strings.difference} value={usd(v.difference)} common={common} />
              </dl>
            )}
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{strings.formula}</p>
        <p className="mt-2 rounded-xl bg-medium/14 px-3 py-2 text-sm text-medium">{strings.limits}</p>
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton onClick={() => setInput({ changeA: "100", changeB: "0", deposit: "1000" })}>
            {common.example}
          </LinkButton>
          <LinkButton onClick={() => setInput(EMPTY)}>{common.clear}</LinkButton>
        </div>
      </div>
    </Panel>
  );
}
