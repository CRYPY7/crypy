"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { useWallet } from "@/wallets/wallet-root";
import { FieldError, Panel, inputClass } from "../shared/ui";

export interface ApprovalCheckerStrings {
  label: string;
  placeholder: string;
  submit: string;
  useConnected: string;
  invalid: string;
  noConnection: string;
}

/**
 * Opens the approvals page of any address. Checking never needs a wallet connection; the connected wallet is only a
 * shortcut. Works without JavaScript too (GET to search).
 */
export function ApprovalCheckerForm({
  strings,
  addressPathPrefix,
  searchPath,
}: {
  strings: ApprovalCheckerStrings;
  addressPathPrefix: string;
  searchPath: string;
}) {
  const id = useId();
  const router = useRouter();
  const { state } = useWallet();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const open = (address: string) => router.push(`${addressPathPrefix}${address}/approvals`);
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
          open(address);
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
            aria-describedby={`${id}-error`}
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
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {state.status === "connected" && state.address ? (
            <button
              type="button"
              onClick={() => open(state.address!)}
              className={buttonVariants({ variant: "outline" })}
            >
              {strings.useConnected}
            </button>
          ) : (
            <span className="text-muted-foreground">{strings.noConnection}</span>
          )}
        </div>
      </form>
    </Panel>
  );
}
