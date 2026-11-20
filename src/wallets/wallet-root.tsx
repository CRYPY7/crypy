"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { WALLET_FLAG_KEY, type WalletState, type WalletStrings } from "./types";

// The wallet runtime (wagmi, viem, WalletConnect) is downloaded only when it's needed.
const EvmWalletRuntime = lazy(() => import("./evm/runtime"));

interface WalletContextValue {
  state: WalletState;
  openWallet: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  state: { status: "disconnected" },
  openWallet: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function wasUsedBefore(): boolean {
  try {
    return window.localStorage.getItem(WALLET_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function WalletRoot({
  strings,
  locale,
  children,
}: {
  strings: WalletStrings;
  locale: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<WalletState>({ status: "disconnected" });
  const [loadRuntime, setLoadRuntime] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Returning user who connected before: load the runtime when the browser is idle and reconnect silently.
  useEffect(() => {
    if (!wasUsedBefore()) return;
    const start = () => setLoadRuntime(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 1500);
    return () => clearTimeout(id);
  }, []);

  const openWallet = useCallback(() => {
    setLoadRuntime(true);
    setDialogOpen(true);
  }, []);

  const value = useMemo(() => ({ state, openWallet }), [state, openWallet]);

  return (
    <WalletContext.Provider value={value}>
      {children}
      {loadRuntime && (
        <Suspense fallback={null}>
          <EvmWalletRuntime
            strings={strings}
            locale={locale}
            dialogOpen={dialogOpen}
            onDialogOpenChange={setDialogOpen}
            onStateChange={setState}
          />
        </Suspense>
      )}
    </WalletContext.Provider>
  );
}
