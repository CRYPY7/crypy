"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { type CommonStrings, FieldError, LinkButton, Notice, Panel, fill, inputClass } from "../shared/ui";
import { type ChangeKind, MAX_CHANGES, type ParseResult, diffJson, parseJson, report } from "./diff";

export interface JsonDiffStrings {
  before: string;
  after: string;
  placeholder: string;
  same: string;
  sameBody: string;
  summary: string;
  kinds: Record<ChangeKind, string>;
  path: string;
  change: string;
  truncated: string;
  copyReport: string;
  duplicates: string;
  duplicatesBody: string;
  note: string;
  local: string;
  errors: Record<"syntax" | "too-large" | "too-deep", string>;
}

const EXAMPLE_BEFORE = `{
  "name": "CRYPY Token",
  "decimals": 18,
  "totalSupply": "1000000000000000000000000",
  "owner": "0x1111aaaa2222bbbb3333cccc4444dddd5555eeee",
  "features": ["burn", "pause"],
  "fees": { "buy": 0, "sell": 0 }
}`;
const EXAMPLE_AFTER = `{
  "name": "CRYPY Token",
  "decimals": 18,
  "totalSupply": "1000000000000000000000000",
  "owner": "0x9999ffff8888eeee7777dddd6666cccc5555bbbb",
  "features": ["burn", "pause", "blacklist"],
  "fees": { "buy": 0, "sell": 25 }
}`;

const kindClass: Record<ChangeKind, string> = {
  added: "text-low",
  removed: "text-critical",
  changed: "text-medium",
  type: "text-medium",
};
const kindSign: Record<ChangeKind, string> = { added: "+", removed: "−", changed: "~", type: "~" };

export function JsonDiff({
  strings,
  common,
  locale,
}: {
  strings: JsonDiffStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const pa = a.trim() ? parseJson(a) : null;
  const pb = b.trim() ? parseJson(b) : null;
  const diff = pa?.ok && pb?.ok ? diffJson(pa.value, pb.value) : null;
  const n = new Intl.NumberFormat(locale);
  const total = diff ? diff.counts.added + diff.counts.removed + diff.counts.changed + diff.counts.type : 0;
  const duplicates = [...(pa?.ok ? pa.duplicates : []), ...(pb?.ok ? pb.duplicates : [])];
  const errorText = (r: ParseResult | null) =>
    r && !r.ok && r.error !== "empty"
      ? fill(strings.errors[r.error], { line: n.format(r.line), column: n.format(r.column) })
      : "";

  const box = (key: "a" | "b", label: string, value: string, set: (v: string) => void, r: ParseResult | null) => (
    <div className="min-w-0">
      <label htmlFor={`${id}-${key}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={`${id}-${key}`}
        rows={10}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={value}
        placeholder={strings.placeholder}
        aria-invalid={(r && !r.ok) || undefined}
        aria-describedby={`${id}-${key}-error`}
        onChange={(e) => set(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <FieldError id={`${id}-${key}-error`}>{errorText(r)}</FieldError>
    </div>
  );

  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {box("a", strings.before, a, setA, pa)}
        {box("b", strings.after, b, setB, pb)}
      </div>

      {diff && (
        <div className="mt-5 grid gap-4 border-t border-border pt-5" aria-live="polite">
          {duplicates.length > 0 && (
            <Notice tone="medium" title={strings.duplicates}>
              <p>{strings.duplicatesBody}</p>
              <p className="technical mt-1 break-all">{duplicates.slice(0, 20).join(", ")}</p>
            </Notice>
          )}
          {total === 0 ? (
            <Notice tone="info" title={strings.same} testId="json-diff-summary">
              {strings.sameBody}
            </Notice>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm" data-testid="json-diff-summary">
                  {fill(strings.summary, {
                    added: n.format(diff.counts.added),
                    removed: n.format(diff.counts.removed),
                    changed: n.format(diff.counts.changed + diff.counts.type),
                  })}
                </p>
                <CopyButton value={report(diff)} label={strings.copyReport} copiedLabel={common.copied} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th scope="col" className="py-2 pe-3 text-start font-medium">
                        <span className="sr-only">{strings.change}</span>
                      </th>
                      <th scope="col" className="py-2 pe-4 text-start font-medium">
                        {strings.path}
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        {strings.change}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.changes.map((c, i) => (
                      <tr key={i} className="border-t border-border align-top">
                        <td className={`py-2 pe-3 font-semibold ${kindClass[c.kind]}`}>
                          <span aria-hidden="true">{kindSign[c.kind]}</span>
                          <span className="sr-only">{strings.kinds[c.kind]}</span>
                        </td>
                        <td className="technical py-2 pe-4 break-all" dir="ltr">
                          {c.path}
                        </td>
                        <td className="technical py-2 break-all" dir="ltr">
                          {c.kind === "added" ? (
                            <span className="text-low">{c.after}</span>
                          ) : c.kind === "removed" ? (
                            <span className="text-critical line-through">{c.before}</span>
                          ) : (
                            <>
                              <span className="text-critical line-through">{c.before}</span>{" "}
                              <span aria-hidden="true">→</span> <span className="text-low">{c.after}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diff.truncated && (
                <p className="text-sm text-muted-foreground">
                  {fill(strings.truncated, { shown: n.format(MAX_CHANGES) })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">{strings.note}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() => {
              setA(EXAMPLE_BEFORE);
              setB(EXAMPLE_AFTER);
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
