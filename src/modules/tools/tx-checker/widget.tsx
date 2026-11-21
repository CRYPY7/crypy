"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { FieldError, Panel, inputClass } from "../shared/ui";

export interface TxCheckerStrings {
  label: string;
  placeholder: string;
  submit: string;
  invalid: string;
}

/** Opens the transaction page (which finds the network). Works without JavaScript too (GET to the search page). */
export function TxChecker({
  strings,
  txPathPrefix,
  searchPath,
}: {
  strings: TxCheckerStrings;
  txPathPrefix: string;
  searchPath: string;
}) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState(false);
  return (
    <Panel>
      <form
        action={searchPath}
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const hash = String(new FormData(event.currentTarget).get("q") ?? "").trim();
          if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
            setError(true);
            return;
          }
          router.push(`${txPathPrefix}${hash}`);
        }}
      >
        <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
          {strings.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`${id}-input`}
            name="q"
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            placeholder={strings.placeholder}
            aria-invalid={error || undefined}
            aria-describedby={`${id}-error`}
            // Uncontrolled: text typed before the page finished loading is kept, and read on submit.
            onChange={() => setError(false)}
            className={`${inputClass} technical`}
          />
          <button type="submit" className={cn(buttonVariants({ size: "xl" }), "shrink-0")}>
            {strings.submit}
          </button>
        </div>
        <FieldError id={`${id}-error`}>{error ? strings.invalid : ""}</FieldError>
      </form>
    </Panel>
  );
}
