"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { Choice, type CommonStrings, FieldError, LinkButton, Panel, fill, inputClass } from "../shared/ui";
import { type JsonCsvError, csvToJson, formatJson, jsonToCsv } from "./json-csv";

type Action = "format" | "minify" | "to-csv" | "to-json";
export interface JsonCsvStrings {
  label: string;
  placeholder: string;
  action: string;
  actions: Record<Action, string>;
  result: string;
  rows: string;
  download: string;
  errorAt: string;
  errors: Record<JsonCsvError, string>;
  formulaNote: string;
  local: string;
}

const example =
  '[{"chain":"Ethereum","symbol":"ETH","decimals":18},{"chain":"BNB Smart Chain","symbol":"BNB","decimals":18}]';

export function JsonCsv({ strings, common }: { strings: JsonCsvStrings; common: CommonStrings }) {
  const id = useId();
  const [text, setText] = useState("");
  const [action, setAction] = useState<Action>("format");
  const result:
    | { ok: true; value: string; rows?: number }
    | { ok: false; error: JsonCsvError; line?: number; column?: number }
    | null = !text.trim()
    ? null
    : action === "format"
      ? formatJson(text, 2)
      : action === "minify"
        ? formatJson(text, 0)
        : action === "to-csv"
          ? jsonToCsv(text)
          : csvToJson(text);
  const error =
    result && !result.ok
      ? strings.errors[result.error] +
        (result.line ? ` ${fill(strings.errorAt, { line: result.line, column: result.column ?? 1 })}` : "")
      : "";
  const csvOut = action === "to-csv";

  const download = (value: string) => {
    const url = URL.createObjectURL(new Blob([value], { type: csvOut ? "text/csv" : "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csvOut ? "crypy.csv" : "crypy.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <textarea
        id={`${id}-input`}
        rows={8}
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
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <Choice
        name={`${id}-action`}
        legend={strings.action}
        value={action}
        onChange={setAction}
        options={(["format", "minify", "to-csv", "to-json"] as const).map((a) => ({
          value: a,
          label: strings.actions[a],
        }))}
      />

      {result?.ok && (
        <section aria-labelledby={`${id}-result`} className="mt-5 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <h2 id={`${id}-result`} className="min-w-0 flex-1 font-heading text-lg font-semibold">
              {strings.result}
              {result.rows !== undefined && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  · {fill(strings.rows, { count: result.rows })}
                </span>
              )}
            </h2>
            <LinkButton onClick={() => download(result.value)}>{strings.download}</LinkButton>
            <CopyButton value={result.value} label={`${common.copy}: ${strings.result}`} copiedLabel={common.copied} />
          </div>
          <pre
            dir="ltr"
            className="technical mt-2 max-h-72 overflow-auto rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap break-words"
          >
            {result.value}
          </pre>
          {csvOut && <p className="mt-2 text-sm text-muted-foreground">{strings.formulaNote}</p>}
        </section>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() => {
            setAction("to-csv");
            setText(example);
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
