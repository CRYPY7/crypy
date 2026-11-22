"use client";

import { Suspense, lazy } from "react";
import { Panel } from "@/modules/tools/shared/ui";

export interface WatchlistProps {
  strings: Record<string, string>;
  chainNames: Record<string, string>;
  /** Chains where a token can be watched (Token Security available). */
  tokenChains: string[];
  locale: string;
  addressPrefix: string;
  tokenPrefix: string;
}

// Signed-in content only: loaded when the page opens, not when a link to it is prefetched.
const WatchlistPanel = lazy(() => import("./panel"));

export function Watchlist(props: WatchlistProps) {
  return (
    <Suspense
      fallback={
        <Panel>
          <p className="text-muted-foreground" aria-busy="true">
            {props.strings.loading}
          </p>
        </Panel>
      }
    >
      <WatchlistPanel {...props} />
    </Suspense>
  );
}
