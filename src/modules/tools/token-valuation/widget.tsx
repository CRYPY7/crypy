"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { type Dec, toDisplay, toPlain } from "@/lib/math/decimal";
import { type CommonStrings, FieldError, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type Field, type ValuationError, type ValuationInput, valuate } from "./valuation";

export interface TokenValuationStrings {
  total: string;
  totalHint: string;
  circulating: string;
  circulatingHint: string;
  max: string;
  maxHint: string;
  price: string;
  priceHint: string;
  results: string;
  marketCap: string;
  marketCapHelp: string;
  marketCapNeeds: string;
  fdv: string;
  fdvMax: string;
  fdvTotal: string;
  fdvNeeds: string;
  ratio: string;
  supply: string;
  circulatingOfTotal: string;
  circulatingOfMax: string;
  notCirculating: string;
  notCirculatingHelp: string;
  notYetIssued: string;
  notYetIssuedHelp: string;
  empty: string;
  local: string;
  errors: Record<ValuationError, string>;
}

const EMPTY: ValuationInput = { total: "", circulating: "", max: "", price: "" };
const fields: {
  key: Field;
  label: keyof TokenValuationStrings;
  hint: keyof TokenValuationStrings;
  mode: "numeric" | "decimal";
}[] = [
  { key: "total", label: "total", hint: "totalHint", mode: "decimal" },
  { key: "circulating", label: "circulating", hint: "circulatingHint", mode: "decimal" },
  { key: "max", label: "max", hint: "maxHint", mode: "decimal" },
  { key: "price", label: "price", hint: "priceHint", mode: "decimal" },
];

export function TokenValuationCalculator({
  strings,
  common,
  locale,
}: {
  strings: TokenValuationStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [input, setInput] = useState<ValuationInput>(EMPTY);
  const anything = Object.values(input).some((v) => v.trim());
  const result = anything ? valuate(input) : null;
  const errors = result && !result.ok ? result.errors : {};
  const v = result?.ok ? result.value : null;
  const usd = (value: Dec) => `$${toDisplay(value, { places: 2, significant: 4, locale })}`;
  const amount = (value: Dec) => toDisplay(value, { places: 0, significant: 6, locale });
  const pct = (value: Dec) => `${toDisplay(value, { places: 2, significant: 3, locale })}%`;
  const hasAny = v && (v.marketCap || v.fdv || v.circulatingOfTotal || v.circulatingOfMax || v.notYetIssued);

  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => {
          const inputId = `${id}-${field.key}`;
          const code = errors[field.key];
          const error = code && input[field.key].trim() ? strings.errors[code] : "";
          return (
            <div key={field.key}>
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
                {strings[field.label] as string}
              </label>
              <input
                id={inputId}
                inputMode={field.mode}
                autoComplete="off"
                dir="ltr"
                value={input[field.key]}
                placeholder="0"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={`${inputId}-hint ${inputId}-error`}
                onChange={(e) => setInput((s) => ({ ...s, [field.key]: e.target.value }))}
                className={`${inputClass} technical`}
              />
              <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted-foreground">
                {strings[field.hint] as string}
              </p>
              <FieldError id={`${inputId}-error`}>{error}</FieldError>
            </div>
          );
        })}
      </div>

      <section aria-labelledby={`${id}-results`} aria-live="polite" className="mt-6 border-t border-border pt-5">
        <h2 id={`${id}-results`} className="font-heading text-lg font-semibold">
          {strings.results}
        </h2>
        {!hasAny ? (
          <p className="mt-2 text-sm text-muted-foreground">{strings.empty}</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Figure
                label={strings.marketCap}
                value={v.marketCap ? usd(v.marketCap) : null}
                help={v.marketCap ? strings.marketCapHelp : strings.marketCapNeeds}
                copy={v.marketCap ? toPlain(v.marketCap) : null}
                common={common}
              />
              <Figure
                label={strings.fdv}
                value={v.fdv ? usd(v.fdv) : null}
                help={!v.fdv ? strings.fdvNeeds : v.fdvBasis === "max" ? strings.fdvMax : strings.fdvTotal}
                copy={v.fdv ? toPlain(v.fdv) : null}
                common={common}
              />
            </div>
            {v.fdvRatio && Number(toPlain(v.fdvRatio)) >= 1.5 && (
              <p className="mt-3 rounded-xl bg-medium/14 px-3 py-2 text-sm text-medium">
                {fill(strings.ratio, { ratio: toDisplay(v.fdvRatio, { places: 1, locale }) })}
              </p>
            )}
            {(v.circulatingOfTotal || v.circulatingOfMax || v.notCirculating || v.notYetIssued) && (
              <>
                <h3 className="mt-6 text-sm font-semibold">{strings.supply}</h3>
                <dl className="mt-2">
                  {v.circulatingOfTotal && (
                    <ValueRow label={strings.circulatingOfTotal} value={pct(v.circulatingOfTotal)} common={common} />
                  )}
                  {v.circulatingOfMax && (
                    <ValueRow label={strings.circulatingOfMax} value={pct(v.circulatingOfMax)} common={common} />
                  )}
                  {v.notCirculating && (
                    <ValueRow
                      label={strings.notCirculating}
                      value={amount(v.notCirculating)}
                      note={strings.notCirculatingHelp}
                      common={common}
                    />
                  )}
                  {v.notYetIssued && (
                    <ValueRow
                      label={strings.notYetIssued}
                      value={amount(v.notYetIssued)}
                      note={strings.notYetIssuedHelp}
                      common={common}
                    />
                  )}
                </dl>
              </>
            )}
          </>
        )}
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() =>
              setInput({ total: "1,000,000,000", circulating: "250,000,000", max: "2,000,000,000", price: "0.05" })
            }
          >
            {common.example}
          </LinkButton>
          <LinkButton onClick={() => setInput(EMPTY)}>{common.clear}</LinkButton>
        </div>
      </div>
    </Panel>
  );
}

function Figure({
  label,
  value,
  help,
  copy,
  common,
}: {
  label: string;
  value: string | null;
  help: string;
  copy: string | null;
  common: CommonStrings;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={value ? "technical text-2xl font-semibold break-all" : "text-lg text-muted-foreground"}>
          {value ?? "—"}
        </p>
        {copy && <CopyValue value={copy} label={`${common.copy}: ${label}`} common={common} />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

function CopyValue({ value, label, common }: { value: string; label: string; common: CommonStrings }) {
  return <CopyButton value={value} label={label} copiedLabel={common.copied} />;
}
