"use client";

import { Check, Layers, Lock, Plus, Search, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChainIcon } from "@/components/chain-icon";
import type { BatchAssetDef } from "@/config/batch-assets";
import { cn } from "@/lib/utils";
import { fill } from "@/modules/tools/shared/ui";
import type enMessages from "../../../../messages/en.json";
import { AddressEditor } from "./editor";
import { BROWSER_MAX_ADDRESSES, type Entry, MAX_ADDRESSES, parseList } from "./parse";
import type { ScanAsset, ScanPrices, ScanRow } from "./results";
import { type ChainProgress, type JobStatus, ScanProgress } from "./progress";
import { ResultsView } from "./results-view";

export type BatchStrings = (typeof enMessages)["utilities"]["batch-balance"];

export interface BatchChain {
  key: string;
  name: string;
  nativeSymbol: string;
  /** Keyless public nodes ("Scan in my browser"). */
  publicRpcUrls?: string[];
}

const MAX_TOKENS = 5;

interface BatchResponse {
  ok: boolean;
  data?: {
    block: string;
    rows: {
      address: string;
      type: ScanRow["type"];
      native: string | null;
      tokens: (string | null)[];
    }[];
    prices?: Record<string, number>;
  };
  error?: { code: string };
}

function nativeAsset(chains: BatchChain[]): ScanAsset {
  return {
    key: "native",
    symbol: chains.map((c) => c.nativeSymbol).join(" · "),
    name: "",
    chains: Object.fromEntries(chains.map((c) => [c.key, { address: "native", decimals: 18 }])),
  };
}

function fromDef(def: BatchAssetDef): ScanAsset {
  return { key: def.key, symbol: def.symbol, name: def.name, chains: { ...def.chains } };
}

const STORAGE_KEY = "crypy.batchScan";
const POLL_MS = 1_000;

/** What the page keeps in this tab (sessionStorage) so a refresh finds the scan again. Labels stay in the browser. */
interface SavedScan {
  jobId: string;
  text: string;
  selected: string[];
  tokens: ScanAsset[];
  at: string;
}

interface JobView {
  status: JobStatus;
  position: number | null;
  startsIn: number | null;
  chains: Record<string, ChainProgress>;
  rows: {
    chain: string;
    block: string;
    row: { address: string; type: ScanRow["type"]; native: string | null; tokens: (string | null)[] };
  }[];
  seq: number;
}

type CreateResult =
  | { jobId: string; refused?: undefined }
  | { refused: "active"; jobId: string }
  | { refused: "busy" }
  | { refused: "too-many"; maxWallets: number }
  | { refused: "daily-limit"; dailyWallets: number; resetsAt: string };

function readSaved(): SavedScan | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as SavedScan | null;
    return value && typeof value.jobId === "string" && /^[0-9a-f]{32}$/.test(value.jobId) ? value : null;
  } catch {
    return null;
  }
}

function writeSaved(value: SavedScan | null) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the scan still runs, it just isn't found again after a refresh.
  }
}

