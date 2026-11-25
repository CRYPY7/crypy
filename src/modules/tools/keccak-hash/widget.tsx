"use client";

import { useId, useState } from "react";
import { Choice, type CommonStrings, FieldError, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type HashError, type HashMode, type SignatureInfo, hashes, signatureInfo } from "./hash";

export interface KeccakStrings {
  label: string;
  placeholder: string;
  readAs: string;
  text: string;
  hex: string;
  keccak: string;
  keccakHelp: string;
  sha: string;
  size: string;
  bytes: string;
  signature: string;
  kinds: Record<SignatureInfo["kind"], string>;
  canonical: string;
  selector: string;
  topic: string;
  signatureHelp: string;
  errors: Record<HashError, string>;
  local: string;
}

export function KeccakHash({ strings, common }: { strings: KeccakStrings; common: CommonStrings }) {
  const id = useId();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<HashMode>("text");
  const result = text === "" ? null : hashes(text, mode);
  // A function, event or error signature also gets its selector or topic.
  const sig = mode === "text" && /\(.*\)/s.test(text) ? signatureInfo(text) : null;

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
      <FieldError id={`${id}-error`}>{result && !result.ok ? strings.errors[result.error] : ""}</FieldError>
      <Choice
        name={`${id}-mode`}
        legend={strings.readAs}
        value={mode}
        onChange={setMode}
        options={[
          { value: "text", label: strings.text },
          { value: "hex", label: strings.hex },
        ]}
      />

      {sig?.ok && (
        <section aria-labelledby={`${id}-sig`} className="mt-5 border-t border-border pt-4">
          <h2 id={`${id}-sig`} className="mb-3 font-heading text-lg font-semibold">
            {fill(strings.signature, { kind: strings.kinds[sig.value.kind] })}
          </h2>
          <dl>
            <ValueRow label={strings.canonical} value={sig.value.canonical} common={common} />
            {sig.value.selector && <ValueRow label={strings.selector} value={sig.value.selector} common={common} />}
            {sig.value.topic && <ValueRow label={strings.topic} value={sig.value.topic} common={common} />}
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">{strings.signatureHelp}</p>
        </section>
      )}

      {result?.ok && (
        <dl className="mt-5 border-t border-border pt-4" aria-live="polite">
          <ValueRow
            label={strings.keccak}
            value={result.keccak}
            common={common}
            note={sig?.ok ? fill(strings.keccakHelp, { text: sig.value.canonical }) : undefined}
          />
          <ValueRow label={strings.sha} value={result.sha} common={common} />
          <div className="flex flex-col gap-1 border-t border-border py-3">
            <dt className="text-sm text-muted-foreground">{strings.size}</dt>
            <dd>{fill(strings.bytes, { count: result.bytes })}</dd>
          </div>
        </dl>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() => {
            setMode("text");
            setText("transfer(address,uint256)");
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
