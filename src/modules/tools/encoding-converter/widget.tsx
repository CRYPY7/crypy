"use client";

import { useId, useState } from "react";
import { Choice, type CommonStrings, FieldError, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type EncodingError, type Format, convert, formats } from "./encoding";

export interface EncodingStrings {
  label: string;
  placeholder: string;
  readAs: string;
  formats: Record<Format, string>;
  size: string;
  bytes: string;
  notText: string;
  base58Note: string;
  errors: Record<EncodingError, string>;
  local: string;
}

export function EncodingConverter({ strings, common }: { strings: EncodingStrings; common: CommonStrings }) {
  const id = useId();
  const [text, setText] = useState("");
  const [from, setFrom] = useState<Format>("text");
  const result = text === "" ? null : convert(text, from);

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <textarea
        id={`${id}-input`}
        rows={3}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={text}
        placeholder={strings.placeholder}
        aria-invalid={(result && !result.ok) || undefined}
        aria-describedby={`${id}-error`}
        onChange={(e) => setText(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <FieldError id={`${id}-error`}>
        {result && !result.ok ? fill(strings.errors[result.error], { format: strings.formats[from] }) : ""}
      </FieldError>
      <Choice
        name={`${id}-from`}
        legend={strings.readAs}
        value={from}
        onChange={setFrom}
        options={formats.map((f) => ({ value: f, label: strings.formats[f] }))}
      />

      {result?.ok && (
        <dl className="mt-5 border-t border-border pt-4" aria-live="polite">
          {formats
            .filter((f) => f !== from)
            .map((f) => {
              const value = result.value.values[f];
              return value === null ? (
                <div key={f} className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0">
                  <dt className="text-sm text-muted-foreground">{strings.formats[f]}</dt>
                  <dd className="text-sm text-muted-foreground">{strings.notText}</dd>
                </div>
              ) : (
                <ValueRow
                  key={f}
                  label={strings.formats[f]}
                  value={value}
                  technical={f !== "text"}
                  common={common}
                  note={f === "base58" ? strings.base58Note : undefined}
                />
              );
            })}
          <div className="flex flex-col gap-1 border-t border-border py-3">
            <dt className="text-sm text-muted-foreground">{strings.size}</dt>
            <dd>{fill(strings.bytes, { count: result.value.bytes })}</dd>
          </div>
        </dl>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() => {
            setFrom("text");
            setText("Hello, CRYPY");
          }}
        >
          {common.example}
        </LinkButton>
        <LinkButton onClick={() => setText("")}>{common.clear}</LinkButton>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}
