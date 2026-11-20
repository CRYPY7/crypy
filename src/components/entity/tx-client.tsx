"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const VIEW_KEY = "crypy.txview";

/** Runs before the views paint: restores Advanced view without flicker (both views are server-rendered). */
export const txViewInitScript = `try{if(localStorage.getItem("${VIEW_KEY}")==="advanced")document.documentElement.dataset.txview="advanced"}catch(e){}`;

function setView(advanced: boolean) {
  if (advanced) document.documentElement.dataset.txview = "advanced";
  else delete document.documentElement.dataset.txview;
  try {
    localStorage.setItem(VIEW_KEY, advanced ? "advanced" : "simple");
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event("crypy:txview"));
}

function useAdvanced() {
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const read = () => setAdvanced(document.documentElement.dataset.txview === "advanced");
    read();
    window.addEventListener("crypy:txview", read);
    return () => window.removeEventListener("crypy:txview", read);
  }, []);
  return advanced;
}

export function ViewToggle({ label, simple, advanced }: { label: string; simple: string; advanced: string }) {
  const isAdvanced = useAdvanced();
  const item = (active: boolean) =>
    cn(
      "rounded-md px-3.5 py-1.5 text-sm transition-colors",
      active
        ? "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]"
        : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      <button type="button" aria-pressed={!isAdvanced} className={item(!isAdvanced)} onClick={() => setView(false)}>
        {simple}
      </button>
      <button type="button" aria-pressed={isAdvanced} className={item(isAdvanced)} onClick={() => setView(true)}>
        {advanced}
      </button>
    </div>
  );
}

/** "Technical details" row in Simple view: switches to Advanced and scrolls to the top of it. */
export function ShowAdvanced({ title, hint }: { title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        setView(true);
        document.getElementById("tx-advanced")?.scrollIntoView({ block: "start" });
      }}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-5 py-3.5 text-start hover:border-primary"
    >
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
      <span aria-hidden="true" className="ms-auto text-muted-foreground rtl:-scale-x-100">
        →
      </span>
    </button>
  );
}

/** Time in the visitor's own time zone (rendered after load; the server shows UTC next to it). */
export function LocalTime({ timestamp, template }: { timestamp: number; template: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const time = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp * 1000));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(template.replace("{time}", time));
  }, [timestamp, template]);
  return text ? <span>{text}</span> : null;
}

export function CopyText({
  text,
  label,
  copiedLabel,
  className,
  iconOnly = false,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={iconOnly ? label : undefined}
      title={label}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: nothing to do.
        }
      }}
    >
      {copied ? (
        <Check className="size-4 text-low" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  );
}
