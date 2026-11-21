"use client";

import { lazy, Suspense } from "react";
import { Panel } from "@/modules/tools/shared/ui";

export type PortfolioStrings = Record<string, string>;

export interface PortfolioProps {
  strings: PortfolioStrings;
  locale: string;
  chainNames: Record<string, string>;
  /** e.g. "/en/address/" */
  addressPrefix: string;
  /** e.g. "/en/token/" */
  tokenPrefix: string;
}

// The portfolio lives in this browser's storage, so there is nothing to render on the server: its code is loaded
// only when the page opens (not when a link to it is prefetched), keeping every other page light.
const Tracker = lazy(() => import("./tracker"));

export function PortfolioTracker(props: PortfolioProps) {
  return (
    <Suspense
      fallback={
        <Panel>
          <p className="text-muted-foreground" aria-busy="true">
            {props.strings.loadingSaved}
          </p>
        </Panel>
      }
    >
      <Tracker {...props} />
    </Suspense>
  );
}
