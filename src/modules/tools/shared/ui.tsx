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

export function Panel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div {...rest} className={cn("rounded-2xl border border-border bg-card p-4 sm:p-6", className)}>
      {children}
    </div>
  );
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

/** A labelled number box with an optional hint, unit and error (calculators). */
export function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  unit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  unit?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          value={value}
          placeholder="0"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-error${hint ? ` ${id}-hint` : ""}`}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} technical min-w-0`}
        />
        {unit && <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`}>{error ?? ""}</FieldError>
    </div>
  );
}

/** A big headline figure with its explanation (calculators). */
export function Figure({
  label,
  value,
  help,
  tone,
  copy,
  common,
}: {
  label: string;
  value: string | null;
  help?: string;
  tone?: "low" | "medium" | "critical";
  copy?: string | null;
  common: CommonStrings;
}) {
  const color =
    tone === "critical" ? "text-critical" : tone === "medium" ? "text-medium" : tone === "low" ? "text-low" : "";
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p
          className={value ? cn("technical text-2xl font-semibold break-all", color) : "text-lg text-muted-foreground"}
        >
          {value ?? "—"}
        </p>
        {copy && <CopyButton value={copy} label={`${common.copy}: ${label}`} copiedLabel={common.copied} />}
      </div>
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

/** A row of radio buttons (same look as the hex converter's "Read as"). */
export function Choice<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden="true" className="text-muted-foreground">
        {legend}
      </span>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-primary"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

const noticeTone = {
  low: "border-low/40 bg-low/14 text-low",
  medium: "border-medium/40 bg-medium/14 text-medium",
  critical: "border-critical/40 bg-critical/14 text-critical",
  info: "border-border bg-muted text-foreground",
} as const;

/** A coloured statement box (a verdict, a warning). Uses the same tones as the signature decoder's findings. */
export function Notice({
  tone,
  title,
  children,
  testId,
}: {
  tone: keyof typeof noticeTone;
  title: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2 text-sm", noticeTone[tone])} role="status" data-testid={testId}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-foreground">{children}</div>}
    </div>
  );
}
