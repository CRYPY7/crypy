import "server-only";
import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import {
  Box,
  ChevronRight,
  Clock,
  Crown,
  Droplets,
  Flame,
  Landmark,
  Lock,
  LockOpen,
  Sprout,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/i18n/locales";

import { shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { pct } from "@/lib/security/evaluate";
import {
  DUST_POOL_USD,
  type LiquidityPart,
  holderState,
  liquiditySummary,
  lockPart,
  poolSplit,
} from "@/lib/security/liquidity";
import type { LpHolder, PoolFact, SecurityReport } from "@/lib/security/types";
import { cn } from "@/lib/utils";

type T = Awaited<ReturnType<typeof getTranslations>>;

/** Pool values in whole dollars (cents add nothing at this scale). */
const formatUsd = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
/** A share, with tiny non-zero shares shown as "<0.1%" instead of "0%". */
const share = (x: number) => (x > 0 && x < 0.0005 ? "<0.1%" : pct(x));
const K = "entity.tokenSecurity.lp";
const DAY = 86_400;

/** Bar colours per part, in display order. */
const PARTS: { part: LiquidityPart; bar: string }[] = [
  { part: "burned", bar: "bg-low" },
  { part: "locked", bar: "bg-low/60" },
  { part: "soon", bar: "bg-medium" },
  { part: "controlled", bar: "bg-primary" },
  { part: "unknown", bar: "bg-muted-foreground/60" },
  { part: "owner", bar: "bg-critical" },
  { part: "expired", bar: "bg-critical/60" },
  { part: "removable", bar: "bg-high" },
  { part: "notFound", bar: "bg-border" },
];

const stateTone: Record<LiquidityPart, string> = {
  burned: "bg-low/14 text-low",
  locked: "bg-low/14 text-low",
  soon: "bg-medium/14 text-medium",
  controlled: "bg-primary/14 text-primary",
  owner: "bg-critical/14 text-critical",
  expired: "bg-critical/14 text-critical",
  removable: "bg-critical/14 text-critical",
  unknown: "bg-muted text-muted-foreground",
  notFound: "bg-muted text-muted-foreground",
};

const kindIcon: Record<LpHolder["kind"], LucideIcon> = {
  burn: Flame,
  locker: Lock,
  vault: Lock,
  multisig: Users,
  timelock: Clock,
  farm: Sprout,
  exchange: Landmark,
  owner: Crown,
  token: Box,
  pool: Droplets,
  wallet: User,
  contract: Box,
};

function Bar({ split, className }: { split: Record<LiquidityPart, number>; className?: string }) {
  return (
    <div className={cn("flex h-2.5 overflow-hidden rounded-full bg-muted", className)} aria-hidden="true">
      {PARTS.map(({ part, bar }) =>
        split[part] > 0.0005 ? <span key={part} className={bar} style={{ width: `${split[part] * 100}%` }} /> : null,
      )}
    </div>
  );
}

function StateChip({ t, part }: { t: T; part: LiquidityPart }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap", stateTone[part])}>
      {t(`${K}.state.${part}`)}
    </span>
  );
}

const dateText = (at: number, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(at * 1000));

/** "Locked until 14 Mar 2027 (in 114 days)" etc., for one lock. */
function lockText(t: T, unlockAt: number | null, now: number, locale: Locale, vesting: boolean): string {
  const step = vesting ? ` ${t(`${K}.lock.vesting`)}` : "";
  if (unlockAt === null) return t(`${K}.lock.forever`) + step;
  const days = Math.max(0, Math.ceil((unlockAt - now) / DAY));
  const part = lockPart(unlockAt, now);
  const date = dateText(unlockAt, locale);
  if (part === "expired") return t(`${K}.lock.ended`, { date, days: Math.floor((now - unlockAt) / DAY) });
  return t(part === "soon" ? `${K}.lock.soon` : `${K}.lock.until`, { date, days }) + step;
}

function controlText(t: T, h: LpHolder, now: number, locale: Locale): string {
  switch (h.kind) {
    case "locker":
    case "vault": {
      if (h.lockRead !== "read") return t(`${K}.control.unread`);
      if (h.locks.length === 0) return t(`${K}.control.noLocks`);
      const sorted = [...h.locks].sort((a, b) => (a.unlockAt ?? Infinity) - (b.unlockAt ?? Infinity));
      const first = lockText(t, sorted[0]!.unlockAt, now, locale, sorted[0]!.vesting);
      const covered = h.locks.reduce((s, l) => s + l.share, 0);
      const rest = h.share - covered > 0.0005 ? ` ${t(`${K}.control.partly`, { share: pct(h.share - covered) })}` : "";
      return (h.locks.length > 1 ? t(`${K}.control.locks`, { count: h.locks.length, first }) : first) + rest;
    }
    case "multisig":
      return (h.multisig?.threshold ?? 0) > 1
        ? t(`${K}.control.multisig`, { threshold: h.multisig!.threshold, signers: h.multisig!.signers })
        : t(`${K}.control.multisigOne`, { signers: h.multisig?.signers ?? 1 });
    case "timelock": {
      const hours = Math.round((h.delay ?? 0) / 3600);
      return t(`${K}.control.timelock`, { hours });
    }
    default:
      return t(`${K}.control.${h.kind}`);
  }
}

function holderName(t: T, h: LpHolder): string {
  const base =
    h.kind === "exchange" && h.name
      ? t(`${K}.kind.exchangeOf`, { name: h.name })
      : (h.name ?? t(`${K}.kind.${h.kind}`));
  return h.position ? t(`${K}.position`, { id: h.position, name: base }) : base;
}

function HolderRow({ t, h, now, locale, count }: { t: T; h: LpHolder; now: number; locale: Locale; count?: number }) {
  const Icon = kindIcon[h.kind];
  const state = holderState(h, now);
  const tone = stateTone[state];
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 text-sm md:grid-cols-[2fr_1fr_4rem_2fr_7rem] md:items-center">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold break-words">
            {count && count > 1 ? t(`${K}.wallets`, { count }) : holderName(t, h)}
          </span>
          <Link
            href={localePath(locale, `/address/${h.address}`)}
            className="block truncate font-mono text-xs text-primary hover:underline"
          >
            {count && count > 1 ? t(`${K}.largest`, { address: shortenId(h.address) }) : shortenId(h.address)}
          </Link>
        </span>
      </span>
      <b className="text-end tabular-nums md:order-3">{share(h.share)}</b>
      <span className="hidden text-muted-foreground md:order-2 md:block">{t(`${K}.type.${h.kind}`)}</span>
      <span className="col-span-2 text-sm text-muted-foreground md:order-4 md:col-span-1">
        {controlText(t, h, now, locale)}
      </span>
      <span className="col-span-2 md:order-5 md:col-span-1">
        <StateChip t={t} part={state} />
      </span>
    </li>
  );
}

