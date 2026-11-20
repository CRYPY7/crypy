"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { WagmiProvider, useConnection } from "wagmi";
import { WALLET_FLAG_KEY, type WalletState, type WalletStrings } from "../types";
import { createWalletConfig } from "./config";
import { WalletDialog } from "./wallet-dialog";

const config = createWalletConfig();
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

interface RuntimeProps {
  strings: WalletStrings;
  locale: string;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onStateChange: (state: WalletState) => void;
}

/**
 * Loaded on demand. Owns wagmi and reports a simple state to the rest of the app.
 * It never requests a signature or a transaction.
 */
export default function EvmWalletRuntime(props: RuntimeProps) {
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
