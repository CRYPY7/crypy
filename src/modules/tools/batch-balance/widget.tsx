"use client";

import { Check, Layers, Lock, Plus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ChainIcon } from "@/components/chain-icon";
import type { BatchAssetDef } from "@/config/batch-assets";
import { cn } from "@/lib/utils";
import { fill } from "@/modules/tools/shared/ui";
import type enMessages from "../../../../messages/en.json";
import { AddressEditor } from "./editor";
import { type Entry, parseList } from "./parse";
import type { ScanAsset, ScanPrices, ScanRow } from "./results";
import { ResultsView } from "./results-view";

export type BatchStrings = (typeof enMessages)["utilities"]["batch-balance"];

export interface BatchChain {
  key: string;
  name: string;
  nativeSymbol: string;
}

const MAX_TOKENS = 5;
const BATCH = 100;

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

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

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
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [scan, setScan] = useState<{
    assets: ScanAsset[];
    entries: Entry[];
    chains: string[];
    at: Date;
    cancelled: boolean;
    rateLimited: boolean;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const blocks = useRef<Record<string, string>>({});

  const parsed = useMemo(() => parseList(text), [text]);
  const activeChains = chains.filter((c) => selected.includes(c.key));
  const assets = useMemo(() => [nativeAsset(activeChains), ...tokens], [activeChains, tokens]);
  const requests = activeChains.length * Math.ceil(parsed.entries.length / BATCH) * 2;
  const canScan = parsed.entries.length > 0 && activeChains.length > 0 && phase !== "scanning";

  async function request(
    chain: string,
    entries: Entry[],
    scanAssets: ScanAsset[],
    first: boolean,
    signal: AbortSignal,
  ) {
    const tokenAssets = scanAssets.filter((a) => a.key !== "native" && a.chains[chain]);
    const body = JSON.stringify({
      chain,
      addresses: entries.map((e) => e.address),
      tokens: tokenAssets.map((a) => a.chains[chain]!.address),
      ...(blocks.current[chain] ? { block: blocks.current[chain] } : {}),
      ...(first ? { prices: true } : {}),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch("/api/v1/batch-balances", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal,
        });
        const json = (await response.json()) as BatchResponse;
        if (json.ok && json.data) return { ok: true as const, data: json.data, tokenAssets };
        if (response.status === 429) {
          const wait = Number(response.headers.get("retry-after") ?? "5");
          if (attempt === 0 && wait <= 10) {
            await sleep(wait * 1000, signal);
            continue;
          }
          return { ok: false as const, rateLimited: true };
        }
        if (response.status === 400) return { ok: false as const, rateLimited: false };
      } catch {
        if (signal.aborted) return { ok: false as const, rateLimited: false };
      }
      if (attempt === 0) await sleep(1500, signal);
    }
    return { ok: false as const, rateLimited: false };
  }

  function apply(
    chain: string,
    entries: Entry[],
    result: Awaited<ReturnType<typeof request>>,
    update: (fn: (rows: ScanRow[]) => ScanRow[]) => void,
  ) {
    const keys = new Set(entries.map((e) => `${e.address.toLowerCase()}|${chain}`));
    update((current) =>
      current.map((row) => {
        if (!keys.has(`${row.entry.address.toLowerCase()}|${row.chain}`)) return row;
        if (!result.ok) return { ...row, status: "failed" };
        const read = result.data.rows.find((r) => r.address.toLowerCase() === row.entry.address.toLowerCase());
        if (!read) return { ...row, status: "failed" };
        const balances: ScanRow["balances"] = { ...row.balances, native: read.native };
        result.tokenAssets.forEach((asset, i) => (balances[asset.key] = read.tokens[i] ?? null));
        return { ...row, status: "ok", type: read.type, balances, block: result.data.block };
      }),
    );
  }

  async function startScan() {
    if (!canScan) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    blocks.current = {};
    const scanAssets = assets;
    const entries = parsed.entries;
    const chainKeys = activeChains.map((c) => c.key);
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
    setRows(initial);
    setPrices({});
    setPhase("scanning");
    let rateLimited = false;
    const chunks: Entry[][] = [];
    for (let i = 0; i < entries.length; i += BATCH) chunks.push(entries.slice(i, i + BATCH));
    setProgress({ done: 0, total: chunks.length * chainKeys.length });

    // Chains run side by side; batches of one chain run in order, all at that chain's first block.
    await Promise.all(
      chainKeys.map(async (chain) => {
        for (const [index, chunk] of chunks.entries()) {
          if (controller.signal.aborted) return;
          const result = await request(chain, chunk, scanAssets, index === 0, controller.signal);
          if (controller.signal.aborted) return;
          if (result.ok) {
            blocks.current[chain] ??= result.data.block;
            if (result.data.prices) setPrices((p) => ({ ...p, [chain]: result.data.prices! }));
          } else if (result.rateLimited) rateLimited = true;
          apply(chain, chunk, result, setRows);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }),
    );
    const cancelled = controller.signal.aborted;
    // Anything not read (cancelled) is shown as failed, with a retry button.
    setRows((current) => current.map((row) => (row.status === "pending" ? { ...row, status: "failed" } : row)));
    setScan({ assets: scanAssets, entries, chains: chainKeys, at: new Date(), cancelled, rateLimited });
    setPhase("done");
  }

  async function retryRow(row: ScanRow) {
    if (!scan) return;
    const controller = new AbortController();
    const result = await request(row.chain, [row.entry], scan.assets, !prices[row.chain], controller.signal);
    if (result.ok && result.data.prices) setPrices((p) => ({ ...p, [row.chain]: result.data.prices! }));
    apply(row.chain, [row.entry], result, setRows);
  }

  if (phase === "done" && scan) {
    return (
      <ResultsView
        s={s}
        locale={locale}
        chains={chains}
        rows={rows}
        assets={scan.assets}
        prices={prices}
        entries={scan.entries}
        scannedAt={scan.at}
        cancelled={scan.cancelled}
        rateLimited={scan.rateLimited}
        addressPathPrefix={addressPathPrefix}
        onEdit={() => setPhase("input")}
        onScanAgain={() => void startScan()}
        onRetry={(row) => void retryRow(row)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Step n={1} title={s.steps.addresses} hint={s.addressesHint}>
          <AddressEditor s={s} text={text} onText={setText} parsed={parsed} />
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

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          {phase === "scanning" ? (
            <>
              <p className="font-semibold" role="status">
                {fill(s.scanning, progress)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : canScan ? (
            <>
              <p className="font-semibold">
                {fill(s.ready, {
                  addresses: parsed.entries.length,
                  chains: activeChains.length,
                  assets: assets.length,
                })}
              </p>
              <p className="text-sm text-muted-foreground">{fill(s.estimate, { requests })}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{s.readyNone}</p>
          )}
        </div>
        {phase === "scanning" ? (
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 font-semibold hover:border-primary"
          >
            <X className="size-4" aria-hidden="true" />
            {s.cancel}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canScan}
            onClick={() => void startScan()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="size-4" aria-hidden="true" />
            {s.scan}
          </button>
        )}
      </div>

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
