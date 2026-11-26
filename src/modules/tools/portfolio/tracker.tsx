"use client";

import {
  ChevronRight,
  Download,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PortfolioAccount, WatchForChanges } from "./account";
import { ChainIcon } from "@/components/chain-icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/format/money";
import type { ChainHoldings } from "@/lib/portfolio/holdings";
import { type WalletOverview, combinePortfolio, portfolioCsv } from "@/lib/portfolio/combine";
import { checkWalletInput, cleanLabel } from "@/lib/portfolio/input";
import {
  MAX_WALLETS,
  PORTFOLIO_KEY,
  type PortfolioData,
  type SavedWallet,
  type Snapshot,
  nextSnapshot,
  parsePortfolio,
  serializePortfolio,
} from "@/lib/portfolio/storage";
import { cn } from "@/lib/utils";
import { Panel, fill, inputClass } from "@/modules/tools/shared/ui";
import { useWallet } from "@/wallets/wallet-root";

import type { PortfolioProps, PortfolioStrings } from "./widget";
import {
  SAFETY_KEY,
  type SafetyCache,
  type SafetyReport,
  forgetSafety,
  freshEntry,
  parseSafetyCache,
  rememberSafety,
  serializeSafetyCache,
} from "@/lib/portfolio/safety-cache";

interface WalletReport {
  overview: {
    chains: ChainHoldings[];
    unavailable: string[];
    pricesAvailable: boolean;
    /** Chains shown from an earlier reading (stabilization S2). */
    saved?: Record<string, string>;
    refreshing?: Record<string, string>;
    completing?: string[];
  };
}

type LoadState = { status: "loading" } | { status: "ok"; report: WalletReport } | { status: "error"; limited: boolean };
/**
 * B-034: read after the balances, in its own request, so balances never wait for it; remembered in this browser for
 * 6 hours (safety-cache.ts). No entry: not asked yet (balances still loading) or checking.
 */
type SafetyState = { status: "ok"; report: SafetyReport; at: number } | { status: "error" };

function readSafetyCache(): SafetyCache {
  try {
    return parseSafetyCache(localStorage.getItem(SAFETY_KEY));
  } catch {
    return {};
  }
}

function writeSafetyCache(cache: SafetyCache) {
  try {
    localStorage.setItem(SAFETY_KEY, serializeSafetyCache(cache));
  } catch {
    // Storage blocked or full: the result is still shown for this visit.
  }
}

/** Chain colours for the by-chain bar (brand-like hues that read in both themes). */
const chainColor: Record<string, string> = {
  ethereum: "#7b8cf0",
  bsc: "#e8b30b",
  base: "#2f6bff",
  arbitrum: "#2a9fd6",
  polygon: "#8247e5",
};
const PARALLEL = 4;
/** Safety checks are heavier (GoPlus and on-chain scans per chain): fewer at once, behind the balances. */
const SAFETY_PARALLEL = 2;
/** B-035: how often, and how long apart, a wallet whose token list is still being read is read again. */
const COMPLETING_TRIES = 6;
const COMPLETING_DELAY_MS = 4_000;
const HOLDINGS_PAGE = 25;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function usd(value: number, locale: string) {
  return value > 0 && value < 0.01 ? `< ${formatUsd(0.01, locale)}` : formatUsd(value, locale);
}

/**
 * The saved portfolio as a small external store over localStorage: every open tab stays in step, and a browser that
 * blocks storage (private mode) still works for the visit from an in-memory copy.
 */
const listeners = new Set<() => void>();
let memoryCopy: string | null = null;

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(PORTFOLIO_KEY) ?? memoryCopy;
  } catch {
    return memoryCopy;
  }
}

function writeSaved(data: PortfolioData) {
  memoryCopy = serializePortfolio(data);
  try {
    window.localStorage.setItem(PORTFOLIO_KEY, memoryCopy);
  } catch {
    // Storage blocked or full: the in-memory copy keeps this visit working.
  }
  for (const listener of listeners) listener();
}