/** Below this share a holder isn't listed one by one (it is still counted in every total). */
const TINY = 0.0005;

/** Ordinary wallets are grouped into one row; everything else is listed one by one. */
function rows(holders: LpHolder[]): { h: LpHolder; count?: number }[] {
  const wallets = holders.filter((h) => h.kind === "wallet");
  const others = holders.filter((h) => h.kind !== "wallet" && h.share >= TINY).map((h) => ({ h }));
  if (wallets.length <= 1) return [...others, ...wallets.map((h) => ({ h }))].sort((a, b) => b.h.share - a.h.share);
  const largest = wallets.reduce((a, b) => (b.share > a.share ? b : a));
  const group = { h: { ...largest, share: wallets.reduce((s, w) => s + w.share, 0) }, count: wallets.length };
  return [...others, group].sort((a, b) => b.h.share - a.h.share);
}

const tinyOnes = (list: LpHolder[]) => list.filter((h) => h.kind !== "wallet" && h.share < TINY);
const tinyCount = (list: LpHolder[]) => tinyOnes(list).length;
const tinyShare = (list: LpHolder[]) => tinyOnes(list).reduce((s, h) => s + h.share, 0);

function PoolSection({
  t,
  pool,
  symbol,
  weight,
  now,
  locale,
  open,
}: {
  t: T;
  pool: PoolFact;
  symbol: string;
  weight: number | null;
  now: number;
  locale: Locale;
  open: boolean;
}) {
  const split = poolSplit(pool, now);
  const h = pool.holders;
  const fee = pool.fee !== null ? ` · ${t(`${K}.fee`, { fee: pool.fee / 10_000 })}` : "";
  return (
    <details open={open} className="group rounded-xl border p-3 sm:p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2.5">
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 rtl:-scale-x-100"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {pool.dex} · <bdi>{symbol}</bdi> / {pool.pairedWith}
            {fee}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t(h?.kind === "positions" || pool.protocol === "uniswap-v3" ? `${K}.kindPositions` : `${K}.kindLp`)}
            {h ? ` · ${t(`${K}.foundShare`, { share: pct(h.found) })}` : ""}
            {!pool.listed ? ` · ${t(`${K}.unlisted`)}` : ""}
          </span>
        </span>
        <span className="text-end">
          <b className="block tabular-nums">
            {pool.liquidityUsd !== null ? formatUsd(pool.liquidityUsd, locale) : "—"}
          </b>
          <span className="block text-xs text-muted-foreground">
            {weight !== null ? t(`${K}.weight`, { share: pct(weight) }) : t(`${K}.notCounted`)}
          </span>
        </span>
      </summary>
      <div className="mt-3">
        {!h ? (
          <p className="text-sm text-muted-foreground">{t(`${K}.unreadPool`)}</p>
        ) : (
          <>
            <Bar split={split} className="h-2" />
            <div className="mt-3 hidden grid-cols-[2fr_1fr_4rem_2fr_7rem] gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid">
              <span>{t(`${K}.col.holder`)}</span>
              <span>{t(`${K}.col.type`)}</span>
              <span className="text-end">{t(`${K}.col.share`)}</span>
              <span>{t(`${K}.col.control`)}</span>
              <span>{t(`${K}.col.status`)}</span>
            </div>
            <ul className="divide-y border-t md:mt-2">
              {rows(h.holders).map(({ h: holder, count }) => (
                <HolderRow
                  key={`${holder.address}-${holder.position ?? ""}`}
                  t={t}
                  h={holder}
                  now={now}
                  locale={locale}
                  count={count}
                />
              ))}
              {tinyCount(h.holders) > 0 && (
                <li className="py-3 text-sm text-muted-foreground">
                  {t(`${K}.tiny`, {
                    count: tinyCount(h.holders),
                    share: share(tinyShare(h.holders)),
                  })}
                </li>
              )}
              {split.notFound >= 0.0005 && (
                <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 text-sm md:grid-cols-[2fr_1fr_4rem_2fr_7rem] md:items-center">
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <LockOpen className="size-4" aria-hidden="true" />
                    </span>
                    <b className="font-semibold">{t(`${K}.notFound.title`)}</b>
                  </span>
                  <b className="text-end tabular-nums md:order-3">{pct(split.notFound)}</b>
                  <span className="hidden text-muted-foreground md:order-2 md:block">—</span>
                  <span className="col-span-2 text-sm text-muted-foreground md:order-4 md:col-span-1">
                    {t(`${K}.notFound.detail`)}
                  </span>
                  <span className="col-span-2 md:order-5 md:col-span-1">
                    <StateChip t={t} part="notFound" />
                  </span>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

export function LiquidityHoldersCard({
  t,
  report,
  locale,
  dexes,
  right,
}: {
  t: T;
  report: SecurityReport;
  locale: Locale;
  dexes: string;
  right: React.ReactNode;
}) {
  const facts = report.facts;
  const now = Math.floor(facts.checkedAt / 1000);
  const all = [...facts.pools].sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1));
  const listed = all.filter((p) => p.liquidityUsd === null || p.liquidityUsd >= 1);
  const empty = all.length - listed.length;
  const summary = liquiditySummary(facts.pools, now);
  const counted = listed.filter((p) => (p.liquidityUsd ?? 0) >= DUST_POOL_USD);
  const small = listed.filter((p) => !counted.includes(p));
  const s = summary?.split;
  const tiles = s
    ? ([
        [s.burned + s.locked, "protected", "text-low", null],
        [
          s.soon,
          "soon",
          "text-medium",
          summary!.nextUnlock ? t(`${K}.tiles.soonNext`, { date: dateText(summary!.nextUnlock.at, locale) }) : null,
        ],
        [s.controlled, "controlled", "text-primary", null],
        [s.owner + s.removable + s.expired, "removable", "text-critical", null],
        [s.unknown, "unknown", "text-muted-foreground", null],
        ...(s.notFound >= 0.0005 ? [[s.notFound, "notFound", "text-muted-foreground", null] as const] : []),
      ] as const)
    : [];
  return (
    <section aria-labelledby="sec-liquidity" className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Droplets className="size-[18px] text-primary" aria-hidden="true" />
        <h2 id="sec-liquidity" className="font-sans text-base font-semibold">
          {t(`${K}.title`)}
        </h2>
        <span className="ms-auto">{right}</span>
      </div>
      {listed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {all.length > 0
            ? t("entity.tokenSecurity.liquidity.empty", { count: all.length, dexes })
            : t("entity.tokenSecurity.liquidity.none", { dexes })}
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{t(`${K}.intro`)}</p>
          {summary && s ? (
            <>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {tiles.map(([value, key, tone, sub]) => (
                  <li key={key} className="rounded-xl border bg-background/40 p-3">
                    <p className={cn("text-xl font-bold tabular-nums", tone)}>{pct(value)}</p>
                    <p className="text-xs text-muted-foreground">{t(`${K}.tiles.${key}`)}</p>
                    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
                  </li>
                ))}
              </ul>
              <Bar split={s} className="mt-4" />
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {PARTS.filter(({ part }) => s[part] >= 0.0005).map(({ part, bar }) => (
                  <span key={part} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-sm", bar)} aria-hidden="true" />
                    {t(`${K}.state.${part}`)} <b className="text-foreground tabular-nums">{pct(s[part])}</b>
                  </span>
                ))}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(`${K}.total`, { usd: formatUsd(summary.totalUsd, locale), count: summary.counted })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(`${K}.tooSmall`, { usd: formatUsd(DUST_POOL_USD, locale) })}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-3">
            {counted.map((pool, i) => (
              <PoolSection
                key={pool.address}
                t={t}
                pool={pool}
                symbol={facts.token.symbol}
                weight={summary ? pool.liquidityUsd! / summary.totalUsd : null}
                now={now}
                locale={locale}
                open={i === 0}
              />
            ))}
            {small.length > 0 && (
              <details className="rounded-xl border border-dashed p-3 sm:p-4">
                <summary className="cursor-pointer text-sm">
                  <span className="font-semibold">{t(`${K}.small.title`, { count: small.length })}</span>{" "}
                  <span className="text-muted-foreground">
                    {t(`${K}.small.detail`, { usd: formatUsd(DUST_POOL_USD, locale) })}
                  </span>
                </summary>
                <ul className="mt-2 divide-y text-sm">
                  {small.map((p) => (
                    <li key={p.address} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">
                        {p.dex} · <bdi>{facts.token.symbol}</bdi> / {p.pairedWith}
                        {p.fee !== null ? ` · ${t(`${K}.fee`, { fee: p.fee / 10_000 })}` : ""}
                      </span>
                      <span className="tabular-nums">
                        {p.liquidityUsd !== null ? formatUsd(p.liquidityUsd, locale) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {empty > 0 && <p className="text-xs text-muted-foreground">{t(`${K}.empty`, { count: empty })}</p>}
          </div>
          <div className="mt-4 rounded-xl border bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <b className="text-foreground">{t(`${K}.how.title`)}</b> {t(`${K}.how.body`, { dexes })}
          </div>
        </>
      )}
    </section>
  );
}
