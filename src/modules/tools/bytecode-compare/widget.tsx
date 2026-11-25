"use client";

import { useId, useState } from "react";
import { type CommonStrings, FieldError, LinkButton, Notice, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type CodeError, type CodeInfo, type Verdict, codeInfo, compareCode, readCode } from "./bytecode";

export interface BytecodeStrings {
  first: string;
  second: string;
  placeholder: string;
  hint: string;
  verdicts: Record<Verdict, { title: string; body: string }>;
  immutables: string;
  firstDifference: string;
  sideTitle: string;
  size: string;
  sizeValue: string;
  overLimit: string;
  hash: string;
  hashHelp: string;
  hashWithoutMetadata: string;
  metadataTitle: string;
  compiler: string;
  ipfs: string;
  swarm: string;
  experimental: string;
  noMetadata: string;
  kinds: {
    empty: string;
    "minimal-proxy": string;
    delegation: string;
    creation: string;
  };
  implementation: string;
  target: string;
  oneSide: string;
  note: string;
  local: string;
  errors: Record<CodeError, string>;
}

// Example: the same small contract built twice; only the metadata (source hash) differs.
const PROGRAM = "6080604052348015600e575f80fd5b5060043610601f575f80fd5b5f80fd";
const meta = (fill: string) => `a264697066735822${`1220${fill.repeat(32)}`}64736f6c634300081a0033`;
const EXAMPLE_A = `0x${PROGRAM}${meta("3c")}`;
const EXAMPLE_B = `0x${PROGRAM}${meta("7d")}`;

function Side({
  title,
  info,
  strings,
  common,
  n,
}: {
  title: string;
  info: CodeInfo;
  strings: BytecodeStrings;
  common: CommonStrings;
  n: Intl.NumberFormat;
}) {
  const k = info.kind;
  return (
    <section className="min-w-0 rounded-xl border border-border p-4">
      <h3 className="mb-2 font-heading text-base font-semibold">{title}</h3>
      {k.kind !== "code" && <p className="mb-2 text-sm">{strings.kinds[k.kind]}</p>}
      <dl>
        {k.kind === "minimal-proxy" && (
          <ValueRow label={strings.implementation} value={k.implementation} common={common} />
        )}
        {k.kind === "delegation" && <ValueRow label={strings.target} value={k.target} common={common} />}
        <div className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0">
          <dt className="text-sm text-muted-foreground">{strings.size}</dt>
          <dd className="text-sm">
            {fill(strings.sizeValue, { bytes: n.format(info.bytes) })}
            {info.overLimit && <span className="block text-medium">{strings.overLimit}</span>}
          </dd>
        </div>
        <ValueRow label={strings.hash} value={info.hash} note={strings.hashHelp} common={common} />
        {info.metadata && (
          <ValueRow label={strings.hashWithoutMetadata} value={info.hashWithoutMetadata} common={common} />
        )}
      </dl>
      <h4 className="mt-3 text-sm font-semibold">{strings.metadataTitle}</h4>
      {info.metadata ? (
        <dl className="mt-1">
          {info.metadata.solc && (
            <ValueRow label={strings.compiler} value={`solc ${info.metadata.solc}`} common={common} />
          )}
          {info.metadata.ipfs && <ValueRow label={strings.ipfs} value={info.metadata.ipfs} common={common} />}
          {info.metadata.swarm && <ValueRow label={strings.swarm} value={info.metadata.swarm} common={common} />}
          {info.metadata.experimental && <p className="text-sm text-medium">{strings.experimental}</p>}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{strings.noMetadata}</p>
      )}
    </section>
  );
}

export function BytecodeCompare({
  strings,
  common,
  locale,
}: {
  strings: BytecodeStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ra = a.trim() ? readCode(a) : null;
  const rb = b.trim() ? readCode(b) : null;
  const n = new Intl.NumberFormat(locale);
  const both = ra?.ok && rb?.ok ? compareCode(ra.bytes, rb.bytes) : null;
  const single = !both ? (ra?.ok ? codeInfo(ra.bytes) : rb?.ok ? codeInfo(rb.bytes) : null) : null;
  const tone = both?.verdict === "identical" || both?.verdict === "same-code" ? "low" : "medium";

  const box = (
    key: "a" | "b",
    label: string,
    value: string,
    set: (v: string) => void,
    r: ReturnType<typeof readCode> | null,
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={`${id}-${key}`}
        rows={5}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={value}
        placeholder={strings.placeholder}
        aria-invalid={(r && !r.ok) || undefined}
        aria-describedby={`${id}-${key}-error ${id}-hint`}
        onChange={(e) => set(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <FieldError id={`${id}-${key}-error`}>{r && !r.ok ? strings.errors[r.error] : ""}</FieldError>
    </div>
  );

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        {box("a", strings.first, a, setA, ra)}
        {box("b", strings.second, b, setB, rb)}
      </div>
      <p id={`${id}-hint`} className="mt-2 text-xs text-muted-foreground">
        {strings.hint}
      </p>

      {both && (
        <div className="mt-5 grid gap-4 border-t border-border pt-5" aria-live="polite">
          <Notice tone={tone} title={strings.verdicts[both.verdict].title} testId="bytecode-verdict">
            <p>{strings.verdicts[both.verdict].body}</p>
            {both.verdict === "same-length" && both.allWordSized && (
              <p className="mt-1">{fill(strings.immutables, { regions: n.format(both.regions) })}</p>
            )}
            {both.firstDifference !== null && (
              <p className="mt-1">{fill(strings.firstDifference, { offset: n.format(both.firstDifference) })}</p>
            )}
          </Notice>
          <div className="grid gap-4 lg:grid-cols-2">
            <Side title={strings.first} info={both.a} strings={strings} common={common} n={n} />
            <Side title={strings.second} info={both.b} strings={strings} common={common} n={n} />
          </div>
        </div>
      )}
      {single && (
        <div className="mt-5 grid gap-3 border-t border-border pt-5" aria-live="polite">
          <p className="text-sm text-muted-foreground">{strings.oneSide}</p>
          <Side title={strings.sideTitle} info={single} strings={strings} common={common} n={n} />
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">{strings.note}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() => {
              setA(EXAMPLE_A);
              setB(EXAMPLE_B);
            }}
          >
            {common.example}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setA("");
              setB("");
            }}
          >
            {common.clear}
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}
