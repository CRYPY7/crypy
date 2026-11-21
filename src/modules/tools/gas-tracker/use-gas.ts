"use client";

import { useEffect, useState } from "react";
import type { GasReport } from "@/server/services/gas";

const REFRESH_MS = 12_000;

/** Re-reads /api/v1/gas every 12 s while the tab is visible. */
export function useGas(initial: GasReport | null) {
  const [report, setReport] = useState<GasReport | null>(initial);
  // 0 until mounted: the clock is read in the browser only (pages are prerendered).
  const [now, setNow] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/v1/gas");
        const json = (await res.json()) as { ok: boolean; data?: GasReport };
        if (alive && json.ok && json.data) setReport(json.data);
      } catch {
        // Keep the last reading; the "updated" time shows how old it is.
      }
    };
    if (!initial) void load();
    const timer = setInterval(() => {
      void load();
      setNow(Date.now());
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    queueMicrotask(() => setNow(Date.now()));
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [initial]);
  return { report, now };
}
