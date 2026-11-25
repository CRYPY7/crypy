"use client";

import { useId, useState } from "react";
import { type CommonStrings, FieldError, LinkButton, Notice, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type Algorithm, MAX_FILE_BYTES, algorithms, hashBytes, readExpected } from "./checksum";

export interface FileHashStrings {
  fileLabel: string;
  fileHelp: string;
  expectedLabel: string;
  expectedPlaceholder: string;
  expectedHelp: string;
  reading: string;
  file: string;
  match: string;
  matchText: string;
  noMatch: string;
  noMatchText: string;
  noExpected: string;
  noExpectedText: string;
  errors: { format: string; tooLarge: string; read: string };
  local: string;
}

type State =
  | { kind: "idle" }
  | { kind: "reading"; name: string }
  | { kind: "done"; name: string; size: number; hashes: Record<Algorithm, string> }
  | { kind: "error"; error: "tooLarge" | "read" };

export function FileHash({
  strings,
  common,
  locale,
}: {
  strings: FileHashStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [expectedText, setExpectedText] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const expected = readExpected(expectedText);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setState({ kind: "error", error: "tooLarge" });
    setState({ kind: "reading", name: file.name });
    try {
      // Read and hashed here, in this browser tab: the file is never uploaded.
      const hashes = await hashBytes(await file.arrayBuffer());
      setState({ kind: "done", name: file.name, size: file.size, hashes });
    } catch {
      setState({ kind: "error", error: "read" });
    }
  };

  const verdict = state.kind === "done" && expected?.ok ? state.hashes[expected.algorithm] === expected.hex : null;
  const size = new Intl.NumberFormat(locale).format(state.kind === "done" ? state.size : 0);

  return (
    <Panel>
      <label htmlFor={`${id}-file`} className="mb-1.5 block text-sm font-medium">
        {strings.fileLabel}
      </label>
      <input
        key={inputKey}
        id={`${id}-file`}
        type="file"
        aria-describedby={`${id}-file-help ${id}-file-error`}
        onChange={(e) => void pick(e.target.files?.[0])}
        className={`${inputClass} text-sm`}
      />
      <p id={`${id}-file-help`} className="mt-1.5 text-xs text-muted-foreground">
        {strings.fileHelp}
      </p>
      <FieldError id={`${id}-file-error`}>{state.kind === "error" ? strings.errors[state.error] : ""}</FieldError>

      <div className="mt-4">
        <label htmlFor={`${id}-expected`} className="mb-1.5 block text-sm font-medium">
          {strings.expectedLabel}
        </label>
        <input
          id={`${id}-expected`}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          value={expectedText}
          placeholder={strings.expectedPlaceholder}
          aria-invalid={(expected && !expected.ok) || undefined}
          aria-describedby={`${id}-expected-help ${id}-expected-error`}
          onChange={(e) => setExpectedText(e.target.value)}
          className={`${inputClass} technical text-sm`}
        />
        <p id={`${id}-expected-help`} className="mt-1.5 text-xs text-muted-foreground">
          {strings.expectedHelp}
        </p>
        <FieldError id={`${id}-expected-error`}>{expected && !expected.ok ? strings.errors.format : ""}</FieldError>
      </div>

      {state.kind === "reading" && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {fill(strings.reading, { name: state.name })}
        </p>
      )}

      {state.kind === "done" && (
        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4" aria-live="polite">
          {verdict === true && expected?.ok && (
            <Notice tone="low" title={strings.match} testId="hash-verdict">
              {fill(strings.matchText, { algorithm: expected.algorithm })}
            </Notice>
          )}
          {verdict === false && expected?.ok && (
            <Notice tone="critical" title={strings.noMatch} testId="hash-verdict">
              {fill(strings.noMatchText, { algorithm: expected.algorithm })}
            </Notice>
          )}
          {verdict === null && (
            <Notice tone="info" title={strings.noExpected} testId="hash-verdict">
              {strings.noExpectedText}
            </Notice>
          )}
          <p className="text-sm text-muted-foreground">{fill(strings.file, { name: state.name, size })}</p>
          <dl>
            {algorithms.map((a) => (
              <ValueRow key={a} label={a} value={state.hashes[a]} common={common} />
            ))}
          </dl>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() => {
            setState({ kind: "idle" });
            setExpectedText("");
            setInputKey((k) => k + 1);
          }}
        >
          {common.clear}
        </LinkButton>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}