function subscribeSaved(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PORTFOLIO_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function since(at: number, now: number, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export default function PortfolioTracker({
  strings: s,
  locale,
  chainNames,
  addressPrefix,
  tokenPrefix,
}: PortfolioProps) {
  const { state: wallet } = useWallet();
  // The saved portfolio, read from this browser (undefined on the server and before hydration).
  const raw = useSyncExternalStore(subscribeSaved, readSaved, () => undefined);
  const data = useMemo(() => (raw === undefined ? null : parsePortfolio(raw)), [raw]);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [safety, setSafety] = useState<Record<string, SafetyState>>({});
  /** For "Checked 2 hours ago": updated once a minute. */
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [comparison, setComparison] = useState<{ snapshot: Snapshot; now: number } | null>(null);
  const [dialog, setDialog] = useState<{ edit?: SavedWallet } | null>(null);
  const [showAll, setShowAll] = useState(false);
  /** Latest request per address: an older answer never overwrites a newer one. */
  const requests = useRef(new Map<string, number>());
  /** Safety checks waiting for a free slot, and how many run (B-034). */
  const safetyQueue = useRef<{ address: string; id: number }[]>([]);
  const safetyRunning = useRef(0);

  /**
   * B-035: a wallet with thousands of tokens is shown after its first part; its full list is still being read on the
   * server. Its balances are read again quietly (no loading state, safety untouched) a few seconds later.
   */
  const followCompleting = useCallback((address: string, id: number) => {
    void (async () => {
      for (let attempt = 1; attempt <= COMPLETING_TRIES; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, COMPLETING_DELAY_MS));
        if (requests.current.get(address) !== id) return; // refreshed or removed meanwhile
        try {
          const response = await fetch(`/api/v1/address/${address}/portfolio`, {
            headers: { accept: "application/json" },
          });
          const body = (await response.json()) as { ok: boolean; data?: WalletReport };
          if (!body.ok || !body.data || requests.current.get(address) !== id) return;
          const report = body.data;
          setLoads((prev) => ({ ...prev, [address]: { status: "ok", report } }));
          if (!report.overview.completing?.length) return;
        } catch {
          return; // The balances already shown stay; the next refresh reads again.
        }
      }
    })();
  }, []);

  /** Reads queued safety checks, SAFETY_PARALLEL at a time. */
  const pumpSafety = useCallback(() => {
    const worker = async () => {
      for (let next = safetyQueue.current.shift(); next; next = safetyQueue.current.shift()) {
        const { address, id } = next;
        if (requests.current.get(address) !== id) continue; // refreshed or removed meanwhile
        let result: SafetyState;
        try {
          const response = await fetch(`/api/v1/address/${address}/portfolio?part=safety`, {
            headers: { accept: "application/json" },
          });
          const body = (await response.json()) as { ok: boolean; data?: SafetyReport };
          const at = Date.now();
          result = body.ok && body.data ? { status: "ok", report: body.data, at } : { status: "error" };
          if (result.status === "ok") writeSafetyCache(rememberSafety(readSafetyCache(), address, result.report, at));
        } catch {
          result = { status: "error" };
        }
        if (requests.current.get(address) === id) setSafety((prev) => ({ ...prev, [address]: result }));
      }
      safetyRunning.current -= 1;
    };
    while (safetyRunning.current < SAFETY_PARALLEL && safetyQueue.current.length) {
      safetyRunning.current += 1;
      void worker();
    }
  }, []);
  const chainName = useCallback((key: string) => chainNames[key] ?? key, [chainNames]);

  /** Reads the wallets, a few at a time. A wallet without an entry in `loads` shows as loading. */
  const fetchWallets = useCallback(
    async (addresses: string[]) => {
      const queue = addresses.map((address) => {
        const id = (requests.current.get(address) ?? 0) + 1;
        requests.current.set(address, id);
        return { address, id };
      });
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const { address, id } = next;
          let result: LoadState;
          try {
            const response = await fetch(`/api/v1/address/${address}/portfolio`, {
              headers: { accept: "application/json" },
            });
            const body = (await response.json()) as { ok: boolean; data?: WalletReport };
            result =
              body.ok && body.data
                ? { status: "ok", report: body.data }
                : { status: "error", limited: response.status === 429 };
          } catch {
            result = { status: "error", limited: false };
          }
          if (requests.current.get(address) !== id) continue;
          setLoads((prev) => ({ ...prev, [address]: result }));
          // Balances are shown; the safety badges come from this browser's result of the last 6 hours, else from their
          // own request.
          if (result.status === "ok") {
            if (result.report.overview.completing?.length) followCompleting(address, id);
            const remembered = freshEntry(readSafetyCache(), address, Date.now());
            if (remembered) {
              const state: SafetyState = { status: "ok", report: remembered.report, at: remembered.at };
              setSafety((prev) => ({ ...prev, [address]: state }));
            } else {
              safetyQueue.current.push({ address, id });
              pumpSafety();
            }
          }
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    },
    [pumpSafety, followCompleting],
  );

  /** Shows wallets as loading again, then reads them (refresh and retry). */
  const reload = (addresses: string[]) => {
    const forget = <T,>(prev: Record<string, T>) => {
      const next = { ...prev };
      for (const a of addresses) delete next[a];
      return next;
    };
    setLoads(forget);
    setSafety(forget);
    void fetchWallets(addresses);
  };

  // Read every saved wallet not read yet: on open, after adding one, or when another tab changes the portfolio.
  useEffect(() => {
    const missing = (data?.wallets ?? []).map((w) => w.address).filter((a) => !requests.current.has(a));
    if (missing.length) void fetchWallets(missing);
  }, [data, fetchWallets]);

  const overviews: WalletOverview[] = useMemo(
    () =>
      (data?.wallets ?? []).map((w) => {
        const load = loads[w.address];
        return {
          address: w.address,
          label: w.label,
          chains: load?.status === "ok" ? load.report.overview.chains : null,
          pricesAvailable: load?.status === "ok" ? load.report.overview.pricesAvailable : true,
        };
      }),
    [data, loads],
  );
  const summary = useMemo(() => combinePortfolio(overviews), [overviews]);
  const loading = (data?.wallets ?? []).some((w) => !loads[w.address] || loads[w.address]!.status === "loading");
  const failed = (data?.wallets ?? []).filter((w) => loads[w.address]?.status === "error");
  const allLoaded = !!data && data.wallets.length > 0 && !loading && failed.length === 0;

  // "Since you last looked": compare with the saved total once every wallet has loaded, then keep the new one.
  // Only once per visit, and only when every price was read (a missing price would look like a loss).
  const snapshotDone = useRef(false);
  useEffect(() => {
    if (!data || !allLoaded || snapshotDone.current) return;
    if (overviews.some((o) => !o.pricesAvailable)) return;
    // A chain left out, or shown from an earlier reading, would make the comparison wrong.
    if (
      Object.values(loads).some(
        (l) =>
          l?.status === "ok" &&
          (l.report.overview.unavailable.length > 0 || l.report.overview.saved || l.report.overview.refreshing),
      )
    )
      return;
    snapshotDone.current = true;
    const now = Date.now();
    const { compareTo, keep } = nextSnapshot(data.snapshot, summary.totalUsd, now);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once per visit, after the wallets load
    if (compareTo) setComparison({ snapshot: compareTo, now });
    if (keep !== data.snapshot) writeSaved({ ...data, snapshot: keep });
  }, [allLoaded, data, loads, overviews, summary.totalUsd]);

  const reports = (data?.wallets ?? []).flatMap((w) => {
    const load = loads[w.address];
    const check = safety[w.address];
    return load?.status === "ok" && check?.status === "ok" ? [{ wallet: w, report: check.report }] : [];
  });
  /** Wallets whose balances are shown and whose safety checks are still running. */
  const checking = (data?.wallets ?? []).some((w) => loads[w.address]?.status === "ok" && !safety[w.address]);
  const safetyFailed = (data?.wallets ?? []).some((w) => safety[w.address]?.status === "error");
  const approvalWallets = reports.filter((r) => (r.report.approvals?.attention ?? 0) > 0);
  const approvalCount = approvalWallets.reduce((n, r) => n + r.report.approvals!.attention, 0);
  const flagged = reports.flatMap((r) => (r.report.flagged?.tokens ?? []).map((t) => ({ ...t, wallet: r.wallet })));
  const fullyChecked = (r: SafetyReport) =>
    r.approvals !== null && !r.approvals.partial && r.flagged !== null && r.flagged.skipped === 0;
  const someUnchecked = safetyFailed || reports.some((r) => !fullyChecked(r.report));
  const balanceReports = (data?.wallets ?? []).flatMap((w) => {
    const load = loads[w.address];
    return load?.status === "ok" ? [load.report] : [];
  });
  const unavailableChains = [...new Set(balanceReports.flatMap((r) => r.overview.unavailable))];
  const pricesMissing = balanceReports.some((r) => !r.overview.pricesAvailable);
  const savedChains = [
    ...new Set(
      balanceReports.flatMap((r) => [
        ...Object.keys(r.overview.saved ?? {}),
        ...Object.keys(r.overview.refreshing ?? {}),
      ]),
    ),
  ];

  const refresh = () => {
    if (!data) return;
    snapshotDone.current = true; // a manual refresh keeps the comparison already shown
    reload(data.wallets.map((w) => w.address));
  };

  const remove = (address: string) => {
    if (!data) return;
    writeSaved({ ...data, wallets: data.wallets.filter((w) => w.address !== address) });
    requests.current.delete(address);
    const forget = <T,>(prev: Record<string, T>) => {
      const next = { ...prev };
      delete next[address];
      return next;
    };
    setLoads(forget);
    setSafety(forget);
    writeSafetyCache(forgetSafety(readSafetyCache(), address));
  };

  /** "Check again": forgets this wallet's remembered result and runs its safety checks now. */
  const checkAgain = (address: string) => {
    const id = requests.current.get(address);
    if (id === undefined) return;
    writeSafetyCache(forgetSafety(readSafetyCache(), address));
    setSafety((prev) => {
      const next = { ...prev };
      delete next[address];
      return next;
    });
    safetyQueue.current.push({ address, id });
    pumpSafety();
  };

  const saveWallet = (address: string, label: string, editing?: SavedWallet) => {
    if (!data) return;
    if (editing) {
      writeSaved({ ...data, wallets: data.wallets.map((w) => (w.address === editing.address ? { ...w, label } : w)) });
      return;
    }
    // A wallet added later starts a fresh comparison, so its value isn't shown as a gain.
    writeSaved({ wallets: [...data.wallets, { address, label, addedAt: Date.now() }], snapshot: null });
    snapshotDone.current = true;
    setComparison(null);
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([portfolioCsv(summary, chainName)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `crypy-portfolio-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!data) {
    return (
      <Panel>
        <p className="text-muted-foreground" aria-busy="true">
          {s.loadingSaved}
        </p>
      </Panel>
    );
  }

  const connected = wallet.status === "connected" && wallet.address ? wallet.address : null;
  const connectedSaved = connected && data.wallets.some((w) => w.address.toLowerCase() === connected.toLowerCase());
  const full = data.wallets.length >= MAX_WALLETS;

  const addDialog = dialog && (
    <WalletDialog
      s={s}
      existing={data.wallets}
      editing={dialog.edit}
      onClose={() => setDialog(null)}
      onSave={(address, label) => {
        saveWallet(address, label, dialog.edit);
        setDialog(null);
      }}
    />
  );

  if (data.wallets.length === 0) {
    return (
      <>
        <Panel className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="size-7" aria-hidden="true" />
          </span>
          <div className="max-w-md">
            <h2 className="text-xl font-semibold">{s.emptyTitle}</h2>
            <p className="mt-2 text-muted-foreground">{s.emptyText}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setDialog({})} className={primaryButton}>
              <Plus className="size-4" aria-hidden="true" />
              {s.addWallet}
            </button>
            {connected && (
              <button type="button" onClick={() => saveWallet(connected, s.myWallet!)} className={secondaryButton}>
                <Wallet className="size-4" aria-hidden="true" />
                {fill(s.addConnected!, { address: short(connected) })}
              </button>
            )}
          </div>
          <ul className="mt-2 grid max-w-xl gap-2 text-start text-sm text-muted-foreground sm:grid-cols-3">
            <li className="rounded-xl border border-border p-3">{s.emptyPoint1}</li>
            <li className="rounded-xl border border-border p-3">{s.emptyPoint2}</li>
            <li className="rounded-xl border border-border p-3">{s.emptyPoint3}</li>
          </ul>
          <div className="w-full max-w-xl text-start">
            <PortfolioAccount s={s} data={data} save={writeSaved} />
          </div>
        </Panel>
        {addDialog}
      </>
    );
  }

  const change = comparison ? summary.totalUsd - comparison.snapshot.totalUsd : null;
  const holdings = showAll ? summary.holdings : summary.holdings.slice(0, HOLDINGS_PAGE);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{fill(s.totalOf!, { count: data.wallets.length })}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl" data-testid="portfolio-total">
              {loading && summary.loadedWallets === 0 ? "…" : usd(summary.totalUsd, locale)}
            </p>
            {change !== null && comparison && Math.abs(change) >= 0.01 && (
              <>
                <p className={cn("mt-1 text-sm tabular-nums", change >= 0 ? "text-low" : "text-critical")}>
                  {fill(s.sinceLast!, {
                    change: `${change >= 0 ? "+" : "−"}${usd(Math.abs(change), locale)}`,
                    when: since(comparison.snapshot.at, comparison.now, locale),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">{s.notProfit}</p>
              </>
            )}
            {loading && (
              <p className="mt-1 text-sm text-muted-foreground" role="status">
                {fill(s.loadingWallets!, { done: summary.loadedWallets + failed.length, total: data.wallets.length })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={refresh} disabled={loading} className={secondaryButton}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
              {s.refresh}
            </button>
            <button type="button" onClick={exportCsv} disabled={!summary.holdings.length} className={secondaryButton}>
              <Download className="size-4" aria-hidden="true" />
              {s.exportCsv}
            </button>
            <button type="button" onClick={() => setDialog({})} disabled={full} className={primaryButton}>
              <Plus className="size-4" aria-hidden="true" />
              {s.addWallet}
            </button>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat
            value={String(summary.pricedTokens)}
            label={s.statTokens!}
            note={summary.unpricedTokens ? fill(s.statTokensNote!, { count: summary.unpricedTokens }) : undefined}
          />
          <Stat
            value={approvalCount || !checking ? String(approvalCount) : "…"}
            label={s.statApprovals!}
            note={
              approvalCount
                ? fill(s.inWallets!, { count: approvalWallets.length })
                : checking
                  ? s.checking
                  : s.noneFound
            }
            tone={approvalCount ? "warn" : undefined}
          />
          <Stat
            value={flagged.length || !checking ? String(flagged.length) : "…"}
            label={s.statFlagged!}
            note={flagged.length ? s.flaggedBy : checking ? s.checking : s.noneFound}
            tone={flagged.length ? "bad" : undefined}
          />
        </dl>
        <PortfolioAccount s={s} data={data} save={writeSaved} />

        {summary.byChain.length > 0 && summary.totalUsd > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">{s.byChain}</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {summary.byChain.map((c) => (
                <span
                  key={c.chain}
                  style={{ width: `${(c.totalUsd / summary.totalUsd) * 100}%`, background: chainColor[c.chain] }}
                />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {summary.byChain.map((c) => (
                <li key={c.chain} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: chainColor[c.chain] }}
                    aria-hidden="true"
                  />
                  {chainName(c.chain)}
                  <span className="text-muted-foreground tabular-nums">
                    {usd(c.totalUsd, locale)} · {Math.round((c.totalUsd / summary.totalUsd) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(failed.length > 0 || unavailableChains.length > 0 || savedChains.length > 0 || pricesMissing) && (
          <div className="mt-4 flex flex-col gap-1 rounded-xl border border-medium/40 bg-medium/8 p-3 text-sm">
            {failed.length > 0 && (
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-medium" aria-hidden="true" />
                <span>
                  {fill(
                    failed.some((w) => (loads[w.address] as { limited?: boolean }).limited)
                      ? s.rateLimited!
                      : s.someFailed!,
                    {
                      count: failed.length,
                    },
                  )}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-3"
                    onClick={() => reload(failed.map((w) => w.address))}
                  >
                    {s.retry}
                  </button>
                </span>
              </p>
            )}
            {unavailableChains.length > 0 && (
              <p>{fill(s.chainsDown!, { chains: unavailableChains.map(chainName).join(", ") })}</p>
            )}
            {savedChains.length > 0 && (
              <p data-freshness="saved">{fill(s.chainsSaved!, { chains: savedChains.map(chainName).join(", ") })}</p>
            )}
            {pricesMissing && <p>{s.pricesMissing}</p>}
          </div>
        )}
      </Panel>

      {/* Wallets */}
      <Panel className="p-0 sm:p-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
          <h2 className="text-lg font-semibold">{s.walletsTitle}</h2>
          <span className="text-sm text-muted-foreground">
            {fill(s.walletCount!, { count: data.wallets.length, max: MAX_WALLETS })}
          </span>
        </div>
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {summary.wallets.map((w, i) => {
            const saved = data.wallets[i]!;
            const load = loads[w.address];
            const check = safety[w.address];
            const report = load?.status === "ok" && check?.status === "ok" ? check.report : null;
            const checkingThis = load?.status === "ok" && !check;
            const attention = report?.approvals?.attention ?? 0;
            const risky = report?.flagged?.tokens.length ?? 0;
            const share = summary.totalUsd > 0 ? Math.round((w.totalUsd / summary.totalUsd) * 100) : 0;
            return (
              <li
                key={w.address}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6"
                data-testid="portfolio-wallet"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">{w.label || s.unnamed}</p>
                  <p className="technical text-xs text-muted-foreground" dir="ltr">
                    {short(w.address)}
                  </p>
                  {w.chains.length > 0 && (
                    <span className="mt-1 flex gap-1">
                      {w.chains.map((c) => (
                        <ChainIcon key={c.chain} chain={c.chain} size={16} />
                      ))}
                    </span>
                  )}
                </div>
                <div className="text-end">
                  <p className="font-semibold tabular-nums">
                    {load?.status === "ok" ? usd(w.totalUsd, locale) : load?.status === "error" ? s.notLoaded : "…"}
                  </p>
                  {load?.status === "ok" && <p className="text-xs text-muted-foreground tabular-nums">{share}%</p>}
                </div>
                <div className="flex min-w-36 flex-wrap justify-end gap-1">
                  {attention > 0 && <Badge tone="warn">{fill(s.badgeApprovals!, { count: attention })}</Badge>}
                  {risky > 0 && <Badge tone="bad">{fill(s.badgeFlagged!, { count: risky })}</Badge>}
                  {report && !attention && !risky && fullyChecked(report) && <Badge>{s.badgeNothing}</Badge>}
                  {checkingThis && <Badge>{s.checking}</Badge>}
                  {check?.status === "ok" && (
                    <span className="w-full text-end text-xs text-muted-foreground">
                      {fill(s.checkedAgo!, { when: since(check.at, Math.max(clock, check.at), locale) })}
                      {" · "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => checkAgain(w.address)}
                        aria-label={fill(s.checkAgainLabel!, { name: w.label || short(w.address) })}
                      >
                        {s.checkAgain}
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={`${addressPrefix}${w.address}`}
                    className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-primary hover:bg-muted"
                  >
                    {s.open}
                    <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </a>
                  <IconButton
                    label={fill(s.editLabel!, { name: w.label || short(w.address) })}
                    onClick={() => setDialog({ edit: saved })}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={fill(s.remove!, { name: w.label || short(w.address) })}
                    onClick={() => remove(w.address)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
        {connected && !connectedSaved && !full && (
          <div className="border-t border-border px-4 py-3 sm:px-6">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => saveWallet(connected, s.myWallet!)}
            >
              {fill(s.addConnected!, { address: short(connected) })}
            </button>
          </div>
        )}
      </Panel>

      {/* Safety */}
      {(approvalCount > 0 || flagged.length > 0 || someUnchecked) && (
        <Panel>
          <h2 className="text-lg font-semibold">{s.safetyTitle}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {approvalWallets.map(({ wallet: w, report }) => (
              <div key={w.address} className="flex items-start gap-3 rounded-xl border border-high/40 bg-high/8 p-3">
                <KeyRound className="mt-0.5 size-5 shrink-0 text-high" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {fill(s.approvalsIn!, { count: report.approvals!.attention, name: w.label || short(w.address) })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {fill(s.onChains!, { chains: report.approvals!.chains.map(chainName).join(", ") })}
                  </p>
                  <a className="text-sm text-primary hover:underline" href={`${addressPrefix}${w.address}/approvals`}>
                    {s.reviewApprovals}
                  </a>
                </div>
              </div>
            ))}
            {flagged.map((t) => (
              <div
                key={`${t.wallet.address}:${t.chain}:${t.address}`}
                className="flex items-start gap-3 rounded-xl border border-critical/40 bg-critical/8 p-3"
              >
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {fill(t.reason === "honeypot" ? s.flagHoneypot! : s.flagSellTax!, {
                      symbol: t.symbol,
                      name: t.wallet.label || short(t.wallet.address),
                      chain: chainName(t.chain),
                      tax: t.sellTax === null ? "?" : `${Math.round(t.sellTax * 100)}%`,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">{s.flagSource}</p>
                  <a className="text-sm text-primary hover:underline" href={`${tokenPrefix}${t.chain}/${t.address}`}>
                    {s.openReport}
                  </a>
                </div>
              </div>
            ))}
            {someUnchecked && <p className="text-sm text-muted-foreground">{s.someUnchecked}</p>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{s.safetyNote}</p>
        </Panel>
      )}

      <WatchForChanges s={s} watchlistPath={`/${locale}/tools/watchlist`} count={data.wallets.length} />

      {/* Holdings */}
      {summary.holdings.length > 0 && (
        <Panel className="p-0 sm:p-0">
          <h2 className="px-4 pt-4 text-lg font-semibold sm:px-6 sm:pt-5">{s.holdingsTitle}</h2>
          <p className="px-4 text-sm text-muted-foreground sm:px-6">{s.holdingsNote}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-y border-border text-start text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-medium sm:px-6">{s.colToken}</th>
                  <th className="px-2 py-2 text-start font-medium">{s.colChains}</th>
                  <th className="px-2 py-2 text-end font-medium">{s.colAmount}</th>
                  <th className="px-2 py-2 text-end font-medium">{s.colValue}</th>
                  <th className="px-4 py-2 text-end font-medium sm:px-6">{s.colWallets}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {holdings.map((h) => (
                  <tr key={h.key}>
                    <td className="px-4 py-2 sm:px-6">
                      {h.link ? (
                        <a
                          className="font-medium hover:underline"
                          href={`${tokenPrefix}${h.link.chain}/${h.link.address}`}
                        >
                          {h.symbol}
                        </a>
                      ) : (
                        <span className="font-medium">{h.symbol}</span>
                      )}
                      <span className="block max-w-56 truncate text-xs text-muted-foreground">{h.name}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex gap-1">
                        {h.chains.map((c) => (
                          <ChainIcon key={c} chain={c} size={16} />
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums">
                      {new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(h.amount)}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums">
                      {h.valueUsd === null ? (
                        <span className="text-muted-foreground">{s.noPrice}</span>
                      ) : (
                        usd(h.valueUsd, locale)
                      )}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums sm:px-6">{h.wallets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground sm:px-6">
            <span>{summary.hiddenSpam > 0 ? fill(s.spamHidden!, { count: summary.hiddenSpam }) : ""}</span>
            {summary.holdings.length > HOLDINGS_PAGE && (
              <button type="button" className="text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? s.showFewer : fill(s.showAll!, { count: summary.holdings.length })}
              </button>
            )}
          </div>
        </Panel>
      )}

      <p className="text-xs text-muted-foreground">{s.privacyNote}</p>
      {addDialog}
    </div>
  );
}

const primaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";

function Stat({ value, label, note, tone }: { value: string; label: string; note?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "warn" && "text-high",
          tone === "bad" && "text-critical",
        )}
      >
        {value}
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "warn"
          ? "bg-high/14 text-high"
          : tone === "bad"
            ? "bg-critical/14 text-critical"
            : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Add or rename a wallet. Read from the form on submit; a pasted seed phrase or key is cleared at once, never kept. */
function WalletDialog({
  s,
  existing,
  editing,
  onClose,
  onSave,
}: {
  s: PortfolioStrings;
  existing: SavedWallet[];
  editing?: SavedWallet;
  onClose: () => void;
  onSave: (address: string, label: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = cleanLabel(String(form.get("label") ?? ""));
    if (editing) return onSave(editing.address, label);
    const checked = checkWalletInput(String(form.get("address") ?? ""));
    if (checked.kind !== "ok") {
      if (checked.kind === "secret" && addressRef.current) addressRef.current.value = "";
      return setError(
        checked.kind === "secret"
          ? s.errSecret!
          : checked.kind === "checksum"
            ? s.errChecksum!
            : checked.kind === "empty"
              ? s.errEmpty!
              : s.errInvalid!,
      );
    }
    if (existing.some((w) => w.address === checked.address)) return setError(s.errDuplicate!);
    if (existing.length >= MAX_WALLETS) return setError(fill(s.errFull!, { max: MAX_WALLETS }));
    onSave(checked.address, label);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{editing ? s.editTitle : s.addTitle}</DialogTitle>
        <DialogDescription>{s.addText}</DialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {!editing && (
            <div>
              <label htmlFor="portfolio-address" className="mb-1 block text-sm font-medium">
                {s.addressLabel}
              </label>
              <input
                ref={addressRef}
                id="portfolio-address"
                name="address"
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                placeholder="0x…"
                aria-invalid={error ? true : undefined}
                aria-describedby="portfolio-address-error"
                onChange={() => error && setError(null)}
                className={cn(inputClass, "technical text-sm")}
              />
              <p id="portfolio-address-error" role="alert" className="mt-2 text-sm text-critical empty:hidden">
                {error}
              </p>
            </div>
          )}
          <div>
            <label htmlFor="portfolio-label" className="mb-1 block text-sm font-medium">
              {s.labelLabel}
            </label>
            <input
              id="portfolio-label"
              name="label"
              maxLength={40}
              defaultValue={editing?.label ?? ""}
              placeholder={s.labelPlaceholder}
              className={inputClass}
            />
          </div>
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{s.watchOnly}</p>
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButton}>{s.cancel}</DialogClose>
            <button type="submit" className={primaryButton}>
              {editing ? s.save : s.add}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
