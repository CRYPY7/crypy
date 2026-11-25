"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { getChainByEvmId } from "@/config/chains";
import { type CommonStrings, FieldError, LinkButton, Notice, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type RawDecoded, type RawTxError, type RlpNode, decodeRaw } from "./raw-tx";

export interface RawTxStrings {
  label: string;
  placeholder: string;
  help: string;
  transaction: string;
  types: Record<string, string>;
  chain: string;
  chainUnknown: string;
  chainNone: string;
  signedBy: string;
  unsigned: string;
  unsignedText: string;
  hash: string;
  hashNote: string;
  to: string;
  toNone: string;
  data: string;
  decodeData: string;
  fields: Record<string, string>;
  rlpTitle: string;
  rlpText: string;
  list: string;
  errors: Record<RawTxError, string>;
  notSent: string;
  local: string;
}

/** A 1 USDC transfer signed with Anvil's public test key (holds nothing; never broadcast). */
const EXAMPLE =
  "0x02f8b00103843b9aca008504a817c80082fde894a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4880b844a9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000f4240c080a09f66fde2b48aa7160e9aaaa2214e0813761985e4af438710d46c884cad584924a0733fbd26cfed72e3db431a132ddbf41a597c96a0b72c55fedb175eb7beddb698";

export function RawTxDecoder({
  strings,
  common,
  decoderPath,
}: {
  strings: RawTxStrings;
  common: CommonStrings;
  decoderPath: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  type Result = { ok: true; value: RawDecoded } | { ok: false; error: RawTxError };
  // Each result remembers the input it belongs to; an older answer is never shown for newer input.
  const [answer, setAnswer] = useState<{ text: string; result: Result } | null>(null);
  const result = text.trim() && answer?.text === text ? answer.result : null;

  useEffect(() => {
    if (!text.trim()) return;
    let current = true;
    void decodeRaw(text).then((r) => current && setAnswer({ text, result: r }));
    return () => {
      current = false;
    };
  }, [text]);

  const tx = result?.ok && result.value.kind === "transaction" ? result.value : null;
  const chain = tx?.chainId ? getChainByEvmId(tx.chainId) : undefined;

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <textarea
        id={`${id}-input`}
        rows={5}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={text}
        placeholder={strings.placeholder}
        aria-invalid={(result && !result.ok) || undefined}
        aria-describedby={`${id}-help ${id}-error`}
        onChange={(e) => setText(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <p id={`${id}-help`} className="mt-1.5 text-xs text-muted-foreground">
        {strings.help}
      </p>
      <FieldError id={`${id}-error`}>{result && !result.ok ? strings.errors[result.error] : ""}</FieldError>

      {tx && (
        <section
          aria-labelledby={`${id}-tx`}
          className="mt-5 flex flex-col gap-4 border-t border-border pt-4"
          aria-live="polite"
        >
          <h2 id={`${id}-tx`} className="font-heading text-lg font-semibold">
            {fill(strings.transaction, { type: strings.types[tx.type] ?? tx.type })}
          </h2>
          {!tx.signed && (
            <Notice tone="medium" title={strings.unsigned}>
              {strings.unsignedText}
            </Notice>
          )}
          <dl>
            <div className="flex flex-col gap-1 py-3 first:pt-0">
              <dt className="text-sm text-muted-foreground">{strings.chain}</dt>
              <dd>
                {tx.chainId === null
                  ? strings.chainNone
                  : chain
                    ? `${chain.name} (${tx.chainId})`
                    : fill(strings.chainUnknown, { id: tx.chainId })}
              </dd>
            </div>
            {tx.from && <ValueRow label={strings.signedBy} value={tx.from} common={common} />}
            {tx.hash && <ValueRow label={strings.hash} value={tx.hash} common={common} note={strings.hashNote} />}
            <ValueRow label={strings.to} value={tx.to ?? strings.toNone} technical={Boolean(tx.to)} common={common} />
            {tx.data && (
              <ValueRow
                label={strings.data}
                value={tx.data}
                common={common}
                note={
                  <Link
                    href={`${decoderPath}#data=${tx.data.length <= 16_000 ? tx.data : ""}`}
                    prefetch={false}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {strings.decodeData}
                  </Link>
                }
              />
            )}
            {tx.fields.map((f) => (
              <ValueRow
                key={f.key}
                label={strings.fields[f.key] ?? f.key}
                value={f.value}
                common={common}
                note={f.note}
              />
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">{strings.notSent}</p>
        </section>
      )}

      {result?.ok && result.value.kind === "rlp" && (
        <section aria-labelledby={`${id}-rlp`} className="mt-5 border-t border-border pt-4" aria-live="polite">
          <h2 id={`${id}-rlp`} className="font-heading text-lg font-semibold">
            {strings.rlpTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.rlpText}</p>
          <pre
            dir="ltr"
            className="technical mt-3 max-h-72 overflow-auto rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap break-words"
          >
            {tree(result.value.tree, strings.list)}
          </pre>
        </section>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton onClick={() => setText(EXAMPLE)}>{common.example}</LinkButton>
        <LinkButton onClick={() => setText("")}>{common.clear}</LinkButton>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}

function tree(node: RlpNode, list: string, depth = 0): string {
  const pad = "  ".repeat(depth);
  if ("bytes" in node) return `${pad}${node.bytes}`;
  return [`${pad}${fill(list, { count: node.list.length })}`, ...node.list.map((n) => tree(n, list, depth + 1))].join(
    "\n",
  );
}
