"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { WagmiProvider, useConnection } from "wagmi";
import { WALLET_FLAG_KEY, type WalletActions, type WalletState, type WalletStrings } from "../types";
import { createWalletConfig } from "./config";
import { previewRevoke, runRevoke } from "./revoke-runner";
import { runSignIn } from "./sign-in-runner";
import { WalletDialog } from "./wallet-dialog";

const config = createWalletConfig();
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

interface RuntimeProps {
  strings: WalletStrings;
  locale: string;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onStateChange: (state: WalletState) => void;
  onActions: (actions: WalletActions) => void;
}

/**
 * The only wallet actions: revoke (M6) and sign-in (M8). Nothing runs until the person clicks Revoke or Sign in and
 * confirms in their wallet.
 */
const actions: WalletActions = {
  previewRevoke: (request) => previewRevoke(config, request),
  revoke: (request, onStep) => runRevoke(config, request, onStep),
  signIn: () => runSignIn(config),
};

/**
 * Loaded on demand. Owns wagmi and reports a simple state to the rest of the app.
 * It never requests a signature or a transaction on its own; revoke (revoke-runner.ts) and sign-in (sign-in-runner.ts)
 * run only when the person asks for them.
 */
export default function EvmWalletRuntime(props: RuntimeProps) {
  const { onActions } = props;
  useEffect(() => onActions(actions), [onActions]);
  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <StateBridge onStateChange={props.onStateChange} />
        <WalletDialog {...props} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function StateBridge({ onStateChange }: { onStateChange: (state: WalletState) => void }) {
  const connection = useConnection();
  const lastKey = useRef("");

  useEffect(() => {
    const next: WalletState =
      connection.status === "connected"
        ? {
            status: "connected",
            family: "evm",
            address: connection.address,
            chainId: connection.chainId,
            walletName: connection.connector?.name,
          }
        : { status: connection.status };
    const key = JSON.stringify(next);
    if (key === lastKey.current) return;
    lastKey.current = key;
    onStateChange(next);
    try {
      if (next.status === "connected") window.localStorage.setItem(WALLET_FLAG_KEY, "1");
      if (next.status === "disconnected") window.localStorage.removeItem(WALLET_FLAG_KEY);
    } catch {
      // Storage unavailable (private mode): the user simply reconnects next time.
    }
  }, [connection.status, connection.address, connection.chainId, connection.connector?.name, onStateChange]);

  return null;
}
