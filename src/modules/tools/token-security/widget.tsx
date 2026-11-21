"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { FieldError, Panel, inputClass } from "../shared/ui";

export interface TokenSecurityStrings {
  label: string;
  placeholder: string;
  chain: string;
  anyChain: string;
  submit: string;
  invalid: string;
}

/**
 * Opens the token page for the chosen chain, or lets search find the chain. Works without JavaScript too
 * (GET to the search page, which finds the token).
 */
export function TokenSecurityForm({
  strings,
  chains,
  tokenPathPrefix,
  searchPath,
}: {
  strings: TokenSecurityStrings;
  chains: { key: string; name: string }[];
  tokenPathPrefix: string;
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
          const address = String(new FormData(event.currentTarget).get("q") ?? "").trim();
          if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
            setError(true);
            return;
          }
          const chain = String(new FormData(event.currentTarget).get("chain") ?? "");
          router.push(chain ? `${tokenPathPrefix}${chain}/${address}` : `${searchPath}?q=${address}`);
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
          <label className="sr-only" htmlFor={`${id}-chain`}>
            {strings.chain}
          </label>
          <select id={`${id}-chain`} name="chain" defaultValue="" className={cn(inputClass, "sm:w-48")}>
            <option value="">{strings.anyChain}</option>
            {chains.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className={cn(buttonVariants({ size: "xl" }), "shrink-0")}>
            {strings.submit}
          </button>
        </div>
        <FieldError id={`${id}-error`}>{error ? strings.invalid : ""}</FieldError>
      </form>
    </Panel>
  );
}
