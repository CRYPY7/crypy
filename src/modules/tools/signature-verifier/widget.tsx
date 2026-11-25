"use client";

import { useEffect, useId, useState } from "react";
import {
  Choice,
  type CommonStrings,
  FieldError,
  LinkButton,
  Notice,
  Panel,
  ValueRow,
  fill,
  inputClass,
} from "../shared/ui";
import { type MessageMode, type VerifyError, type Verified, verifySignature } from "./verify";

export interface SignatureVerifierStrings {
  messageLabel: string;
  messagePlaceholder: string;
  messageHelp: string;
  readAs: string;
  text: string;
  hex: string;
  signatureLabel: string;
  signaturePlaceholder: string;
  expectedLabel: string;
  expectedPlaceholder: string;
  signer: string;
  signedHash: string;
  kindMessage: string;
  kindTyped: string;
  match: string;
  matchText: string;
  noMatch: string;
  noMatchText: string;
  recovered: string;
  recoveredText: string;
  errors: Record<VerifyError, string>;
  local: string;
}

/** Example: signed with Anvil's public test key (0xf39F…2266), which holds nothing. */
const EXAMPLE = {
  message: "I own this wallet. CRYPY example, 2026-11-25.",
  signature:
    "0xf1a2381fabbbfe4af9a09d6755d28f0e2ed5afe1c1cfdf5eedd6178d28e0cfb504c7653c36bd78f1cd9c93330f6b7f43d7da57585d85372aad14ea13d7dba6bd1c",
  signer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
};

export function SignatureVerifier({ strings, common }: { strings: SignatureVerifierStrings; common: CommonStrings }) {
  const id = useId();
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<MessageMode>("text");
  const [signature, setSignature] = useState("");
  const [expected, setExpected] = useState("");
  type Result = { ok: true; value: Verified } | { ok: false; error: VerifyError };
  // Each result remembers the input it belongs to; an older answer is never shown for newer input.
  const key = JSON.stringify([message, mode, signature, expected]);
  const [answer, setAnswer] = useState<{ key: string; result: Result } | null>(null);
  const empty = !message.trim() && !signature.trim();
  const result = !empty && answer?.key === key ? answer.result : null;

  useEffect(() => {
    if (empty) return;
    let current = true;
    void verifySignature({ message, mode, signature, expected }).then((r) => current && setAnswer({ key, result: r }));
    return () => {
      current = false;
    };
  }, [empty, key, message, mode, signature, expected]);

  const field = (
    key: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
    rows: number,
  ) => (
    <div className="mt-4 first:mt-0">
      <label htmlFor={`${id}-${key}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={`${id}-${key}`}
        rows={rows}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={value}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
    </div>
  );

  return (
    <Panel>
      {field("message", strings.messageLabel, message, setMessage, strings.messagePlaceholder, 4)}
      <p className="mt-1.5 text-xs text-muted-foreground">{strings.messageHelp}</p>
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
      {field("signature", strings.signatureLabel, signature, setSignature, strings.signaturePlaceholder, 2)}
      <div className="mt-4">
        <label htmlFor={`${id}-expected`} className="mb-1.5 block text-sm font-medium">
          {strings.expectedLabel}
        </label>
        <input
          id={`${id}-expected`}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          value={expected}
          placeholder={strings.expectedPlaceholder}
          onChange={(e) => setExpected(e.target.value)}
          className={`${inputClass} technical text-sm`}
        />
      </div>
      <FieldError id={`${id}-error`}>{result && !result.ok ? strings.errors[result.error] : ""}</FieldError>

      {result?.ok && (
        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4" aria-live="polite">
          {result.value.matches === true && (
            <Notice tone="low" title={strings.match} testId="signature-verdict">
              {strings.matchText}
            </Notice>
          )}
          {result.value.matches === false && (
            <Notice tone="critical" title={strings.noMatch} testId="signature-verdict">
              {strings.noMatchText}
            </Notice>
          )}
          {result.value.matches === null && (
            <Notice tone="info" title={strings.recovered} testId="signature-verdict">
              {strings.recoveredText}
            </Notice>
          )}
          <dl>
            <ValueRow
              label={strings.signer}
              value={result.value.signer}
              common={common}
              note={
                result.value.kind === "typed-data"
                  ? fill(strings.kindTyped, { type: result.value.primaryType ?? "" })
                  : strings.kindMessage
              }
            />
            <ValueRow label={strings.signedHash} value={result.value.hash} common={common} />
          </dl>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() => {
            setMode("text");
            setMessage(EXAMPLE.message);
            setSignature(EXAMPLE.signature);
            setExpected(EXAMPLE.signer);
          }}
        >
          {common.example}
        </LinkButton>
        <LinkButton
          onClick={() => {
            setMessage("");
            setSignature("");
            setExpected("");
          }}
        >
          {common.clear}
        </LinkButton>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}
