"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Choice, type CommonStrings, FieldError, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import {
  type AbiEntry,
  type AbiError,
  type ArgError,
  type DecodeError,
  type DecodedValue,
  decodeCall,
  decodeLog,
  encodeCall,
  readAbi,
} from "./abi";
import { exampleAbi } from "./example";

type Mode = "encode" | "decode-call" | "decode-log";
export interface AbiStrings {
  abiLabel: string;
  abiPlaceholder: string;
  abiHelp: string;
  contents: string;
  counts: string;
  kinds: Record<AbiEntry["kind"], string>;
  anonymous: string;
  mode: string;
  modes: Record<Mode, string>;
  noFunctions: string;
  function: string;
  argPlaceholder: string;
  argJson: string;
  callData: string;
  callDataPlaceholder: string;
  encodedHelp: string;
  topics: string;
  topicsPlaceholder: string;
  logData: string;
  decodedAs: string;
  abiErrors: Record<AbiError, string>;
  argErrors: Record<ArgError["reason"], string>;
  decodeErrors: Record<DecodeError, string>;
  local: string;
}

export function AbiEncoder({ strings, common }: { strings: AbiStrings; common: CommonStrings }) {
  const id = useId();
  const [abiText, setAbiText] = useState("");
  const [mode, setMode] = useState<Mode>("encode");
  const [fnName, setFnName] = useState("");
  const [args, setArgs] = useState<string[]>([]);
  const [callData, setCallData] = useState("");
  const [topics, setTopics] = useState("");
  const [logData, setLogData] = useState("");

  // The Transaction Data Decoder links here with #data=0x… when a selector isn't in its list. The data is in the
  // fragment, which browsers never send to the server.
  useEffect(() => {
    const data = new URLSearchParams(window.location.hash.slice(1)).get("data");
    if (data && /^0x[0-9a-fA-F]*$/.test(data) && data.length <= 200_000) {
      setCallData(data);
      setMode("decode-call");
    }
  }, []);

  const abi = useMemo(() => (abiText.trim() ? readAbi(abiText) : null), [abiText]);
  const functions = abi?.ok ? abi.entries.filter((e) => e.kind === "function") : [];
  const fn = functions.find((f) => f.signature === fnName) ?? functions[0];
  const counts = abi?.ok
    ? (["function", "event", "error"] as const).map((k) => abi.entries.filter((e) => e.kind === k).length)
    : [0, 0, 0];

  const encoded = abi?.ok && mode === "encode" && fn ? encodeCall(abi.abi, fn.signature, args) : null;
  const touched = args.some((a) => a.trim() !== "") || fn?.inputs.length === 0;
  const decodedCall = abi?.ok && mode === "decode-call" && callData.trim() ? decodeCall(abi.abi, callData) : null;
  const decodedLog = abi?.ok && mode === "decode-log" && topics.trim() ? decodeLog(abi.abi, topics, logData) : null;

  const textarea = (
    key: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
    rows: number,
    invalid?: boolean,
  ) => (
    <div className="mt-4">
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
        aria-invalid={invalid || undefined}
        onChange={(e) => set(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
    </div>
  );

  return (
    <Panel>
      <label htmlFor={`${id}-abi`} className="mb-1.5 block text-sm font-medium">
        {strings.abiLabel}
      </label>
      <textarea
        id={`${id}-abi`}
        rows={6}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={abiText}
        placeholder={strings.abiPlaceholder}
        aria-invalid={(abi && !abi.ok) || undefined}
        aria-describedby={`${id}-abi-help ${id}-abi-error`}
        onChange={(e) => setAbiText(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <p id={`${id}-abi-help`} className="mt-1.5 text-xs text-muted-foreground">
        {strings.abiHelp}
      </p>
      <FieldError id={`${id}-abi-error`}>
        {abi && !abi.ok ? strings.abiErrors[abi.error] + (abi.detail ? ` (${abi.detail})` : "") : ""}
      </FieldError>
      <div className="mt-3 flex justify-end gap-4">
        <LinkButton
          onClick={() => {
            setAbiText(exampleAbi);
            setArgs([]);
            setFnName("");
          }}
        >
          {common.example}
        </LinkButton>
        <LinkButton onClick={() => setAbiText("")}>{common.clear}</LinkButton>
      </div>

      {abi?.ok && (
        <>
          <details className="mt-4 rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {strings.contents} ·{" "}
              {fill(strings.counts, { functions: counts[0]!, events: counts[1]!, errors: counts[2]! })}
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {abi.entries.map((e, i) => (
                <li
                  key={`${e.signature}-${i}`}
                  className="border-t border-border pt-2 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="text-muted-foreground">{strings.kinds[e.kind]}</span>{" "}
                  <span dir="ltr" className="technical break-all">
                    {e.signature}
                  </span>
                  {e.id && (
                    <span dir="ltr" className="technical block break-all text-muted-foreground">
                      {e.id}
                    </span>
                  )}
                  {e.anonymous && <span className="block text-muted-foreground">{strings.anonymous}</span>}
                </li>
              ))}
            </ul>
          </details>

          <Choice
            name={`${id}-mode`}
            legend={strings.mode}
            value={mode}
            onChange={setMode}
            options={(["encode", "decode-call", "decode-log"] as const).map((m) => ({
              value: m,
              label: strings.modes[m],
            }))}
          />

          {mode === "encode" &&
            (fn ? (
              <div className="mt-2">
                <label htmlFor={`${id}-fn`} className="mb-1.5 block text-sm font-medium">
                  {strings.function}
                </label>
                <select
                  id={`${id}-fn`}
                  value={fn.signature}
                  onChange={(e) => {
                    setFnName(e.target.value);
                    setArgs([]);
                  }}
                  className={`${inputClass} technical text-sm`}
                >
                  {functions.map((f) => (
                    <option key={f.signature} value={f.signature}>
                      {f.signature}
                    </option>
                  ))}
                </select>
                {fn.inputs.map((p, i) => {
                  const bad = encoded && !encoded.ok && encoded.error.index === i && touched;
                  const complex = p.type.endsWith("]") || p.type.startsWith("tuple");
                  return (
                    <div key={`${fn.signature}-${i}`} className="mt-3">
                      <label htmlFor={`${id}-arg-${i}`} className="mb-1.5 block text-sm font-medium">
                        <span dir="ltr" className="technical">
                          {p.name || `#${i}`} ({p.type})
                        </span>
                      </label>
                      <input
                        id={`${id}-arg-${i}`}
                        autoComplete="off"
                        spellCheck={false}
                        dir="ltr"
                        value={args[i] ?? ""}
                        placeholder={complex ? strings.argJson : strings.argPlaceholder}
                        aria-invalid={bad || undefined}
                        aria-describedby={`${id}-arg-${i}-error`}
                        onChange={(e) => {
                          const next = [...args];
                          next[i] = e.target.value;
                          setArgs(next);
                        }}
                        className={`${inputClass} technical text-sm`}
                      />
                      <FieldError id={`${id}-arg-${i}-error`}>
                        {bad && encoded.error.reason !== "empty" ? strings.argErrors[encoded.error.reason] : ""}
                      </FieldError>
                    </div>
                  );
                })}
                {encoded && !encoded.ok && encoded.error.index === -1 && touched && (
                  <FieldError id={`${id}-encode-error`}>
                    {strings.argErrors.encode + (encoded.error.detail ? ` (${encoded.error.detail})` : "")}
                  </FieldError>
                )}
                {encoded?.ok && (
                  <dl className="mt-5 border-t border-border pt-4" aria-live="polite">
                    <ValueRow
                      label={strings.callData}
                      value={encoded.data}
                      common={common}
                      note={strings.encodedHelp}
                    />
                  </dl>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{strings.noFunctions}</p>
            ))}

          {mode === "decode-call" && (
            <>
              {textarea(
                "data",
                strings.callData,
                callData,
                setCallData,
                strings.callDataPlaceholder,
                4,
                decodedCall ? !decodedCall.ok : false,
              )}
              <Decoded result={decodedCall} strings={strings} common={common} id={`${id}-call`} />
            </>
          )}

          {mode === "decode-log" && (
            <>
              {textarea(
                "topics",
                strings.topics,
                topics,
                setTopics,
                strings.topicsPlaceholder,
                4,
                decodedLog ? !decodedLog.ok : false,
              )}
              {textarea("log", strings.logData, logData, setLogData, "0x", 3)}
              <Decoded result={decodedLog} strings={strings} common={common} id={`${id}-log`} />
            </>
          )}
        </>
      )}
      <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}

function Decoded({
  result,
  strings,
  common,
  id,
}: {
  result:
    { ok: true; signature: string; args: DecodedValue[] } | { ok: false; error: DecodeError; detail?: string } | null;
  strings: AbiStrings;
  common: CommonStrings;
  id: string;
}) {
  if (!result) return null;
  if (!result.ok)
    return (
      <FieldError id={`${id}-error`}>
        {strings.decodeErrors[result.error] + (result.error === "failed" && result.detail ? ` (${result.detail})` : "")}
      </FieldError>
    );
  return (
    <section aria-labelledby={`${id}-title`} aria-live="polite" className="mt-5 border-t border-border pt-4">
      <h2 id={`${id}-title`} className="mb-3 font-heading text-lg font-semibold">
        {strings.decodedAs}{" "}
        <span dir="ltr" className="technical break-all">
          {result.signature}
        </span>
      </h2>
      <dl>
        {result.args.map((a, i) => (
          <ValueRow key={`${a.name}-${i}`} label={`${a.name} (${a.type})`} value={a.value} common={common} />
        ))}
      </dl>
    </section>
  );
}
