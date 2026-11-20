"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";

export function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? copiedLabel : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the full value is visible on the page to copy by hand.
        }
      }}
      className={buttonVariants({ variant: "outline", size: "icon-md" })}
    >
      {copied ? <Check aria-hidden="true" className="text-low" /> : <Copy aria-hidden="true" />}
    </button>
  );
}
