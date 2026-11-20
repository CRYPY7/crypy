"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { type CommonStrings, LinkButton, Panel, fill, inputClass } from "../shared/ui";
import {
  type AddressCheck,
  type AddressStatus,
  type InvalidReason,
  MAX_ADDRESSES,
  checkAddress,
  splitAddresses,
} from "./address";

export interface AddressFormatterStrings {
  label: string;
  placeholder: string;
  summary: string;
  tooMany: string;
  copyAll: string;
  open: string;
  checksummed: string;
  status: Record<AddressStatus, string>;
  explain: Record<Exclude<AddressStatus, "invalid"> | "zero", string>;
  invalid: Record<InvalidReason, string>;
}

const tone: Record<AddressStatus, string> = {
  valid: "bg-low/14 text-low",
  "no-checksum": "bg-medium/14 text-medium",
  "missing-prefix": "bg-medium/14 text-medium",
  "bad-checksum": "bg-critical/14 text-critical",
  invalid: "bg-critical/14 text-critical",
};

/** Only these may be copied or opened: a mistyped address must never be "fixed" for the user. */
const usable = (check: AddressCheck) => check.status !== "invalid" && check.status !== "bad-checksum";

export function AddressFormatter({
  strings,
  common,
  addressPathPrefix,
}: {
  strings: AddressFormatterStrings;
  common: CommonStrings;
  /** e.g. "/en/address/" */
  addressPathPrefix: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const { checks, total } = useMemo(() => {
    const parts = splitAddresses(text);
    return { checks: parts.slice(0, MAX_ADDRESSES).map(checkAddress), total: parts.length };
  }, [text]);
  const good = checks.filter(
    (check) => check.status === "valid" || check.status === "no-checksum" || check.status === "missing-prefix",
  );
  const correct = checks.filter((check) => check.status === "valid").length;

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <textarea
        id={`${id}-input`}
        rows={checks.length > 1 ? 6 : 3}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={text}
        placeholder={strings.placeholder}
        onChange={(event) => setText(event.target.value)}
        className={`${inputClass} technical resize-y`}
      />

      {checks.length > 0 && (
        <div className="mt-5 border-t border-border pt-4" aria-live="polite">
          {checks.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {fill(strings.summary, { total: checks.length, ok: correct, problems: checks.length - correct })}
              </p>
              {good.length > 0 && (
                <CopyAll
                  value={good.map((check) => check.checksummed!).join("\n")}
                  label={strings.copyAll}
                  common={common}
                />
              )}
            </div>
          )}
          {total > MAX_ADDRESSES && (
            <p className="mb-4 text-sm text-high">{fill(strings.tooMany, { max: MAX_ADDRESSES })}</p>
          )}
          <ul className="flex flex-col gap-3">
            {checks.map((check, index) => (
              <li key={`${index}-${check.input}`} className="rounded-xl border border-border p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", tone[check.status])}>
                    {strings.status[check.status]}
                  </span>
                  <span className="technical min-w-0 text-sm break-all text-muted-foreground">{check.input}</span>
                </div>
                <p className="mt-2 text-sm">
                  {check.status === "invalid"
                    ? fill(strings.invalid[check.reason!], { length: check.length ?? 0 })
                    : strings.explain[check.status]}
                </p>
                {check.isZero && usable(check) && <p className="mt-1 text-sm text-critical">{strings.explain.zero}</p>}
                {usable(check) && check.checksummed && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="sr-only">{strings.checksummed}:</span>
                    <span className="technical min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 text-sm break-all">
                      {check.checksummed}
                    </span>
                    <CopyButton
                      value={check.checksummed}
                      label={`${common.copy}: ${check.checksummed}`}
                      copiedLabel={common.copied}
                    />
                    <Link
                      href={`${addressPathPrefix}${check.checksummed}`}
                      prefetch={false}
                      className={buttonVariants({ variant: "outline", size: "md" })}
                    >
                      {strings.open}
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() =>
            setText(
              "0xdAC17F958D2ee523a2206206994597C13D831ec7\n0x55d398326f99059ff775485246999027b3197955\n0xdAC17F958D2ee523a2206206994597C13D831eC7",
            )
          }
        >
          {common.example}
        </LinkButton>
        <LinkButton onClick={() => setText("")}>{common.clear}</LinkButton>
      </div>
    </Panel>
  );
}

function CopyAll({ value, label, common }: { value: string; label: string; common: CommonStrings }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked; each address can still be copied on its own.
        }
      }}
      className={buttonVariants({ variant: "outline", size: "md" })}
    >
      {copied ? common.copied : label}
    </button>
  );
}
