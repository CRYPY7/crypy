"use client";

import { useId, useState } from "react";
import { type Dec, toDisplay, toPlain } from "@/lib/math/decimal";
import { cn } from "@/lib/utils";
import { type CommonStrings, FieldError, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import {
  type CompoundError,
  type CompoundInput,
  type DurationUnit,
  type Field,
  type Frequency,
  PERIODS_PER_YEAR,
  compound,
  durationUnits,
  frequencies,
} from "./compound";

export interface ApyStrings {
  principal: string;
  rate: string;
  rateType: string;
  apr: string;
  apy: string;
  frequency: string;
  frequencies: Record<Frequency, string>;
  duration: string;
  units: Record<DurationUnit, string>;
  deposit: string;
  depositHint: string;
  periodNames: Record<Frequency, string>;
  results: string;
  final: string;
  deposited: string;
  interest: string;
  effectiveApy: string;
  nominalApr: string;
  formulaApr: string;
  formulaApy: string;
  partial: string;
  table: string;
  year: string;
  balance: string;
  totalIn: string;
  earned: string;
  warning: string;
  local: string;
  empty: string;
  errors: Record<CompoundError, string>;
}

const START: CompoundInput = {
  principal: "",
  rate: "",
  rateType: "apr",
  frequency: "monthly",
  duration: "",
  durationUnit: "years",
  deposit: "",
};
const selectClass =
  "rounded-xl border border-input bg-card px-3 py-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none";

export function ApyCalculator({
  strings,
  common,
  locale,
}: {
  strings: ApyStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [input, setInput] = useState<CompoundInput>(START);
  const ready = input.principal.trim() && input.rate.trim() && input.duration.trim();
  const result = ready || input.deposit.trim() ? compound(input) : null;
  const errors = result && !result.ok ? result.errors : {};
  const value = ready && result?.ok ? result.value : null;
  const set = (patch: Partial<CompoundInput>) => setInput((s) => ({ ...s, ...patch }));
  const money = (d: Dec) => toDisplay(d, { places: 2, significant: 4, locale });
  const err = (field: Field) => {
    const code = errors[field];
    return code && input[field].trim() ? strings.errors[code] : "";
  };

  const numberField = (field: Field, label: string, extra?: React.ReactNode, hint?: string) => {
    const inputId = `${id}-${field}`;
    return (
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            dir="ltr"
            value={input[field]}
            placeholder="0"
            aria-invalid={Boolean(err(field)) || undefined}
            aria-describedby={`${inputId}-error${hint ? ` ${inputId}-hint` : ""}`}
            onChange={(e) => set({ [field]: e.target.value } as Partial<CompoundInput>)}
            className={`${inputClass} technical min-w-0`}
          />
          {extra}
        </div>
        {hint && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        <FieldError id={`${inputId}-error`}>{err(field)}</FieldError>
      </div>
    );
  };

  const n = PERIODS_PER_YEAR[input.frequency];
  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-2">
        {numberField("principal", strings.principal)}
        <div>
          {numberField("rate", strings.rate)}
          <fieldset className="mt-2 flex items-center gap-2">
            <legend className="sr-only">{strings.rateType}</legend>
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              {strings.rateType}
            </span>
            {(["apr", "apy"] as const).map((type) => (
              <label
                key={type}
                className={cn(
                  "cursor-pointer rounded-full border border-border px-3 py-1 text-xs focus-within:ring-3 focus-within:ring-ring/25",
                  input.rateType === type && "border-primary text-primary",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-rate-type`}
                  value={type}
                  checked={input.rateType === type}
                  onChange={() => set({ rateType: type })}
                  className="sr-only"
                />
                {strings[type]}
              </label>
            ))}
          </fieldset>
        </div>
        <div>
          <label htmlFor={`${id}-frequency`} className="mb-1.5 block text-sm font-medium">
            {strings.frequency}
          </label>
          <select
            id={`${id}-frequency`}
            value={input.frequency}
            onChange={(e) => set({ frequency: e.target.value as Frequency })}
            className={`${selectClass} w-full`}
          >
            {frequencies.map((f) => (
              <option key={f} value={f}>
                {strings.frequencies[f]}
              </option>
            ))}
          </select>
        </div>
        {numberField(
          "duration",
          strings.duration,
          <select
            aria-label={strings.duration}
            value={input.durationUnit}
            onChange={(e) => set({ durationUnit: e.target.value as DurationUnit })}
            className={selectClass}
          >
            {durationUnits.map((u) => (
              <option key={u} value={u}>
                {strings.units[u]}
              </option>
            ))}
          </select>,
        )}
        {numberField(
          "deposit",
          strings.deposit,
          undefined,
          fill(strings.depositHint, { period: strings.periodNames[input.frequency] }),
        )}
      </div>

      <section aria-labelledby={`${id}-results`} aria-live="polite" className="mt-6 border-t border-border pt-5">
        <h2 id={`${id}-results`} className="font-heading text-lg font-semibold">
          {strings.results}
        </h2>
        {!value ? (
          <p className="mt-2 text-sm text-muted-foreground">{strings.empty}</p>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">{strings.final}</p>
              <p className="technical mt-1 text-3xl font-semibold break-all">{money(value.finalBalance)}</p>
            </div>
            <dl className="mt-4">
              <ValueRow label={strings.deposited} value={money(value.deposited)} common={common} />
              <ValueRow label={strings.interest} value={money(value.interest)} common={common} />
              <ValueRow label={strings.effectiveApy} value={`${toPlain(value.apy)}%`} common={common} />
              {input.rateType === "apy" && (
                <ValueRow label={strings.nominalApr} value={`${toPlain(value.apr)}%`} common={common} />
              )}
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">
              {fill(input.rateType === "apr" ? strings.formulaApr : strings.formulaApy, { n })}{" "}
              {value.partial.units !== 0n && fill(strings.partial, { fraction: toPlain(value.partial) })}
            </p>
            {value.years.length > 0 && (
              <details className="mt-4 rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{strings.table}</summary>
                <div className="overflow-x-auto px-4 pb-4" tabIndex={0} role="group" aria-label={strings.table}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th scope="col" className="py-2 text-start font-medium">
                          {strings.year}
                        </th>
                        <th scope="col" className="py-2 text-end font-medium">
                          {strings.totalIn}
                        </th>
                        <th scope="col" className="py-2 text-end font-medium">
                          {strings.earned}
                        </th>
                        <th scope="col" className="py-2 text-end font-medium">
                          {strings.balance}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="technical">
                      {value.years.map((row) => (
                        <tr key={row.year} className="border-t border-border">
                          <td className="py-1.5">{row.year}</td>
                          <td className="py-1.5 text-end">{money(row.deposited)}</td>
                          <td className="py-1.5 text-end">{money(row.interest)}</td>
                          <td className="py-1.5 text-end">{money(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
        <p className="mt-4 rounded-xl bg-medium/14 px-3 py-2 text-sm text-medium">{strings.warning}</p>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() =>
              setInput({ ...START, principal: "1000", rate: "8", duration: "5", deposit: "50", frequency: "monthly" })
            }
          >
            {common.example}
          </LinkButton>
          <LinkButton onClick={() => setInput(START)}>{common.clear}</LinkButton>
        </div>
      </div>
    </Panel>
  );
}
