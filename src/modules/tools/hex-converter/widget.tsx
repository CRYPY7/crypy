"use client";

import { useId, useState } from "react";
import { type CommonStrings, FieldError, LinkButton, Panel, ValueRow, inputClass } from "../shared/ui";
import { type HexError, type NumberInput, convertNumber, hexToText } from "./hex";

export interface HexConverterStrings {
  label: string;
  placeholder: string;
  readAs: string;
  decimal: string;
  hex: string;
  rows: Record<"decimal" | "hex" | "padded" | "bytes" | "signed" | "text", string>;
  bytes: { one: string; other: string };
  detected: Record<NumberInput, string>;
  errors: Record<HexError, string>;
}

export function HexConverter({
  strings,
  common,
  locale,
}: {
  strings: HexConverterStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [as, setAs] = useState<NumberInput>("decimal");

  const trimmed = text.trim();
  const digitsOnly = /^\d+$/.test(trimmed.replace(/[\s_]/g, ""));
  const converted = trimmed ? convertNumber(text, digitsOnly ? as : undefined) : null;
  const result = converted?.ok ? converted.result : null;
  const error = converted && !converted.ok ? strings.errors[converted.error] : "";
  const asText = result?.input === "hex" ? hexToText(trimmed) : null;
  const plural = new Intl.PluralRules(locale).select(result?.byteLength ?? 0) === "one" ? "one" : "other";

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <input
        id={`${id}-input`}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={text}
        placeholder={strings.placeholder}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => setText(event.target.value)}
        className={`${inputClass} technical`}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>

      {digitsOnly && (
        <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <legend className="sr-only">{strings.readAs}</legend>
          <span aria-hidden="true" className="text-muted-foreground">
            {strings.readAs}
          </span>
          {(["decimal", "hex"] as const).map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${id}-as`}
                checked={as === option}
                onChange={() => setAs(option)}
                className="size-4 accent-primary"
              />
              {strings[option]}
            </label>
          ))}
        </fieldset>
      )}

      {result && (
        <dl className="mt-5 border-t border-border pt-4">
          {!digitsOnly && <p className="mb-3 text-sm text-muted-foreground">{strings.detected[result.input]}</p>}
          <ValueRow label={strings.rows.decimal} value={result.decimal} common={common} />
          <ValueRow label={strings.rows.hex} value={result.hex} common={common} />
          <ValueRow label={strings.rows.padded} value={result.padded} common={common} />
          <div className="flex flex-col gap-1 border-t border-border py-3">
            <dt className="text-sm text-muted-foreground">{strings.rows.bytes}</dt>
            <dd>{strings.bytes[plural].replace("#", String(result.byteLength))}</dd>
          </div>
          {result.signed && <ValueRow label={strings.rows.signed} value={result.signed} common={common} />}
          {asText && <ValueRow label={strings.rows.text} value={asText} common={common} technical={false} />}
        </dl>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton onClick={() => setText("0x1b4")}>{common.example}</LinkButton>
        <LinkButton onClick={() => setText("")}>{common.clear}</LinkButton>
      </div>
    </Panel>
  );
}
