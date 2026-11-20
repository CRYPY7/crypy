"use client";

import {
  ArrowUpDown,
  Check,
  CircleCheck,
  Copy,
  Download,
  FilePen,
  RotateCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ChainIcon } from "@/components/chain-icon";
import { formatAmount } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { fill } from "@/modules/tools/shared/ui";
import type { Entry } from "./parse";
import {
  type AccountType,
  type ScanAsset,
  type ScanPrices,
  type ScanRow,
  type SortKey,
  cellUsd,
  isEmptyRow,
  rowUsd,
  summarize,
  toCsv,
  viewRows,
} from "./results";
import type { BatchChain, BatchStrings } from "./widget";

const PAGE = 50;

function usd(value: number, locale: string) {
  return value > 0 && value < 0.01 ? `< ${formatUsd(0.01, locale)}` : formatUsd(value, locale);
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function CopyLink({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="inline-flex text-muted-foreground hover:text-foreground"
    >
      {done ? (
        <Check className="size-3.5 text-low" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

export function ResultsView({
  s,
  locale,
  chains,
  rows,
  assets,
  prices,
  entries,
  scannedAt,
  cancelled,
  rateLimited,
  addressPathPrefix,
  onEdit,
  onScanAgain,
  onRetry,
}: {
  s: BatchStrings;
  locale: string;
  chains: BatchChain[];
  rows: ScanRow[];
  assets: ScanAsset[];
  prices: ScanPrices;
  entries: Entry[];
  scannedAt: Date;
  cancelled: boolean;
  rateLimited: boolean;
  addressPathPrefix: string;
  onEdit: () => void;
  onScanAgain: () => void;
  onRetry: (row: ScanRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [chain, setChain] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [sort, setSort] = useState<SortKey>("value");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState("");

  const chainOf = (key: string) => chains.find((c) => c.key === key);
  const summary = useMemo(
    () => summarize(rows, assets, prices, entries.length),
    [rows, assets, prices, entries.length],
  );
  const shown = useMemo(
    () => viewRows(rows, assets, prices, { search, chain, hideEmpty, sort, descending }),
    [rows, assets, prices, search, chain, hideEmpty, sort, descending],
  );
  const hidden = hideEmpty
    ? viewRows(rows, assets, prices, { search, chain, hideEmpty: false, sort, descending }).length - shown.length
    : 0;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * PAGE, current * PAGE + PAGE);
  const usedChains = [...new Set(rows.map((r) => r.chain))];

  const amount = (row: ScanRow, asset: ScanAsset) => {
    const raw = row.balances[asset.key];
    const deployment = asset.chains[row.chain];
    if (raw === undefined || !deployment) return null;
    if (raw === null) return "?";
    return formatAmount(raw, deployment.decimals, locale, 4);
  };
  const typeName = (type: AccountType | null) => s.types[type ?? "unknown"];
  const setSortKey = (key: SortKey) => {
    if (sort === key) setDescending(!descending);
    else {
      setSort(key);
      setDescending(key !== "label" && key !== "chain" && key !== "index");
    }
    setPage(0);
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };
  const withBalance = [...new Set(rows.filter((r) => r.status === "ok" && !isEmptyRow(r)).map((r) => r.entry.address))];
  const emptyAddresses = entries
    .map((e) => e.address)
    .filter((a) => {
      const mine = rows.filter((r) => r.entry.address === a);
      return mine.length > 0 && mine.every((r) => r.status === "ok" && isEmptyRow(r));
    });
  const tableText = () =>
    [
      [
        s.table.label,
        s.table.address,
        s.table.chain,
        s.table.type,
        ...assets.map((a) => (a.key === "native" ? s.table.native : a.symbol)),
        s.table.value,
      ].join("\t"),
      ...shown.map((row) =>
        [
          row.entry.label,
          row.entry.address,
          chainOf(row.chain)?.name ?? row.chain,
          typeName(row.type),
          ...assets.map((a) => amount(row, a) ?? ""),
          row.status === "ok" ? usd(rowUsd(row, assets, prices), locale) : s.status[row.status],
        ].join("\t"),
      ),
    ].join("\n");
  const exportCsv = () => {
    const csv = toCsv(
      shown,
      assets.map((a) => (a.key === "native" ? { ...a, symbol: s.table.native } : a)),
      prices,
      s.csv,
      (key) => chainOf(key)?.name ?? key,
      typeName,
      (status) => s.status[status],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `crypy-balances-${scannedAt.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(scannedAt);
  const blocksText = Object.entries(summary.blocks)
    .map(([key, block]) =>
      fill(s.blockOn, { block: new Intl.NumberFormat(locale).format(BigInt(block)), chain: chainOf(key)?.name ?? key }),
    )
    .join(", ");
  const button =
    "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none";
  const nativeLabel = (key: string) => chainOf(key)?.nativeSymbol ?? "";

  const sortHeader = (k: SortKey, label: string, end = true) => (
    <th
      key={k}
      scope="col"
      aria-sort={sort === k ? (descending ? "descending" : "ascending") : "none"}
      className={cn("px-3 py-2.5 font-medium", end ? "text-end" : "text-start")}
    >
      <button
        type="button"
        onClick={() => setSortKey(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={fill(s.table.sortBy, { column: label })}
      >
        {label}
        <ArrowUpDown className={cn("size-3", sort === k ? "text-primary" : "opacity-50")} aria-hidden="true" />
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-0">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 sm:flex-row sm:items-center">
        <p className="flex min-w-0 flex-1 items-start gap-2 text-sm" role="status">
          {cancelled ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-high" aria-hidden="true" />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-low" aria-hidden="true" />
          )}
          <span>
            <span className="font-semibold">{cancelled ? s.cancelled : s.complete}</span>
            <span className="text-muted-foreground">
              {" · "}
              {fill(s.completeLine, {
                addresses: summary.addresses,
                checks: summary.checks,
                blocks: blocksText || "—",
                time,
              })}
            </span>
          </span>
        </p>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={onEdit}>
            <FilePen className="size-4" aria-hidden="true" />
            {s.editList}
          </button>
          <button type="button" className={button} onClick={onScanAgain}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {s.scanAgain}
          </button>
        </div>
      </div>

      {(rateLimited || summary.failed > 0) && (
        <p role="alert" className="rounded-xl border border-high/40 bg-high/8 px-4 py-2.5 text-sm">
          {rateLimited ? s.error.rateLimited : s.error.failed}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          label={s.cards.total}
          value={usd(summary.totalUsd, locale)}
          note={s.cards.totalNote}
          className="col-span-2 lg:col-span-1"
        />
        <Card
          label={s.cards.withBalance}
          value={fill(s.cards.withBalanceValue, { count: summary.withBalance, total: summary.addresses })}
          note={s.cards.withBalanceNote}
        />
        <Card
          label={s.cards.empty}
          value={String(summary.empty)}
          note={s.cards.emptyNote}
          tone={summary.empty > 0 ? "high" : undefined}
        />
        <Card
          label={s.cards.failed}
          value={summary.failed > 0 ? String(summary.failed) : s.cards.failedNone}
          note={summary.failed > 0 ? s.cards.failedNote : ""}
          tone={summary.failed > 0 ? "critical" : undefined}
          className="hidden lg:block"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.assetTotals.flatMap((total) =>
          total.perChain.map((part) => (
            <div
              key={`${total.asset.key}-${part.chain}`}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
            >
              <ChainIcon chain={part.chain} size={26} />
              <div className="min-w-0">
                <p className="truncate font-semibold tabular-nums">
                  {formatAmount(part.raw, part.decimals, locale, 4)}{" "}
                  <span className="font-normal text-muted-foreground">
                    {total.asset.key === "native" ? nativeLabel(part.chain) : total.asset.symbol}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {(() => {
                    const value = rows
                      .filter((r) => r.chain === part.chain)
                      .reduce((sum, r) => sum + (cellUsd(r, total.asset, prices) ?? 0), 0);
                    const priced =
                      prices[part.chain]?.[
                        total.asset.key === "native"
                          ? "native"
                          : (total.asset.chains[part.chain]?.address ?? "").toLowerCase()
                      ];
                    return `${priced !== undefined ? usd(value, locale) : s.noPrice} · ${chainOf(part.chain)?.name ?? part.chain}`;
                  })()}
                </p>
              </div>
            </div>
          )),
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card" aria-label={s.complete}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <label className="relative min-w-48 flex-1 sm:max-w-72">
            <Search
              className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={s.searchPlaceholder}
              aria-label={s.searchPlaceholder}
              className="h-9 w-full rounded-lg border bg-background ps-9 pe-3 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...usedChains].map((key) => (
              <button
                key={key ?? "all"}
                type="button"
                aria-pressed={chain === key}
                onClick={() => {
                  setChain(key);
                  setPage(0);
                }}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                  chain === key ? "border-primary bg-primary/10 font-semibold" : "hover:border-primary/60",
                )}
              >
                {key && <ChainIcon chain={key} size={16} />}
                {key ? (chainOf(key)?.name ?? key) : s.allChains}
              </button>
            ))}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => {
                setHideEmpty(e.target.checked);
                setPage(0);
              }}
              className="size-4 accent-[var(--primary)]"
            />
            {s.hideEmpty}
          </label>
          <div className="ms-auto hidden gap-2 md:flex">
            <CopyMenu
              s={s}
              copied={copied}
              onCopy={copyText}
              table={tableText}
              withBalance={withBalance}
              empty={emptyAddresses}
            />
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-4" aria-hidden="true" />
              {s.export}
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{s.noRows}</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      {s.table.index}
                    </th>
                    {sortHeader("label", s.table.label, false)}
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      {s.table.address}
                    </th>
                    {sortHeader("chain", s.table.chain, false)}
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      {s.table.type}
                    </th>
                    {assets.map((asset) =>
                      sortHeader(`asset:${asset.key}`, asset.key === "native" ? s.table.native : asset.symbol),
                    )}
                    {sortHeader("value", s.table.value)}
                    <th scope="col" className="px-3 py-2.5 text-end font-medium">
                      {s.table.share}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const value = rowUsd(row, assets, prices);
                    const share = summary.totalUsd > 0 ? value / summary.totalUsd : 0;
                    return (
                      <tr key={`${row.entry.address}-${row.chain}`} className="border-b last:border-b-0">
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.entry.line}</td>
                        <td className="max-w-40 truncate px-3 py-2.5 font-semibold">
                          {row.entry.label ? (
                            <bdi>{row.entry.label}</bdi>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <a
                              href={`${addressPathPrefix}${row.entry.address}`}
                              className="technical text-primary hover:underline"
                              dir="ltr"
                              title={row.entry.address}
                            >
                              {short(row.entry.address)}
                            </a>
                            <CopyLink text={row.entry.address} label={s.copyAddress} />
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <ChainIcon chain={row.chain} size={16} />
                            {chainOf(row.chain)?.name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <TypeBadge type={row.type} s={s} />
                        </td>
                        {row.status === "failed" ? (
                          <td colSpan={assets.length + 2} className="px-3 py-2.5 text-end text-critical">
                            <TriangleAlert className="me-1.5 inline size-4" aria-hidden="true" />
                            {fill(s.rowFailed, { chain: chainOf(row.chain)?.name ?? row.chain })}{" "}
                            <button
                              type="button"
                              onClick={() => onRetry(row)}
                              className="text-primary underline underline-offset-2"
                            >
                              {s.retryRow}
                            </button>
                          </td>
                        ) : (
                          <>
                            {assets.map((asset) => {
                              const text = amount(row, asset);
                              return (
                                <td
                                  key={asset.key}
                                  className="px-3 py-2.5 text-end whitespace-nowrap tabular-nums"
                                  dir="ltr"
                                >
                                  {text === null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : text === "?" ? (
                                    <span className="text-critical" title={s.unreadable}>
                                      ?
                                    </span>
                                  ) : (
                                    <>
                                      {text}
                                      {asset.key === "native" && (
                                        <span className="ms-1 text-xs text-muted-foreground">
                                          {nativeLabel(row.chain)}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-end font-semibold tabular-nums">{usd(value, locale)}</td>
                            <td className="px-3 py-2.5">
                              <span className="flex items-center justify-end gap-2 tabular-nums text-muted-foreground">
                                {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
                                  share,
                                )}
                                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                  <span
                                    className="block h-full bg-primary"
                                    style={{ width: `${Math.round(share * 100)}%` }}
                                  />
                                </span>
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td colSpan={5} className="px-3 py-3">
                      {fill(s.table.total, { count: shown.length })}
                    </td>
                    {assets.map((asset) => (
                      <td key={asset.key} className="px-3 py-3 text-end text-xs tabular-nums" dir="ltr">
                        {summary.assetTotals
                          .find((t) => t.asset.key === asset.key)
                          ?.perChain.filter((p) => !chain || p.chain === chain)
                          .map((p) => (
                            <span key={p.chain} className="block whitespace-nowrap">
                              {formatAmount(p.raw, p.decimals, locale, 4)}{" "}
                              {asset.key === "native" ? nativeLabel(p.chain) : ""}
                            </span>
                          ))}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-end tabular-nums">
                      {usd(
                        shown.reduce((sum, r) => sum + rowUsd(r, assets, prices), 0),
                        locale,
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <ul className="flex flex-col gap-3 p-3 md:hidden">
              {pageRows.map((row) => (
                <li key={`${row.entry.address}-${row.chain}`} className="rounded-xl border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <ChainIcon chain={row.chain} size={18} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-semibold",
                        !row.entry.label && "text-muted-foreground",
                      )}
                    >
                      <bdi>{row.entry.label || s.noLabel}</bdi>
                    </span>
                    {row.status === "ok" && (
                      <span className="font-semibold tabular-nums">{usd(rowUsd(row, assets, prices), locale)}</span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <a
                      href={`${addressPathPrefix}${row.entry.address}`}
                      className="technical hover:underline"
                      dir="ltr"
                    >
                      {short(row.entry.address)}
                    </a>
                    · {s.types[row.type ?? "unknown"]}
                  </p>
                  {row.status === "failed" ? (
                    <p className="mt-2 text-sm text-critical">
                      <TriangleAlert className="me-1 inline size-4" aria-hidden="true" />
                      {fill(s.rowFailed, { chain: chainOf(row.chain)?.name ?? row.chain })}{" "}
                      <button
                        type="button"
                        onClick={() => onRetry(row)}
                        className="text-primary underline underline-offset-2"
                      >
                        {s.retryRow}
                      </button>
                    </p>
                  ) : (
                    <p className="mt-2 text-sm tabular-nums" dir="ltr">
                      {assets
                        .map((asset) => {
                          const text = amount(row, asset);
                          const raw = row.balances[asset.key];
                          if (text === null || !raw || raw === "0") return null;
                          return `${text} ${asset.key === "native" ? nativeLabel(row.chain) : asset.symbol}`;
                        })
                        .filter(Boolean)
                        .join(" · ") || "0"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p className="flex-1">
            {fill(s.footer, {
              from: shown.length ? current * PAGE + 1 : 0,
              to: Math.min(shown.length, (current + 1) * PAGE),
              count: shown.length,
              hidden: hidden > 0 ? fill(s.hiddenEmpty, { count: hidden }) : "",
            })}
          </p>
          {pages > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className={cn(button, "disabled:opacity-50")}
              >
                {s.previous}
              </button>
              <button
                type="button"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className={cn(button, "disabled:opacity-50")}
              >
                {s.next}
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-16 z-30 flex gap-3 border-t bg-background/95 p-3 backdrop-blur md:hidden">
        <div className="flex-1">
          <CopyMenu
            s={s}
            copied={copied}
            onCopy={copyText}
            table={tableText}
            withBalance={withBalance}
            empty={emptyAddresses}
            wide
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-11 flex-[1.6] items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground"
        >
          <Download className="size-4" aria-hidden="true" />
          {s.export}
        </button>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  note,
  tone,
  className,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "high" | "critical";
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card px-4 py-3", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "high" && "text-high",
          tone === "critical" && "text-critical",
        )}
      >
        {value}
      </p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function TypeBadge({ type, s }: { type: AccountType | null; s: BatchStrings }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs whitespace-nowrap",
        type === "wallet" && "bg-low/14 text-low",
        type === "contract" && "bg-high/14 text-high",
        type === "delegated" && "bg-primary/14 text-primary",
        type === null && "bg-muted text-muted-foreground",
      )}
    >
      {s.types[type ?? "unknown"]}
    </span>
  );
}

function CopyMenu({
  s,
  copied,
  onCopy,
  table,
  withBalance,
  empty,
  wide = false,
}: {
  s: BatchStrings;
  copied: string;
  onCopy: (key: string, text: string) => Promise<void>;
  table: () => string;
  withBalance: string[];
  empty: string[];
  wide?: boolean;
}) {
  const item = "rounded-md px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50";
  return (
    <details className="relative">
      <summary
        className={cn(
          "inline-flex cursor-pointer list-none items-center justify-center gap-2 rounded-lg border px-3 text-sm hover:border-primary",
          wide ? "h-11 w-full rounded-xl font-semibold" : "h-9",
        )}
      >
        {copied ? (
          <Check className="size-4 text-low" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? s.copied : s.copy}
      </summary>
      <div
        className={cn(
          "absolute z-40 flex w-64 flex-col rounded-lg border bg-popover p-1 shadow-lg",
          wide ? "start-0 bottom-full mb-1" : "end-0 mt-1",
        )}
      >
        <button type="button" className={item} onClick={() => void onCopy("table", table())}>
          {s.copyResults}
        </button>
        <button
          type="button"
          className={item}
          disabled={withBalance.length === 0}
          onClick={() => void onCopy("with", withBalance.join("\n"))}
        >
          {s.copyWithBalance} ({withBalance.length})
        </button>
        <button
          type="button"
          className={item}
          disabled={empty.length === 0}
          onClick={() => void onCopy("empty", empty.join("\n"))}
        >
          {s.copyEmpty} ({empty.length})
        </button>
      </div>
    </details>
  );
}
