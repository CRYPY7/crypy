"use client";

import type { ReactNode } from "react";
import { CopyButton } from "@/components/entity/copy-button";
import { cn } from "@/lib/utils";

export interface CommonStrings {
  copy: string;
  copied: string;
  example: string;
  clear: string;
}

/** Replaces {name} placeholders. Client widgets get plain templates (no i18n runtime in the browser). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export const inputClass =
  "w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 aria-invalid:border-critical";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-border bg-card p-4 sm:p-6", className)}>{children}</div>;
}

/** A labelled result with a copy button. Technical values are always LTR and never translated. */
export function ValueRow({
  label,
  value,
  common,
  technical = true,
  note,
}: {
  label: string;
  value: string;
  common: CommonStrings;
  technical?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-start gap-2">
        <span className={cn("min-w-0 flex-1 py-2 break-all", technical && "technical text-sm")}>{value}</span>
        <CopyButton value={value} label={`${common.copy}: ${label}`} copiedLabel={common.copied} />
      </dd>
      {note && <dd className="text-sm text-muted-foreground">{note}</dd>}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-critical empty:hidden">
      {children}
    </p>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
    >
      {children}
    </button>
  );
}
