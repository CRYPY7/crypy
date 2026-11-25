"use client";

import { useId, useState } from "react";
import { type Dec, toDisplay, toPlain } from "@/lib/math/decimal";
import { type CommonStrings, Figure, LinkButton, NumberField, Panel, ValueRow, fill } from "../shared/ui";
import { type Field, type LtvError, type LtvInput, loanToValue } from "./ltv";

export interface LtvStrings {
  collateral: string;
  collateralHint: string;
  price: string;
  priceHint: string;
  debt: string;
  debtHint: string;
  maxLtv: string;
  maxLtvHint: string;
  threshold: string;
  thresholdHint: string;
  results: string;
  ltv: string;
  ltvHelp: string;
  healthFactor: string;
  healthFactorHelp: string;
  needsThreshold: string;
  collateralValue: string;
  available: string;
  availableHelp: string;
  overLimit: string;
  liquidationPrice: string;
  liquidationPriceHelp: string;
  drop: string;
  states: Record<"safe" | "close" | "liquidatable" | "no-debt", string>;
  note: string;
  local: string;
  empty: string;
  errors: Record<LtvError, string>;
}

const EMPTY: LtvInput = { collateral: "", price: "", debt: "", maxLtv: "", threshold: "" };
const fields: { key: Field; label: keyof LtvStrings; hint: keyof LtvStrings; unit?: string }[] = [
  { key: "collateral", label: "collateral", hint: "collateralHint" },
  { key: "price", label: "price", hint: "priceHint", unit: "USD" },
  { key: "debt", label: "debt", hint: "debtHint", unit: "USD" },
  { key: "maxLtv", label: "maxLtv", hint: "maxLtvHint", unit: "%" },
  { key: "threshold", label: "threshold", hint: "thresholdHint", unit: "%" },
];

export function LoanToValueCalculator({
  strings,
  common,
  locale,
}: {
  strings: LtvStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [input, setInput] = useState<LtvInput>(EMPTY);
  const ready = input.collateral.trim() && input.price.trim();
  const result = Object.values(input).some((v) => v.trim()) ? loanToValue(input) : null;
  const errors = result && !result.ok ? result.errors : {};
  const v = ready && result?.ok ? result.value : null;
  const usd = (d: Dec) => `$${toDisplay(d, { places: 2, significant: 4, locale })}`;
  const pct = (d: Dec) => `${toDisplay(d, { places: 2, significant: 3, locale })}%`;
  const tone =
    v?.state === "liquidatable"
      ? "critical"
      : v?.state === "close"
        ? "medium"
        : v?.state === "safe"
          ? "low"
          : undefined;

  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f) => (
          <NumberField
            key={f.key}
            id={`${id}-${f.key}`}
            label={strings[f.label] as string}
            hint={strings[f.hint] as string}
            unit={f.unit}
            value={input[f.key]}
            onChange={(value) => setInput((s) => ({ ...s, [f.key]: value }))}
            error={
              errors[f.key] && input[f.key].trim()
                ? strings.errors[errors[f.key]!]
                : errors[f.key] === "zero"
                  ? strings.errors.zero
                  : ""
            }
          />
        ))}
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
                label={strings.ltv}
                value={v.ltv ? pct(v.ltv) : null}
                help={strings.ltvHelp}
                copy={v.ltv ? toPlain(v.ltv) : null}
                common={common}
              />
              <Figure
                label={strings.healthFactor}
                value={v.healthFactor ? toDisplay(v.healthFactor, { places: 2, locale }) : null}
                help={v.healthFactor ? strings.healthFactorHelp : strings.needsThreshold}
                tone={tone}
                copy={v.healthFactor ? toPlain(v.healthFactor) : null}
                common={common}
              />
            </div>
            {v.state && (
              <p
                className={
                  v.state === "liquidatable"
                    ? "mt-3 rounded-xl bg-critical/14 px-3 py-2 text-sm text-critical"
                    : v.state === "close"
                      ? "mt-3 rounded-xl bg-medium/14 px-3 py-2 text-sm text-medium"
                      : "mt-3 rounded-xl bg-low/14 px-3 py-2 text-sm text-low"
                }
              >
                {strings.states[v.state]}
              </p>
            )}
            <dl className="mt-4">
              <ValueRow label={strings.collateralValue} value={usd(v.collateralValue)} common={common} />
              {v.available && (
                <ValueRow
                  label={strings.available}
                  value={usd(v.available)}
                  note={v.available.units < 0n ? strings.overLimit : strings.availableHelp}
                  common={common}
                />
              )}
              {v.liquidationPrice && (
                <ValueRow
                  label={strings.liquidationPrice}
                  value={usd(v.liquidationPrice)}
                  note={
                    v.dropToLiquidation && v.dropToLiquidation.units > 0n
                      ? fill(strings.drop, { percent: pct(v.dropToLiquidation) })
                      : strings.liquidationPriceHelp
                  }
                  common={common}
                />
              )}
            </dl>
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{strings.note}</p>
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() => setInput({ collateral: "10", price: "2000", debt: "8000", maxLtv: "75", threshold: "80" })}
          >
            {common.example}
          </LinkButton>
          <LinkButton onClick={() => setInput(EMPTY)}>{common.clear}</LinkButton>
        </div>
      </div>
    </Panel>
  );
}
