"use client";

import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  type RatedTransfer,
  type TransactionGroup,
  csvCell,
  groupTransfers,
  rateTransfers,
} from "@/lib/activity/evaluate";
import type { ChainActivity, Transfer } from "@/lib/activity/types";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { NotCheckedNotice, SavedNotice } from "./freshness";
import { type ApprovalsChainInfo as ChainInfo, fill } from "./approvals-shared";

export type ActivityStrings = Record<string, string>;

interface Props {
  owner: string;
  initial: {
    chains: ChainActivity[];
    transfers: Transfer[];
    next: string | null;
    checkedAt: number;
    /** Chains shown from their last full history because reading failed now: ISO time (stabilization S2). */
    saved?: Record<string, string>;
  };
  /** entity.freshness strings. */
  fresh: Record<string, string>;
  hiddenTokens: string[];
  /** Names from CRYPY's list of known contracts, lower-case address → name (per chain key). */
  names: Record<string, Record<string, string>>;
  strings: ActivityStrings;
  locale: string;
  chains: ChainInfo[];
  paths: { address: string; token: string; tx: string };
}

type Dir = "all" | "in" | "out";
type Kind = "all" | "coin" | "token" | "nft";
type Range = "all" | "1" | "7" | "30";

export function ActivityView({ owner, initial, hiddenTokens, names, strings: s, locale, chains, paths, fresh }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [transfers, setTransfers] = useState<Transfer[]>(initial.transfers);
  const [chainState, setChainState] = useState<ChainActivity[]>(initial.chains);
  const [next, setNext] = useState<string | null>(initial.next);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [dir, setDir] = useState<Dir>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [chainFilter, setChainFilter] = useState("all");
  const [range, setRange] = useState<Range>("all");
  const [query, setQuery] = useState("");
  const [hideSpam, setHideSpam] = useState(true);

  const hidden = useMemo(() => new Set(hiddenTokens), [hiddenTokens]);
  const rated = useMemo(() => rateTransfers(owner, transfers, hidden), [owner, transfers, hidden]);
  const chainInfo = (key: string) => chains.find((c) => c.key === key);
  const spamCount = rated.filter((t) => t.spam && !t.poisoning).length;

  const nowSec = initial.checkedAt / 1000;
  const shown = rated.filter((t) => {
    if (hideSpam && t.spam && !t.poisoning) return false;
    if (dir !== "all" && t.direction !== dir && t.direction !== "self") return false;
    if (kind !== "all" && t.kind !== kind) return false;
    if (chainFilter !== "all" && t.chain !== chainFilter) return false;
    if (range !== "all" && (t.time === null || t.time < nowSec - Number(range) * 86_400)) return false;
    if (query) {
      const q = query.trim().toLowerCase();
      if (![t.hash, t.from, t.to, t.asset.symbol, t.asset.address ?? ""].some((v) => v.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });
  const groups = groupTransfers(shown);

  const loadMore = async () => {
    if (!next) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/v1/address/${owner}/activity?cursor=${encodeURIComponent(next)}`);
      const json = (await res.json()) as {
        ok: boolean;
        data?: { chains: ChainActivity[]; transfers: Transfer[]; next: string | null };
      };
      if (!json.ok || !json.data) throw new Error("failed");
      const data = json.data;
      setTransfers((prev) => {
        const ids = new Set(prev.map((t) => `${t.chain}:${t.id}`));
        return [...prev, ...data.transfers.filter((t) => !ids.has(`${t.chain}:${t.id}`))];
      });
      setChainState((prev) => prev.map((c) => data.chains.find((d) => d.chain === c.chain) ?? { ...c, next: null }));
      setNext(data.next);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const header = [
      "time_utc",
      "chain",
      "direction",
      "type",
      "asset",
      "asset_contract",
      "token_id",
      "amount",
      "from",
      "to",
      "value_now_usd",
      "tx_hash",
    ];
    const lines = rated.map((t) =>
      [
        t.time ? new Date(t.time * 1000).toISOString() : "",
        t.chain,
        t.direction,
        t.kind,
        t.asset.symbol,
        t.asset.address ?? "",
        t.asset.tokenId ?? "",
        t.amount !== null && t.asset.decimals !== null
          ? formatAmount(t.amount, t.asset.decimals, "en", 18).replace(/,/g, "")
          : "",
        t.from,
        t.to,
        t.valueNowUsd !== null ? t.valueNowUsd.toFixed(2) : "",
        t.hash,
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
    const blob = new Blob([`﻿${[header.join(","), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crypy-activity-${owner.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const times = rated.map((t) => t.time).filter((t): t is number => t !== null);
  const firsts = chainState.flatMap((c) => (c.first?.time ? [{ time: c.first.time, chain: c.chain }] : []));
  const first = firsts.sort((a, b) => a.time - b.time)[0];
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const ago = (sec: number) => {
    const diff = Math.max(0, nowSec - sec);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
    if (diff < 86_400) return rtf.format(-Math.round(diff / 3600), "hour");
    if (diff < 86_400 * 60) return rtf.format(-Math.round(diff / 86_400), "day");
    return dateFmt.format(sec * 1000);
  };

  const recent = chainState.filter((c) => c.source === "recent").map((c) => chainInfo(c.chain)?.name ?? c.chain);
  const down = chainState.filter((c) => c.source === "unavailable").map((c) => chainInfo(c.chain)?.name ?? c.chain);
  const noInternal = chainState
    .filter((c) => c.source === "history" && !c.internalIncluded)
    .map((c) => chainInfo(c.chain)?.name ?? c.chain);

  // Day headings for the grouped list.
  const byDay: { day: string; groups: TransactionGroup[] }[] = [];
  for (const g of groups) {
    const label = g.time ? dayFmt.format(g.time * 1000) : s.unknownTime!;
    const last = byDay[byDay.length - 1];
    if (last && last.day === label) last.groups.push(g);
    else byDay.push({ day: label, groups: [g] });
  }

  return (
    <div className="flex flex-col gap-5">
      {recent.length > 0 && (
        <p role="note" className="rounded-xl border border-high/50 bg-high/8 p-4 text-sm">
          {fill(s.recentOnly!, { chains: recent.join(", ") })}
        </p>
      )}
      {Object.entries(initial.saved ?? {}).map(([chain, at]) => (
        <SavedNotice
          key={chain}
          at={at}
          locale={locale}
          chain={chainInfo(chain)?.name ?? chain}
          title={fresh.savedTitle!}
          pending={fresh.savedPending!}
          body={fresh.savedActivity}
          labels={{ retry: fresh.retry!, retrying: fresh.retrying! }}
        />
      ))}
      {down.map((name) => (
        <NotCheckedNotice
          key={name}
          title={fill(fresh.notCheckedTitle!, { chain: name })}
          body={fill(fresh.notCheckedBody!, { chain: name })}
          labels={{ retry: fresh.retry!, retrying: fresh.retrying! }}
        />
      ))}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={s.statLast!} value={times.length ? ago(Math.max(...times)) : "—"} />
        <Stat
          label={s.statFirst!}
          value={first ? dateFmt.format(first.time * 1000) : "—"}
          detail={first ? (chainInfo(first.chain)?.name ?? "") : s.statFirstUnknown}
        />
        <Stat label={s.statLoaded!} value={String(rated.length)} detail={next ? s.statMore : s.statAll} />
        <Stat label={s.statSpam!} value={String(spamCount)} detail={s.statSpamDetail} />
      </dl>

      <section aria-labelledby="activity-list" className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="activity-list" className="text-base font-semibold">
            {s.listTitle}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={rated.length === 0}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download aria-hidden="true" />
              {s.exportCsv}
            </button>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <RefreshCw aria-hidden="true" className={cn(refreshing && "animate-spin")} />
              {s.checkAgain}
            </button>
          </div>
        </div>

        <div role="group" aria-label={s.filters} className="flex flex-wrap items-center gap-2">
          {(["all", "in", "out"] as const).map((d) => (
            <Pill key={d} active={dir === d} onClick={() => setDir(d)}>
              {s[`dir_${d}`]}
            </Pill>
          ))}
          {(["all", "coin", "token", "nft"] as const).map((k) => (
            <Pill key={k} active={kind === k} onClick={() => setKind(k)}>
              {s[`kind_${k}`]}
            </Pill>
          ))}
          {chainState.length > 1 &&
            ["all", ...chainState.map((c) => c.chain)].map((c) => (
              <Pill key={c} active={chainFilter === c} onClick={() => setChainFilter(c)}>
                {c === "all" ? s.allChains : (chainInfo(c)?.name ?? c)}
              </Pill>
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-sm sm:max-w-sm focus-within:ring-2 focus-within:ring-ring">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="sr-only">{s.search}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent outline-none"
              dir="ltr"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{s.range}</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              className="h-9 rounded-lg border bg-card px-2"
            >
              {(["all", "1", "7", "30"] as const).map((r) => (
                <option key={r} value={r}>
                  {s[`range_${r}`]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={hideSpam}
              onChange={(e) => setHideSpam(e.target.checked)}
              className="size-4"
            />
            {fill(s.hideSpam!, { count: spamCount })}
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            {rated.length === 0 ? s.empty : s.noMatch}
          </p>
        ) : (
          <div>
            {byDay.map((d) => (
              <div key={d.day}>
                <h3 className="px-1 pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {d.day}
                </h3>
                <ul>
                  {d.groups.map((g) => (
                    <Row
                      key={g.key}
                      group={g}
                      s={s}
                      locale={locale}
                      chain={chainInfo(g.chain)}
                      names={names[g.chain] ?? {}}
                      paths={paths}
                      time={g.time ? timeFmt.format(g.time * 1000) : ""}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {next && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {loading ? s.loading : s.loadMore}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {fill(next ? s.showingMore! : s.showingAll!, { count: rated.length })}
          </span>
          {loadError && (
            <span role="alert" className="text-xs text-critical">
              {s.loadError}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">{s.howTitle}</span> {s.how}
          </p>
          {recent.length > 0 && <p>{s.howRecent}</p>}
          {noInternal.length > 0 && <p>{fill(s.noInternal!, { chains: noInternal.join(", ") })}</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm whitespace-nowrap",
        active ? "border-transparent bg-primary/14 font-semibold" : "hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}

const amountText = (t: RatedTransfer, locale: string) => {
  if (t.kind === "nft")
    return t.asset.tokenId
      ? `#${t.asset.tokenId.length > 10 ? `${t.asset.tokenId.slice(0, 8)}…` : t.asset.tokenId}`
      : `${t.amount ?? "?"}`;
  if (t.amount === null || t.asset.decimals === null) return "?";
  const text = formatAmount(t.amount, t.asset.decimals, locale, 6);
  return /^[0.,\s]+$/.test(text) && !/^0*$/.test(t.amount) ? `< ${(0.000001).toLocaleString(locale)}` : text;
};

function Row({
  group,
  s,
  locale,
  chain,
  names,
  paths,
  time,
}: {
  group: TransactionGroup;
  s: ActivityStrings;
  locale: string;
  chain: ChainInfo | undefined;
  names: Record<string, string>;
  paths: Props["paths"];
  time: string;
}) {
  const ts = group.transfers;
  const lead = ts[0]!;
  const poisoned = ts.find((t) => t.poisoning);
  const outs = ts.filter((t) => t.direction === "out");
  const ins = ts.filter((t) => t.direction === "in");
  const fmt = (t: RatedTransfer) => `${amountText(t, locale)} ${t.asset.symbol}`;
  let title: string;
  let icon: "in" | "out" | "swap" | "warn" | "nft";
  if (poisoned) {
    icon = "warn";
    title = fill(poisoned.direction === "in" ? s.titleIn! : s.titleOut!, { what: fmt(poisoned) });
  } else if (group.kind === "swap") {
    icon = "swap";
    title = fill(s.titleSwap!, { out: outs.map(fmt).join(" + "), in: ins.map(fmt).join(" + ") });
  } else if (ts.length > 1) {
    icon = outs.length ? "out" : "in";
    title = fill(s.titleMulti!, { count: ts.length });
  } else {
    icon = lead.kind === "nft" ? "nft" : lead.direction === "in" ? "in" : "out";
    title = fill(lead.direction === "in" ? s.titleIn! : lead.direction === "out" ? s.titleOut! : s.titleSelf!, {
      what: fmt(lead),
    });
  }
  const sub =
    group.kind === "swap"
      ? s.subSwap
      : lead.kind === "nft"
        ? s.subNft
        : lead.internal
          ? s.subInternal
          : lead.kind === "coin"
            ? s.subCoin
            : s.subToken;
  const other = lead.direction === "in" ? lead.from : lead.to;
  const otherName = names[other.toLowerCase()];
  // A swap shows what came in; anything else the total moved.
  const valued = group.kind === "swap" ? ins : ts;
  const value = valued.reduce((sum, t) => sum + (t.valueNowUsd ?? 0), 0);
  const anyValue = valued.some((t) => t.valueNowUsd !== null);
  const Icon = { in: ArrowDown, out: ArrowUp, swap: ArrowLeftRight, warn: TriangleAlert, nft: ImageIcon }[icon];
  const tone = {
    in: "bg-low/14 text-low",
    out: "bg-primary/14 text-primary",
    swap: "bg-primary/14 text-primary",
    warn: "bg-high/14 text-high",
    nft: "bg-primary/14 text-primary",
  }[icon];

  return (
    <li className={cn("flex flex-col gap-2 border-t px-1 py-3", poisoned && "rounded-lg bg-high/8 px-3")}>
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
        <span aria-hidden="true" className={cn("flex size-9 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-semibold break-words">
            {title}
            {group.kind === "swap" && (
              <span className="rounded-md bg-primary/14 px-1.5 py-0.5 text-xs font-semibold text-primary">
                {s.interpretation}
              </span>
            )}
            {poisoned && (
              <span className="rounded-md bg-high/14 px-1.5 py-0.5 text-xs font-semibold text-high">{s.heuristic}</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {sub} · {lead.direction === "in" ? s.from : s.to}{" "}
            {otherName && <span className="text-foreground">{otherName} </span>}
            <Link href={`${paths.address}/${other}`} prefetch={false} className="technical hover:underline">
              {shortenId(other)}
            </Link>
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-end text-sm tabular-nums">
          <span className="font-semibold">{anyValue ? formatUsd(value, locale) : "—"}</span>
          <span className="text-xs text-muted-foreground">
            {time} · {chain?.name}
          </span>
          <Link
            href={`${paths.tx}/${group.hash}?chain=${group.chain}`}
            prefetch={false}
            className="technical text-xs text-primary hover:underline"
          >
            {shortenId(group.hash, 6, 4)}
          </Link>
        </div>
      </div>
      {poisoned && (
        <p className="ps-14 text-xs text-high">
          {fill(s.poisoning!, {
            sender: shortenId(poisoned.direction === "in" ? poisoned.from : poisoned.to),
            lookalike: shortenId(poisoned.poisoning!),
          })}
        </p>
      )}
      {ts.length > 1 && !poisoned && (
        <ul className="ps-14 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {ts.map((t) => (
            <li key={t.id}>
              {t.direction === "in" ? "+" : "−"}
              {fmt(t)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
