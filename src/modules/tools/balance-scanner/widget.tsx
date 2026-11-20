"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { FieldError, Panel, inputClass } from "../shared/ui";

export interface BalanceScannerStrings {
  label: string;
  placeholder: string;
  submit: string;
  invalid: string;
}

/**
 * Opens the address page for a wallet address. Format only; the address page checks the checksum.
 * Works without JavaScript too (plain GET to the search page).
 */
export function BalanceScanner({
  strings,
  addressPathPrefix,
  searchPath,
}: {
  strings: BalanceScannerStrings;
  addressPathPrefix: string;
  searchPath: string;
}) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  return (
    <Panel>
      <form
        action={searchPath}
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const address = value.trim();
          if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
            setError(true);
            return;
          }
          router.push(`${addressPathPrefix}${address}`);
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
            value={value}
            placeholder={strings.placeholder}
            aria-invalid={error || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(false);
            }}
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
