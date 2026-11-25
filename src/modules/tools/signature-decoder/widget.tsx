"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { type CommonStrings, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type DecodeError, type Decoded, type Party, type Severity, decodeSignatureRequest } from "./decode";
import { exampleMessage, examplePermit, examplePermit2 } from "./examples";

export interface SignatureStrings {
  label: string;
  placeholder: string;
  examples: string;
  examplePermit: string;
  examplePermit2: string;
  exampleMessage: string;
  never: string;
  results: string;
  findings: string;
  severity: Record<Severity, string>;
  finding: Record<string, string>;
  patterns: Record<string, string>;
  kindMessage: string;
  kindHash: string;
  type: string;
  chain: string;
  unknownChain: string;
  contract: string;
  spender: string;
  tokens: string;
  unlimited: string;
  rawAmount: string;
  until: string;
  noDeadline: string;
  gives: string;
  receives: string;
  itemTypes: Record<string, string>;
  message: string;
  allFields: string;
  hash: string;
  hashHelp: string;
  local: string;
  errors: Record<DecodeError, string>;
}

const tone: Record<Severity, string> = {
  critical: "border-critical/40 bg-critical/14 text-critical",
  high: "border-high/40 bg-high/14 text-high",
  medium: "border-medium/40 bg-medium/14 text-medium",
  info: "border-border bg-muted text-foreground",
};

export function SignatureDecoder({
  strings,
  common,
  locale,
}: {
  strings: SignatureStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const result = text.trim() ? decodeSignatureRequest(text) : null;
  const name = (p: Party | null) => (p ? (p.name ? `${p.name} (${p.address})` : p.address) : "—");
  const date = (seconds: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
      new Date(Math.min(seconds, 8.64e12 / 1000) * 1000),
    ) + " UTC";

  return (
    <Panel>
      <p className="mb-4 rounded-xl bg-critical/14 px-3 py-2 text-sm text-critical">{strings.never}</p>
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
      <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-critical empty:hidden">
        {result && !result.ok ? strings.errors[result.error] : ""}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{strings.examples}</span>
        {(
          [
            [strings.examplePermit, examplePermit],
            [strings.examplePermit2, examplePermit2],
            [strings.exampleMessage, exampleMessage],
          ] as const
        ).map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => setText(value)}
            className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <LinkButton onClick={() => setText("")}>{common.clear}</LinkButton>
      </div>

      {result?.ok && (
        <section aria-labelledby={`${id}-results`} aria-live="polite" className="mt-6 border-t border-border pt-5">
          <h2 id={`${id}-results`} className="font-heading text-lg font-semibold">
            {headline(result.value, strings)}
          </h2>
          <h3 className="mt-4 text-sm font-semibold">{strings.findings}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {result.value.findings.map((f, i) => (
              <li key={`${f.key}-${i}`} className={cn("rounded-xl border px-3 py-2 text-sm", tone[f.severity])}>
                <span className="font-semibold">{strings.severity[f.severity]}: </span>
                {fill(strings.finding[f.key] ?? f.key, f.values ?? {})}
              </li>
            ))}
          </ul>
          <Details value={result.value} strings={strings} common={common} name={name} date={date} />
        </section>
      )}
      <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}

function headline(value: Decoded, strings: SignatureStrings): string {
  if (value.kind === "message") return strings.kindMessage;
  if (value.kind === "hash") return strings.kindHash;
  return strings.patterns[value.pattern] ?? value.primaryType;
}

function Details({
  value,
  strings,
  common,
  name,
  date,
}: {
  value: Decoded;
  strings: SignatureStrings;
  common: CommonStrings;
  name: (p: Party | null) => string;
  date: (s: number) => string;
}) {
  if (value.kind === "message")
    return (
      <div className="mt-4">
        <h3 className="text-sm font-semibold">{strings.message}</h3>
        <pre className="mt-2 rounded-xl bg-muted p-3 text-sm break-words whitespace-pre-wrap">{value.text}</pre>
      </div>
    );
  if (value.kind === "hash")
    return (
      <dl className="mt-4">
        <ValueRow label={strings.hash} value={value.hash} common={common} />
      </dl>
    );
  return (
    <>
      <dl className="mt-4">
        <ValueRow label={strings.type} value={value.primaryType} common={common} />
        <ValueRow
          label={strings.chain}
          value={
            value.chain.name ?? (value.chain.id !== null ? fill(strings.unknownChain, { id: value.chain.id }) : "—")
          }
          technical={false}
          common={common}
        />
        <ValueRow label={strings.contract} value={name(value.verifyingContract)} common={common} />
        {value.spender && <ValueRow label={strings.spender} value={name(value.spender)} common={common} />}
        {value.allowances.map((a, i) => (
          <ValueRow
            key={`${a.token.address}-${i}`}
            label={strings.tokens}
            value={`${name(a.token)} · ${a.unlimited ? strings.unlimited : `${a.amount} ${strings.rawAmount}`}`}
            common={common}
          />
        ))}
        {(value.allowances.length > 0 || value.pattern === "seaport") && (
          <ValueRow
            label={strings.until}
            value={value.deadline !== null && value.deadline > 0 ? date(value.deadline) : strings.noDeadline}
            technical={false}
            common={common}
          />
        )}
        {value.offer.map((o, i) => (
          <ValueRow
            key={`o-${i}`}
            label={strings.gives}
            value={`${strings.itemTypes[o.itemType] ?? o.itemType} · ${name(o.token)} · ${o.amount}`}
            common={common}
          />
        ))}
        {value.consideration.map((c, i) => (
          <ValueRow
            key={`c-${i}`}
            label={fill(strings.receives, { recipient: name(c.recipient) })}
            value={`${strings.itemTypes[c.itemType] ?? c.itemType} · ${c.token.address === "0x0000000000000000000000000000000000000000" ? "ETH / native coin" : name(c.token)} · ${c.amount}`}
            common={common}
          />
        ))}
        {value.hash && <ValueRow label={strings.hash} value={value.hash} note={strings.hashHelp} common={common} />}
      </dl>
      <details className="mt-4 rounded-xl border border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{strings.allFields}</summary>
        <dl className="px-4 pb-4">
          {value.fields.map((f) => (
            <div key={f.path} className="flex flex-wrap gap-x-3 border-t border-border py-1.5 text-sm first:border-t-0">
              <dt className="technical text-muted-foreground">{f.path}</dt>
              <dd className="technical min-w-0 break-all">{f.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
