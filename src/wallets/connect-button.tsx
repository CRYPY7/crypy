"use client";

import { Loader2, Wallet } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { shortenId } from "@/lib/format/amount";
import { cn } from "@/lib/utils";
import { useWallet } from "./wallet-root";

export function ConnectButton({ label, connectingLabel }: { label: string; connectingLabel: string }) {
  const { state, openWallet } = useWallet();
  const busy = state.status === "connecting" || state.status === "reconnecting";

  if (state.status === "connected" && state.address) {
    return (
      <button
        type="button"
        onClick={openWallet}
        aria-haspopup="dialog"
        className={cn(buttonVariants({ variant: "outline", size: "md" }), "technical")}
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-low" />
        {shortenId(state.address)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openWallet}
      aria-haspopup="dialog"
      aria-label={busy ? connectingLabel : label}
      disabled={busy}
      className={cn(buttonVariants({ size: "md" }), "font-semibold")}
    >
      {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Wallet aria-hidden="true" />}
      <span className="hidden lg:inline">{busy ? connectingLabel : label}</span>
    </button>
  );
}

/** Shown under the search box when a wallet is connected: one tap to check your own address. */
export function UseMyWalletLink({ label, locale }: { label: string; locale: string }) {
  const { state } = useWallet();
  if (state.status !== "connected" || !state.address) return null;
  return (
    <Link href={`/${locale}/address/${state.address}`} className="text-sm font-semibold text-primary hover:underline">
      {label}: <span className="technical">{shortenId(state.address)}</span>
    </Link>
  );
}
