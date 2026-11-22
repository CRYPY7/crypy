"use client";

import { Bell, Cloud, MonitorSmartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type PortfolioData, mergePortfolios, sameWallets, serializePortfolio } from "@/lib/portfolio/storage";
import { cn } from "@/lib/utils";
import { Panel, fill } from "@/modules/tools/shared/ui";
import { useWallet } from "@/wallets/wallet-root";

/**
 * Board 36, Portfolio: "Saved on this device only (no account). Sign in with your wallet to keep it on all your
 * devices — optional." and the "Watch for changes" card. Signing in is the same signed message as the Watchlist's.
 */

type Strings = Record<string, string>;

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
    return body?.ok && body.data !== undefined ? { ok: true, data: body.data } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

const put = (data: PortfolioData) =>
  call("/api/v1/portfolio", {
    method: "PUT",
    body: serializePortfolio(data),
    headers: { "Content-Type": "application/json" },
  });

export function PortfolioAccount({
  s,
  data,
  save,
}: {
  s: Strings;
  data: PortfolioData;
  /** Writes this browser's copy (the tracker's store). */
  save: (data: PortfolioData) => void;
}) {
  const { state: wallet, openWallet, actions } = useWallet();
  /** undefined: checking; null: not signed in; otherwise whether sync is on. */
  const [synced, setSynced] = useState<boolean | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const lastSent = useRef<string | null>(null);
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);

  // Signed in? Is a copy kept on the account? If so, merge it into this browser once.
  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await call<{ address: string | null }>("/api/v1/auth/session");
      if (!active) return;
      if (!session.ok || !session.data.address) return setSynced(null);
      const server = await call<{ portfolio: PortfolioData | null }>("/api/v1/portfolio");
      if (!active || !server.ok) return setSynced(server.ok ? false : null);
      if (!server.data.portfolio) return setSynced(false);
      const merged = mergePortfolios(latest.current, server.data.portfolio);
      if (!sameWallets(merged, latest.current)) save(merged);
      if (!sameWallets(merged, server.data.portfolio)) await put(merged);
      lastSent.current = serializePortfolio(merged);
      setSynced(true);
    })();
    return () => {
      active = false;
    };
  }, [version, save]);

  // While syncing: every change here is saved to the account too (a second later, after quick edits settle).
  useEffect(() => {
    if (synced !== true) return;
    const text = serializePortfolio({ ...data, snapshot: null });
    if (text === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = text;
      void put(data).then((r) => setNote(r.ok ? null : s.syncError!));
    }, 1_000);
    return () => clearTimeout(timer);
  }, [data, synced, s]);

  const signIn = async () => {
    if (!actions || wallet.status !== "connected") {
      setNote(s.syncConnectFirst!);
      openWallet();
      return;
    }
    setBusy(true);
    const outcome = await actions.signIn();
    setBusy(false);
    if (outcome.status === "signed-in") {
      setNote(null);
      setVersion((v) => v + 1);
    } else setNote(outcome.status === "rejected" ? s.syncRejected! : s.syncError!);
  };
  const toggle = async (on: boolean) => {
    setBusy(true);
    const result = on ? await put(data) : await call("/api/v1/portfolio", { method: "DELETE" });
    setBusy(false);
    if (result.ok) {
      lastSent.current = on ? serializePortfolio({ ...data, snapshot: null }) : null;
      setSynced(on);
      setNote(null);
    } else setNote(s.syncError!);
  };

  return (
    <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm" data-testid="portfolio-account">
      {synced === undefined ? null : synced === null ? (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <MonitorSmartphone className="size-4" aria-hidden="true" />
          {s.syncLocalOnly}{" "}
          <button type="button" className="text-primary hover:underline" disabled={busy} onClick={() => void signIn()}>
            {s.syncSignIn}
          </button>{" "}
          {s.syncOptional}
        </p>
      ) : (
        <label className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Cloud className="size-4" aria-hidden="true" />
          <input
            type="checkbox"
            role="switch"
            checked={synced}
            disabled={busy}
            onChange={(e) => void toggle(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
          {synced ? s.syncOn : s.syncOff}
        </label>
      )}
      {note && (
        <p role="status" className="text-xs text-medium">
          {note}
        </p>
      )}
    </div>
  );
}

export function WatchForChanges({ s, watchlistPath, count }: { s: Strings; watchlistPath: string; count: number }) {
  return (
    <Panel data-testid="watch-for-changes">
      <h2 className="text-lg font-semibold">{s.watchTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{s.watchText}</p>
      <a
        href={`${watchlistPath}?add=portfolio`}
        className={cn(
          "mt-3 inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90",
          count === 0 && "pointer-events-none opacity-50",
        )}
        aria-disabled={count === 0}
      >
        <Bell className="size-4" aria-hidden="true" />
        {s.watchButton}
      </a>
      <p className="mt-2 text-xs text-muted-foreground">{fill(s.watchNote!, { count })}</p>
    </Panel>
  );
}
