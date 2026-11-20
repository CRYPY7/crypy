"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { type CommonStrings, FieldError, LinkButton, Panel, inputClass } from "../shared/ui";
import { type ParseError, type UnitId, convertAll, parseAmount, units } from "./units";

export interface UnitConverterStrings {
  units: Record<UnitId, string>;
  hint: string;
  errors: Record<ParseError, string>;
}

type State = { source: UnitId; text: string };

export function UnitConverter({ strings, common }: { strings: UnitConverterStrings; common: CommonStrings }) {
  const id = useId();
  const [state, setState] = useState<State>({ source: "ether", text: "" });

  const sourceDecimals = units.find((unit) => unit.id === state.source)!.decimals;
  const parsed = state.text.trim() ? parseAmount(state.text, sourceDecimals) : null;
  const values = parsed?.ok ? convertAll(parsed.wei) : null;

  return (
    <Panel>
      <div className="flex flex-col gap-5">
        {units.map((unit) => {
          const isSource = state.source === unit.id;
          const shown = isSource ? state.text : (values?.[unit.id] ?? "");
          const error = isSource && parsed && !parsed.ok ? strings.errors[parsed.error] : "";
          const inputId = `${id}-${unit.id}`;
          return (
            <div key={unit.id}>
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
                {strings.units[unit.id]}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  value={shown}
                  placeholder="0"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? `${inputId}-error` : undefined}
                  onChange={(event) => setState({ source: unit.id, text: event.target.value })}
                  className={`${inputClass} technical`}
                />
                <CopyButton
                  value={shown}
                  label={`${common.copy}: ${strings.units[unit.id]}`}
                  copiedLabel={common.copied}
                />
              </div>
              <FieldError id={`${inputId}-error`}>{error}</FieldError>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{strings.hint}</p>
          <div className="flex gap-4">
            <LinkButton onClick={() => setState({ source: "gwei", text: "21000" })}>{common.example}</LinkButton>
            <LinkButton onClick={() => setState({ source: "ether", text: "" })}>{common.clear}</LinkButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}