/** Rough time before the scan: about 400 balances a second on the server, plus a few seconds to start. */
export function estimateSeconds(balances: number): number {
  return Math.ceil(5 + balances / 400);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function BatchBalanceScanner({
  strings: s,
  chains,
  knownAssets,
  locale,
  addressPathPrefix,
}: {
  strings: BatchStrings;
  chains: BatchChain[];
  knownAssets: BatchAssetDef[];
  locale: string;
  addressPathPrefix: string;
}) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>(chains.map((c) => c.key));
  const [tokens, setTokens] = useState<ScanAsset[]>([]);
  const [phase, setPhase] = useState<"input" | "scanning" | "done">("input");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [prices, setPrices] = useState<ScanPrices>({});
  const [job, setJob] = useState<{
    id: string;
    status: JobStatus | "starting";
    position: number | null;
    startsIn: number | null;
  }>({ id: "", status: "starting", position: null, startsIn: null });
  const [progress, setProgress] = useState<Record<string, ChainProgress>>({});
  const [notice, setNotice] = useState<{ text: string; stopJob?: string } | null>(null);
  /** Where the scan runs: CRYPY's servers (default, private) or this browser (public nodes, always free). */
  const [mode, setMode] = useState<"server" | "browser">("server");
  const [runMode, setRunMode] = useState<"server" | "browser">("server");
  const browserRun = useRef<{ controller: AbortController; paused: boolean } | null>(null);
  const [scan, setScan] = useState<{
    assets: ScanAsset[];
    entries: Entry[];
    chains: string[];
    at: Date;
    cancelled: boolean;
    rateLimited: boolean;
    lost: boolean;
  } | null>(null);
  const seq = useRef(0);
  const index = useRef(new Map<string, number>());
  /** Bumped to stop following a scan (new scan, editing the list, leaving the page). */
  const following = useRef(0);
  useEffect(() => () => void (following.current += 1), []);

  const maxAddresses = mode === "browser" ? BROWSER_MAX_ADDRESSES : MAX_ADDRESSES;
  const parsed = useMemo(() => parseList(text, maxAddresses), [text, maxAddresses]);
  const activeChains = chains.filter((c) => selected.includes(c.key));
  const assets = useMemo(() => [nativeAsset(activeChains), ...tokens], [activeChains, tokens]);
  const balances = activeChains.reduce(
    (sum, c) => sum + parsed.entries.length * assets.filter((a) => a.key === "native" || a.chains[c.key]).length,
    0,
  );
  const canScan = parsed.entries.length > 0 && activeChains.length > 0 && phase !== "scanning";
  const seconds = estimateSeconds(balances);
  const number = new Intl.NumberFormat(locale);

  /** Fresh rows (all "pending") for a scan, and the lookup from chain + address to a row. */
  const prepare = useCallback((entries: Entry[], chainKeys: string[], scanAssets: ScanAsset[]) => {
    const initial: ScanRow[] = entries.flatMap((entry) =>
      chainKeys.map((chain) => ({
        entry,
        chain,
        status: "pending" as const,
        type: null,
        balances: Object.fromEntries(
          scanAssets.filter((a) => a.chains[chain]).map((a) => [a.key, null] as [string, null]),
        ),
        block: null,
      })),
    );
    index.current = new Map(initial.map((row, i) => [`${row.chain}|${row.entry.address.toLowerCase()}`, i]));
    seq.current = 0;
    setRows(initial);
    setPrices({});
    setProgress({});
  }, []);

  /** Puts read rows into the table; `order` gives the token addresses in the order the row's balances use. */
  function merge(updates: JobView["rows"], order: (chain: string) => string[], scanAssets: ScanAsset[]) {
    if (updates.length === 0) return;
    setRows((current) => {
      const next = current.slice();
      for (const { chain, block, row } of updates) {
        const i = index.current.get(`${chain}|${row.address.toLowerCase()}`);
        if (i === undefined) continue;
        const target = next[i]!;
        const tokensOrder = order(chain);
        const balances: ScanRow["balances"] = { ...target.balances, native: row.native };
        for (const asset of scanAssets) {
          const deployment = asset.chains[chain];
          if (asset.key === "native" || !deployment) continue;
          const at = tokensOrder.indexOf(deployment.address.toLowerCase());
          balances[asset.key] = at === -1 ? undefined : (row.tokens[at] ?? null);
        }
        next[i] = { ...target, status: "ok", type: row.type, balances, block };
      }
      return next;
    });
  }

  /** Applies one progress answer from the server to the rows, prices and chain states. */
  const apply = useCallback((view: JobView, scanAssets: ScanAsset[]) => {
    seq.current = view.seq;
    setJob((j) => ({ ...j, status: view.status, position: view.position, startsIn: view.startsIn }));
    setProgress(view.chains);
    setPrices((current) => {
      const next = { ...current };
      for (const [chain, state] of Object.entries(view.chains)) if (state.prices) next[chain] = state.prices;
      return next;
    });
    merge(view.rows, (chain) => view.chains[chain]?.tokens ?? [], scanAssets);
  }, []);

  /** Follows a scan on the server until it ends (about once a second). */
  const follow = useCallback(
    async (id: string, entries: Entry[], chainKeys: string[], scanAssets: ScanAsset[], at: Date) => {
      const run = (following.current += 1);
      let misses = 0;
      for (;;) {
        if (following.current !== run) return;
        let view: JobView | null = null;
        try {
          const response = await fetch(`/api/v1/batch-scans/${id}?since=${seq.current}`);
          if (response.status === 404) {
            writeSaved(null);
            setScan({
              assets: scanAssets,
              entries,
              chains: chainKeys,
              at,
              cancelled: false,
              rateLimited: false,
              lost: true,
            });
            setPhase("done");
            return;
          }
          const json = (await response.json()) as { ok: boolean; data?: JobView };
          if (json.ok && json.data) view = json.data;
        } catch {
          // Offline for a moment: keep asking. The scan carries on on the server.
        }
        if (following.current !== run) return;
        if (view) {
          misses = 0;
          apply(view, scanAssets);
          if (view.status === "done" || view.status === "cancelled") {
            setScan({
              assets: scanAssets,
              entries,
              chains: chainKeys,
              at,
              cancelled: view.status === "cancelled",
              rateLimited: false,
              lost: false,
            });
            setPhase("done");
            return;
          }
        } else misses += 1;
        await sleep(Math.min(10_000, POLL_MS * (1 + misses)));
      }
    },
    [apply],
  );

  // After a refresh: find this tab's scan again (sessionStorage is outside React, so read it after the first render).
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = readSaved();
      if (!saved) return;
      const restored = parseList(saved.text);
      setText(saved.text);
      setSelected(saved.selected);
      setTokens(saved.tokens);
      const chainKeys = chains.filter((c) => saved.selected.includes(c.key)).map((c) => c.key);
      const scanAssets = [nativeAsset(chains.filter((c) => saved.selected.includes(c.key))), ...saved.tokens];
      prepare(restored.entries, chainKeys, scanAssets);
      setJob({ id: saved.jobId, status: "starting", position: null, startsIn: null });
      setPhase("scanning");
      void follow(saved.jobId, restored.entries, chainKeys, scanAssets, new Date(saved.at));
    }, 0);
    return () => clearTimeout(timer);
    // Only after the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startScan() {
    if (!canScan && phase !== "done") return;
    setNotice(null);
    if (mode === "browser") return startBrowserScan();
    setRunMode("server");
    const scanAssets = assets;
    const entries = parsed.entries;
    const chainKeys = activeChains.map((c) => c.key);
    const body = {
      chains: chainKeys,
      addresses: entries.map((e) => e.address),
      tokens: Object.fromEntries(
        chainKeys.map((chain) => [
          chain,
          scanAssets.filter((a) => a.key !== "native" && a.chains[chain]).map((a) => a.chains[chain]!.address),
        ]),
      ),
    };
    let result: CreateResult | null = null;
    try {
      const response = await fetch("/api/v1/batch-scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { ok: boolean; data?: CreateResult; error?: { code: string } };
      if (json.ok && json.data) result = json.data;
      else if (json.error?.code === "RATE_LIMITED") return setNotice({ text: s.error.rateLimited });
    } catch {
      // Shown below.
    }
    if (!result) return setNotice({ text: s.refused.failed });
    if (result.refused === "busy") return setNotice({ text: s.refused.busy });
    if (result.refused === "too-many") return setNotice({ text: fill(s.refused.tooMany, { max: result.maxWallets }) });
    if (result.refused === "daily-limit") {
      return setNotice({
        text: fill(s.refused.daily, { limit: new Intl.NumberFormat(locale).format(result.dailyWallets) }),
      });
    }
    if (result.refused === "active") return setNotice({ text: s.refused.active, stopJob: result.jobId });
    const at = new Date();
    writeSaved({ jobId: result.jobId, text, selected, tokens, at: at.toISOString() });
    prepare(entries, chainKeys, scanAssets);
    setJob({ id: result.jobId, status: "starting", position: null, startsIn: null });
    setScan(null);
    setPhase("scanning");
    void follow(result.jobId, entries, chainKeys, scanAssets, at);
  }

  /** "Scan in my browser": the same engine against the chains' public nodes, straight from this page. */
  async function startBrowserScan() {
    const scanAssets = assets;
    const entries = parsed.entries;
    const scanChains = activeChains;
    const chainKeys = scanChains.map((c) => c.key);
    const tokensOf = Object.fromEntries(
      chainKeys.map((chain) => [
        chain,
        scanAssets
          .filter((a) => a.key !== "native" && a.chains[chain])
          .map((a) => a.chains[chain]!.address.toLowerCase()),
      ]),
    );
    following.current += 1;
    writeSaved(null);
    browserRun.current?.controller.abort();
    const run = { controller: new AbortController(), paused: false };
    browserRun.current = run;
    const at = new Date();
    prepare(entries, chainKeys, scanAssets);
    setRunMode("browser");
    setJob({ id: "", status: "running", position: null, startsIn: null });
    setScan(null);
    setPhase("scanning");
    // Prices: only the token contracts go to CRYPY, never the wallet list.
    for (const chain of chainKeys) {
      void fetch(`/api/v1/batch-prices?chain=${chain}&tokens=${tokensOf[chain]!.join(",")}`)
        .then((r) => r.json() as Promise<{ ok: boolean; data?: { prices: Record<string, number> } }>)
        .then((json) => {
          if (json.ok && json.data) setPrices((p) => ({ ...p, [chain]: json.data!.prices }));
        })
        .catch(() => {});
    }
    // Rows arrive many times a second on big lists: put them into the table at most every 0.75 s, so the page (and
    // the scan's own timers on this same thread) stay responsive with tens of thousands of rows.
    let buffer: JobView["rows"] = [];
    const flush = () => {
      if (buffer.length === 0) return;
      const updates = buffer;
      buffer = [];
      merge(updates, (c) => tokensOf[c] ?? [], scanAssets);
    };
    const flusher = setInterval(flush, 750);
    const { runBrowserScan } = await import("./browser-scan");
    const finalStates = await runBrowserScan({
      chains: scanChains.map((c) => ({ key: c.key, urls: c.publicRpcUrls ?? [], tokens: tokensOf[c.key]! })),
      addresses: entries.map((e) => e.address),
      signal: run.controller.signal,
      isPaused: () => run.paused,
      onRows: (chain, list, block) => {
        for (const row of list) buffer.push({ chain, block, row });
      },
      onState: (chain, state) =>
        setProgress((p) => ({ ...p, [chain]: { ...state, tokens: tokensOf[chain]!, notOnChain: [], prices: null } })),
    });
    clearInterval(flusher);
    flush();
    if (browserRun.current !== run) return;
    const cancelled = Object.values(finalStates).some((st) => st.phase === "cancelled");
    setJob((j) => ({ ...j, status: cancelled ? "cancelled" : "done" }));
    setScan({ assets: scanAssets, entries, chains: chainKeys, at, cancelled, rateLimited: false, lost: false });
    setPhase("done");
  }

  /** Browser mode: rows the public nodes couldn't read are finished by a scan on CRYPY's servers. */
  async function finishOnServer(list: ScanRow[]) {
    if (!scan) return;
    const current = scan;
    const chainKeys = [...new Set(list.map((r) => r.chain))];
    const addresses = [...new Set(list.map((r) => r.entry.address))];
    const body = {
      chains: chainKeys,
      addresses,
      tokens: Object.fromEntries(
        chainKeys.map((chain) => [
          chain,
          current.assets.filter((a) => a.key !== "native" && a.chains[chain]).map((a) => a.chains[chain]!.address),
        ]),
      ),
    };
    let result: CreateResult | null = null;
    try {
      const response = await fetch("/api/v1/batch-scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { ok: boolean; data?: CreateResult };
      if (json.ok && json.data) result = json.data;
    } catch {
      // Shown below.
    }
    if (!result || result.refused) {
      setNotice({
        text:
          result?.refused === "busy"
            ? s.refused.busy
            : result?.refused === "daily-limit"
              ? fill(s.refused.daily, { limit: new Intl.NumberFormat(locale).format(result.dailyWallets) })
              : result?.refused === "too-many"
                ? fill(s.refused.tooMany, { max: result.maxWallets })
                : result?.refused === "active"
                  ? s.refused.active
                  : s.refused.failed,
        stopJob: result?.refused === "active" ? result.jobId : undefined,
      });
      return;
    }
    setNotice(null);
    seq.current = 0;
    setRunMode("server");
    setJob({ id: result.jobId, status: "starting", position: null, startsIn: null });
    setPhase("scanning");
    void follow(result.jobId, current.entries, current.chains, current.assets, current.at);
  }

  async function control(action: "pause" | "resume" | "cancel", id = job.id) {
    if (runMode === "browser" && browserRun.current && id === job.id) {
      if (action === "cancel") browserRun.current.controller.abort();
      else {
        browserRun.current.paused = action === "pause";
        setJob((j) => ({ ...j, status: action === "pause" ? "paused" : "running" }));
      }
      return;
    }
    try {
      await fetch(`/api/v1/batch-scans/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      // The next progress answer shows the real state.
    }
    if (action === "cancel" && id !== job.id) setNotice(null);
  }

  /** One row again (old single-batch API), for rows still unread after the scan. */
  async function retryRows(list: ScanRow[]) {
    if (!scan) return;
    const byChain = new Map<string, ScanRow[]>();
    for (const row of list) byChain.set(row.chain, [...(byChain.get(row.chain) ?? []), row]);
    for (const [chain, chainRows] of byChain) {
      for (let i = 0; i < chainRows.length; i += 100) {
        const part = chainRows.slice(i, i + 100);
        const tokenAssets = scan.assets.filter((a) => a.key !== "native" && a.chains[chain]);
        try {
          const response = await fetch("/api/v1/batch-balances", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chain,
              addresses: part.map((r) => r.entry.address),
              tokens: tokenAssets.map((a) => a.chains[chain]!.address),
            }),
          });
          const json = (await response.json()) as BatchResponse;
          if (!json.ok || !json.data) continue;
          const data = json.data;
          setRows((current) =>
            current.map((row) => {
              if (row.chain !== chain) return row;
              const read = data.rows.find((r) => r.address.toLowerCase() === row.entry.address.toLowerCase());
              if (!read) return row;
              const balances: ScanRow["balances"] = { ...row.balances, native: read.native };
              tokenAssets.forEach((asset, t) => (balances[asset.key] = read.tokens[t] ?? null));
              return { ...row, status: "ok", type: read.type, balances, block: data.block };
            }),
          );
        } catch {
          // Stays "still being read".
        }
      }
    }
  }

  const scanChains = scan ? chains.filter((c) => scan.chains.includes(c.key)) : activeChains;
  const assetCount = Object.fromEntries(
    scanChains.map((c) => [
      c.key,
      (scan?.assets ?? assets).filter((a) => a.key === "native" || a.chains[c.key]).length,
    ]),
  );

  if ((phase === "done" && scan) || phase === "scanning") {
    const shownAssets = scan?.assets ?? assets;
    return (
      <div className="flex flex-col gap-4">
        {phase === "scanning" && (
          <ScanProgress
            s={s}
            locale={locale}
            chains={scanChains}
            wallets={parsed.entries.length}
            assets={assetCount}
            status={job.status}
            position={job.position}
            startsIn={job.startsIn}
            progress={progress}
            onPause={() => void control("pause")}
            onResume={() => void control("resume")}
            onCancel={() => void control("cancel")}
            where={runMode === "browser" ? s.run.whereBrowser : s.run.where}
          />
        )}
        {notice && (
          <p role="alert" className="rounded-xl border border-high/40 bg-high/8 px-4 py-3 text-sm">
            {notice.text}
          </p>
        )}
        <ResultsView
          s={s}
          locale={locale}
          chains={chains}
          rows={rows}
          assets={shownAssets}
          prices={prices}
          entries={scan?.entries ?? parsed.entries}
          scannedAt={scan?.at ?? new Date()}
          cancelled={scan?.cancelled ?? false}
          rateLimited={false}
          lost={scan?.lost ?? false}
          running={phase === "scanning"}
          progress={progress}
          addressPathPrefix={addressPathPrefix}
          onEdit={() => {
            following.current += 1;
            browserRun.current?.controller.abort();
            writeSaved(null);
            setPhase("input");
          }}
          onScanAgain={() => void startScan()}
          onRetry={(row) => void retryRows([row])}
          onRetryAll={(list) => void (runMode === "browser" ? finishOnServer(list) : retryRows(list))}
          retryLabel={runMode === "browser" ? s.mode.finishOnServer : undefined}
          doneNote={runMode === "browser" ? s.mode.scannedInBrowser : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Step n={1} title={s.steps.addresses} hint={s.addressesHint}>
          <AddressEditor s={s} text={text} onText={setText} parsed={parsed} max={maxAddresses} />
        </Step>
        <div className="flex flex-col gap-4">
          <Step n={2} title={s.steps.chains} hint={s.chainsHint}>
            <div className="grid grid-cols-2 gap-3">
              {chains.map((chain) => {
                const on = selected.includes(chain.key);
                return (
                  <button
                    key={chain.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSelected((list) => (on ? list.filter((k) => k !== chain.key) : [...list, chain.key]))
                    }
                    className={cn(
                      "flex h-12 items-center gap-2.5 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
                      on ? "border-primary bg-primary/8" : "hover:border-primary/60",
                    )}
                  >
                    <ChainIcon chain={chain.key} size={22} />
                    {chain.name}
                    {on && <Check className="ms-auto size-4 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{s.chainsMore}</p>
          </Step>
          <Step n={3} title={s.steps.assets} hint={s.assetsHint}>
            <AssetPicker
              s={s}
              chains={chains}
              selected={activeChains}
              tokens={tokens}
              setTokens={setTokens}
              knownAssets={knownAssets}
            />
          </Step>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-semibold">{s.mode.title}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {(["server", "browser"] as const).map((value) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-2xl border bg-card p-4 transition-colors focus-within:ring-3 focus-within:ring-ring/25",
                mode === value ? "border-primary bg-primary/8" : "hover:border-primary/60",
              )}
            >
              <input
                type="radio"
                name="scan-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col gap-1 text-sm">
                <span className="text-base font-semibold">
                  {value === "server" ? s.mode.server : s.mode.browser}{" "}
                  <span
                    className={cn(
                      "ms-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      value === "server" ? "bg-primary/15 text-primary" : "bg-low/15 text-low",
                    )}
                  >
                    {value === "server" ? s.mode.serverBadge : s.mode.browserBadge}
                  </span>
                </span>
                <span>
                  {value === "server"
                    ? s.mode.serverNote
                    : fill(s.mode.browserNote, { max: number.format(BROWSER_MAX_ADDRESSES) })}
                </span>
                <span className="text-muted-foreground">
                  {value === "server"
                    ? fill(s.mode.serverLimit, { max: number.format(MAX_ADDRESSES) })
                    : s.mode.browserKeepOpen}
                </span>
              </span>
            </label>
          ))}
        </div>
        {mode === "browser" && (
          <div role="note" className="flex gap-3 rounded-xl border border-high/40 bg-high/8 px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-high" aria-hidden="true" />
            <div>
              <p className="font-semibold">{s.mode.warningTitle}</p>
              <p className="mt-0.5 text-muted-foreground">{s.mode.warning}</p>
            </div>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          {canScan ? (
            <>
              <p className="font-semibold">
                {fill(s.ready, {
                  addresses: parsed.entries.length,
                  chains: activeChains.length,
                  assets: assets.length,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {fill(s.estimateTime, {
                  balances: new Intl.NumberFormat(locale).format(balances),
                  time:
                    seconds < 60
                      ? s.estimateUnderMinute
                      : fill(s.estimateMinutes, { minutes: Math.ceil(seconds / 60) }),
                })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{s.readyNone}</p>
          )}
        </div>
        <button
          type="button"
          disabled={!canScan}
          onClick={() => void startScan()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search className="size-4" aria-hidden="true" />
          {s.scan}
        </button>
      </div>

      {notice && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-high/40 bg-high/8 px-4 py-3 text-sm sm:flex-row sm:items-center"
        >
          <p className="flex-1">{notice.text}</p>
          {notice.stopJob && (
            <button
              type="button"
              onClick={() => void control("cancel", notice.stopJob)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 hover:border-primary"
            >
              <X className="size-4" aria-hidden="true" />
              {s.refused.stopOther}
            </button>
          )}
        </div>
      )}

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <Lock className="size-4 text-low" aria-hidden="true" />
          {s.trust.public}
        </li>
        <li className="flex items-center gap-2">
          <Check className="size-4 text-low" aria-hidden="true" />
          {s.trust.notStored}
        </li>
        <li className="flex items-center gap-2">
          <Check className="size-4 text-low" aria-hidden="true" />
          {s.trust.noWallet}
        </li>
      </ul>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label={title}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {n}
        </span>
        <h2 className="font-sans text-base font-semibold">{title}</h2>
        <span className="ms-auto text-xs text-muted-foreground">{hint}</span>
      </div>
      {children}
    </section>
  );
}

interface TokenInfoResponse {
  ok: boolean;
  data?: { token: { name: string; symbol: string; decimals: number } | null };
}

function AssetPicker({
  s,
  chains,
  selected,
  tokens,
  setTokens,
  knownAssets,
}: {
  s: BatchStrings;
  chains: BatchChain[];
  selected: BatchChain[];
  tokens: ScanAsset[];
  setTokens: (fn: (list: ScanAsset[]) => ScanAsset[]) => void;
  knownAssets: BatchAssetDef[];
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const full = tokens.length >= MAX_TOKENS;
  const suggestions = knownAssets.filter(
    (def) => !tokens.some((t) => t.key === def.key) && selected.some((c) => def.chains[c.key]),
  );
  const chainName = (key: string) => chains.find((c) => c.key === key)?.name ?? key;

  const add = (asset: ScanAsset) => {
    setError("");
    if (full) return setError(s.tokenLimit);
    const addresses = new Set(tokens.flatMap((t) => Object.values(t.chains).map((d) => d?.address.toLowerCase())));
    if (Object.values(asset.chains).some((d) => d && addresses.has(d.address.toLowerCase()))) {
      return setError(s.alreadyAdded);
    }
    setTokens((list) => [...list, asset]);
  };

  const addContract = async () => {
    const value = input.trim();
    setError("");
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return setError(s.notToken);
    if (full) return setError(s.tokenLimit);
    setBusy(true);
    try {
      const found = await Promise.all(
        chains.map(async (chain) => {
          const response = await fetch(`/api/v1/token-info?chain=${chain.key}&address=${value.toLowerCase()}`);
          const json = (await response.json()) as TokenInfoResponse;
          if (!json.ok) throw new Error("lookup");
          return [chain.key, json.data?.token ?? null] as const;
        }),
      );
      const on = found.filter(([, token]) => token);
      if (on.length === 0) return setError(s.notToken);
      const first = on[0]![1]!;
      add({
        key: value.toLowerCase(),
        symbol: first.symbol || value.slice(0, 8),
        name: first.name,
        chains: Object.fromEntries(on.map(([key, token]) => [key, { address: value, decimals: token!.decimals }])),
      });
      setInput("");
    } catch {
      setError(s.lookupFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
        <span className="flex -space-x-1.5">
          {selected.map((c) => (
            <ChainIcon key={c.key} chain={c.key} size={20} className="ring-2 ring-card" />
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {s.nativeCoin}{" "}
            <span className="font-normal text-muted-foreground">{selected.map((c) => c.nativeSymbol).join(" · ")}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{selected.map((c) => c.name).join(" · ")}</p>
        </div>
        <span className="text-xs text-muted-foreground">{s.alwaysIncluded}</span>
      </div>
      {tokens.map((token) => (
        <div key={token.key} className="flex items-start gap-3 rounded-xl border px-3 py-2.5">
          <Layers className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <bdi className="font-semibold">{token.symbol}</bdi>{" "}
              <bdi className="text-muted-foreground">{token.name}</bdi>
            </p>
            <p className="text-xs text-muted-foreground">
              {chains
                .filter((c) => selected.some((x) => x.key === c.key))
                .map((c) => {
                  const d = token.chains[c.key];
                  return d
                    ? `${c.name} ${d.address.slice(0, 6)}…${d.address.slice(-4)} · ${fill(s.decimals, { decimals: d.decimals })}`
                    : fill(s.notOnChain, { chain: c.name });
                })
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTokens((list) => list.filter((t) => t.key !== token.key))}
            aria-label={fill(s.remove, { symbol: token.symbol })}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {!full && (
        <div className="rounded-xl border border-dashed px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addContract();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={s.addPlaceholder}
              aria-label={s.addPlaceholder}
              spellCheck={false}
              dir="ltr"
              className="technical min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-sm hover:border-primary disabled:opacity-50"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {s.add}
            </button>
          </form>
          {suggestions.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {s.pick}
              {suggestions.slice(0, 10).map((def) => (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => add(fromDef(def))}
                  title={def.name}
                  className="rounded-full border px-2 py-0.5 text-foreground hover:border-primary"
                >
                  {def.symbol}
                  {selected.length > 1 && !selected.every((c) => def.chains[c.key]) && (
                    <span className="ms-1 text-muted-foreground">
                      ({fill(s.onlyOn, { chain: chainName(Object.keys(def.chains)[0]!) })})
                    </span>
                  )}
                </button>
              ))}
            </p>
          )}
        </div>
      )}
      {busy && <p className="text-xs text-muted-foreground">{s.checking}</p>}
      {error && (
        <p role="alert" className="text-xs text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
