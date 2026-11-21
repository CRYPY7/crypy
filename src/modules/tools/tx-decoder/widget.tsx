"use client";

import Link from "next/link";
import { useDeferredValue, useId, useState } from "react";
import { CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { type CommonStrings, LinkButton, Panel, fill, inputClass } from "../shared/ui";
import {
  type DecodeResult,
  type DecodedValue,
  type FunctionKey,
  type WarningCode,
  decodeCallData,
  normaliseHex,
} from "./decode";

export interface TxDecoderStrings {
  label: string;
  placeholder: string;
  function: string;
  standard: string;
  selector: string;
  signature: string;
  parameters: string;
  name: string;
  type: string;
  value: string;
  unlimited: string;
  yes: string;
  no: string;
  nested: string;
  rawNote: string;
  known: string;
  native: string;
  unknownTitle: string;
  unknownText: string;
  mismatch: string;
  moreWords: string;
  extraBytes: string;
  errors: Record<"format" | "odd-length" | "too-short" | "too-long" | "tx-hash", string>;
  searchHash: string;
  functions: Record<FunctionKey, string>;
  warnings: Record<WarningCode, string>;
  heuristic: string;
}

interface Context {
  strings: TxDecoderStrings;
  locale: string;
  addressPathPrefix: string;
}

const EXAMPLE =
  "0x095ea7b300000000000000000000000010ed43c718714eb63d5aa57b78b54704e256024effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

export function TxDecoder({
  strings,
  common,
  locale,
  addressPathPrefix,
  searchPath,
  knownCount,
}: {
  strings: TxDecoderStrings;
  common: CommonStrings;
  locale: string;
  addressPathPrefix: string;
  searchPath: string;
  knownCount: number;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const deferred = useDeferredValue(text);
  const result = deferred.trim() ? decodeCallData(deferred) : null;
  const context: Context = { strings, locale, addressPathPrefix };

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <textarea
        id={`${id}-input`}
        rows={4}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={text}
        placeholder={strings.placeholder}
        aria-invalid={result?.status === "invalid" || undefined}
        onChange={(event) => setText(event.target.value)}
        className={`${inputClass} technical resize-y`}
      />
      <p className="mt-2 text-sm text-muted-foreground">{fill(strings.known, { count: knownCount })}</p>

      {result && (
        <div className="mt-5 border-t border-border pt-5" aria-live="polite">
          {result.status === "invalid" ? (
            <div role="alert" className="text-sm text-critical">
              <p>{strings.errors[result.error]}</p>
              {result.error === "tx-hash" && (
                <Link
                  href={`${searchPath}?q=${encodeURIComponent(normaliseHex(deferred))}`}
                  prefetch={false}
                  className="mt-2 inline-block font-medium text-primary underline-offset-4 hover:underline"
                >
                  {strings.searchHash}
                </Link>
              )}
            </div>
          ) : (
            <Result result={result} context={context} />
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton onClick={() => setText(EXAMPLE)}>{common.example}</LinkButton>
        <LinkButton onClick={() => setText("")}>{common.clear}</LinkButton>
      </div>
    </Panel>
  );
}

function Result({ result, context }: { result: Exclude<DecodeResult, { status: "invalid" }>; context: Context }) {
  const { strings } = context;
  if (result.status === "native-transfer") return <p className="text-sm">{strings.native}</p>;
  if (result.status === "mismatch") {
    return (
      <p className="text-sm text-high">
        {strings.mismatch}
        <span className="technical ms-1 break-all">{result.signature}</span>
      </p>
    );
  }
  if (result.status === "unknown") {
    const hidden = result.totalWords - result.words.length;
    return (
      <div>
        <h3 className="font-semibold">{strings.unknownTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{strings.unknownText}</p>
        <Facts rows={[[strings.selector, result.selector]]} />
        <ol className="mt-3 flex flex-col gap-1">
          {result.words.map((word, index) => (
            <li key={index} className="technical flex gap-3 text-xs break-all sm:text-sm">
              <span className="w-6 shrink-0 text-end text-muted-foreground">{index}</span>
              <span className="min-w-0">{word}</span>
            </li>
          ))}
        </ol>
        {hidden > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{fill(strings.moreWords, { count: hidden })}</p>
        )}
        {result.extraBytes > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{fill(strings.extraBytes, { count: result.extraBytes })}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">{strings.function}</p>
        <h3 className="mt-0.5 text-lg font-semibold">{strings.functions[result.key]}</h3>
      </div>
      {result.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.warnings.map((code) => (
            <Warning key={code} code={code} text={strings.warnings[code]} />
          ))}
          <p className="text-xs text-muted-foreground">{strings.heuristic}</p>
        </div>
      )}
      <Facts
        rows={[
          [strings.signature, result.signature],
          [strings.standard, result.standard],
          [strings.selector, result.selector],
        ]}
      />
      {result.params.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">{strings.parameters}</h4>
          <dl className="mt-2 divide-y divide-border rounded-xl border border-border">
            {result.params.map((param) => (
              <div key={param.name} className="grid gap-1 p-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
                <dt className="technical text-sm">
                  {param.name}
                  <span className="ms-2 text-xs text-muted-foreground">{param.type}</span>
                </dt>
                <dd className="min-w-0">
                  <Value value={param.value} context={context} />
                </dd>
              </div>
            ))}
          </dl>
          {result.params.some((param) => param.type.startsWith("uint") && param.name !== "deadline") && (
            <p className="mt-2 text-xs text-muted-foreground">{strings.rawNote}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="technical min-w-0 break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Value({ value, context }: { value: DecodedValue; context: Context }) {
  const { strings } = context;
  switch (value.kind) {
    case "address":
      return (
        <Link
          href={`${context.addressPathPrefix}${value.value}`}
          prefetch={false}
          className="technical text-sm break-all text-primary underline-offset-4 hover:underline"
        >
          {value.value}
        </Link>
      );
    case "number":
      return (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="technical break-all">{value.value}</span>
          {value.unlimited && (
            <span className="rounded-md bg-high/14 px-2 py-0.5 text-xs font-semibold text-high">
              {strings.unlimited}
            </span>
          )}
          {value.time && (
            <span className="text-muted-foreground">
              {new Intl.DateTimeFormat(context.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(new Date(value.time))}{" "}
              UTC
            </span>
          )}
        </span>
      );
    case "bool":
      return <span className="text-sm">{value.value ? strings.yes : strings.no}</span>;
    case "bytes":
      return <span className="technical text-xs break-all">{value.value}</span>;
    case "list":
      return (
        <ol className="flex flex-col gap-2">
          {value.items.map((item, index) => (
            <li key={index} className={cn(item.kind === "call" && "rounded-xl border border-border p-3")}>
              {item.kind === "call" && (
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  {fill(strings.nested, { index: index + 1 })}
                </p>
              )}
              <Value value={item} context={context} />
            </li>
          ))}
        </ol>
      );
    case "call":
      return value.result.status === "decoded" || value.result.status === "unknown" ? (
        <Result result={value.result} context={context} />
      ) : null;
  }
}

function Warning({ code, text }: { code: WarningCode; text: string }) {
  const style =
    code === "revoke"
      ? { box: "border-low/40 bg-low/8", icon: ShieldCheck, color: "text-low" }
      : code === "approval" || code === "ownership-renounce"
        ? { box: "border-medium/40 bg-medium/8", icon: CircleAlert, color: "text-medium" }
        : { box: "border-high/50 bg-high/8", icon: TriangleAlert, color: "text-high" };
  const Icon = style.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3 text-sm", style.box)}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", style.color)} />
      <p>{text}</p>
    </div>
  );
}
