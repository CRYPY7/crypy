"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { RatedApproval } from "@/lib/approvals/evaluate";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { ApprovalsReport } from "@/server/services/approvals";
import type { RevokeRequest } from "@/wallets/types";
import { useWallet } from "@/wallets/wallet-root";
import { type ApprovalsChainInfo, type ApprovalsStrings, fill } from "./approvals-shared";
import { RevokeDialog, type RevokeTarget } from "./revoke-dialog";

type Row = RatedApproval & { chain: string; id: string };
type Filter = "all" | "attention" | "unlimited" | "tokens" | "nfts";

export function ApprovalsView({
  report,
  strings: s,
  locale,
  chains,
  tokenPath,
  addressPath,
}: {
  report: ApprovalsReport;
  strings: ApprovalsStrings;
  locale: string;
  chains: ApprovalsChainInfo[];
  /** "/en/token" */
  tokenPath: string;
  /** "/en/address" */
  addressPath: string;
}) {
  const { state, openWallet } = useWallet();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [revoked, setRevoked] = useState<Set<string>>(() => new Set());
  const [queue, setQueue] = useState<RevokeTarget[] | null>(null);

  const rows: Row[] = useMemo(
    () =>
      report.chains.flatMap((c) =>
        c.approvals.map((a) => ({
          ...a,
          chain: c.chain,
          id: `${c.chain}|${a.kind}|${a.token.address}|${a.spender.address}`.toLowerCase(),
        })),
      ),
    [report],
  );
  const live = rows.filter((r) => !revoked.has(r.id));
  const chainInfo = (key: string) => chains.find((c) => c.key === key);
  const isOwner = state.status === "connected" && state.address?.toLowerCase() === report.owner.toLowerCase();
  const sum = report.summary;
  const attentionLive = live.filter((r) => r.attention);
  const checkLive = live.filter((r) => r.risk === "check" && !r.spamToken);
  const attentionUsd = attentionLive.reduce((t, r) => t + (r.atRiskUsd ?? 0), 0);

  const counts = {
    all: live.length,
    attention: attentionLive.length,
    unlimited: live.filter((r) => r.unlimited).length,
    tokens: live.filter((r) => r.kind !== "nft-all").length,
    nfts: live.filter((r) => r.kind === "nft-all").length,
  };
  const shown = live.filter(
    (r) =>
      (chainFilter === "all" || r.chain === chainFilter) &&
      (filter === "all" ||
        (filter === "attention" && r.attention) ||
        (filter === "unlimited" && r.unlimited) ||
        (filter === "tokens" && r.kind !== "nft-all") ||
        (filter === "nfts" && r.kind === "nft-all")),
  );
  const groups = [
    { key: "attention", title: s.groupAttention, note: s.groupAttentionNote, rows: shown.filter((r) => r.attention) },
    {
      key: "check",
      title: s.groupCheck,
      note: s.groupCheckNote,
      rows: shown.filter((r) => r.risk === "check" && !r.spamToken),
    },
    {
      key: "normal",
      title: s.groupNormal,
      note: s.groupNormalNote,
      rows: shown.filter((r) => (r.risk === "known" || r.risk === "normal") && !r.spamToken),
    },
    { key: "spam", title: s.groupSpam, note: s.groupSpamNote, rows: shown.filter((r) => r.spamToken && !r.attention) },
  ].filter((g) => g.rows.length > 0);

  const target = (r: Row): RevokeTarget | null => {
    const info = chainInfo(r.chain);
    if (!info) return null;
    const request: RevokeRequest = {
      chainId: info.id,
      owner: report.owner,
      kind: r.kind,
      token: r.token.address,
      spender: r.spender.address,
      ...(r.permit2 ? { permit2: r.permit2 } : {}),
    };
    return { id: r.id, request, approval: r, chain: info };
  };
  const startRevoke = (list: Row[]) => {
    if (!isOwner) {
      openWallet();
      return;
    }
    const targets = list.flatMap((r) => {
      const t = target(r);
      return t ? [t] : [];
    });
    if (targets.length > 0) setQueue(targets);
  };

  const blocks = report.chains
    .map((c) =>
      fill(s.blockOn!, { block: Number(c.block).toLocaleString(locale), chain: chainInfo(c.chain)?.name ?? c.chain }),
    )
    .join(" · ");
  const timeText = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(report.checkedAt);
  const chainNames = (keys: string[]) => keys.map((k) => chainInfo(k)?.name ?? k).join(", ");
  const goplusDown = report.chains.filter((c) => c.sources.goplus === "unavailable").map((c) => c.chain);
  const goplusPartial = report.chains.filter((c) => c.sources.goplus === "partial").map((c) => c.chain);
  // Recent Approval events have a time limit; when a slow node missed it, say so.
  const recentSkipped = report.chains
    .filter((c) => c.sources.knownSpenders && !c.sources.recentLogs)
    .map((c) => c.chain);

  return (
    <div className="flex flex-col gap-5">
      {state.status === "connected" && !isOwner && (
        <div role="note" className="rounded-xl border border-dashed p-4 text-sm">
          <p className="font-semibold">{s.readOnlyTitle}</p>
          <p className="mt-1 text-muted-foreground">{s.readOnlyBody}</p>
        </div>
      )}

      {report.unavailable.map((chain) => (
        <p key={chain} role="alert" className="rounded-xl border border-high/50 bg-high/8 p-4 text-sm">
          {fill(s.chainDown!, { chain: chainInfo(chain)?.name ?? chain })}
        </p>
      ))}
      {goplusPartial.length > 0 && (
        <p role="note" className="rounded-xl border p-4 text-sm text-muted-foreground">
          {fill(s.goplusPartial!, { chains: chainNames(goplusPartial) })}
        </p>
      )}
      {recentSkipped.length > 0 && (
        <p role="note" className="rounded-xl border p-4 text-sm text-muted-foreground">
          {fill(s.recentSkipped!, { chains: chainNames(recentSkipped) })}
        </p>
      )}
      {goplusDown.length > 0 && (
        <p role="note" className="rounded-xl border border-high/50 bg-high/8 p-4 text-sm">
          {fill(s.goplusDown!, { chains: chainNames(goplusDown) })}
        </p>
      )}

      {/* Summary */}
      <section
        aria-labelledby="approvals-summary"
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5",
          attentionLive.length > 0 ? "border-critical/50 bg-critical/8" : "bg-card",
        )}
      >
        <div className="flex flex-col gap-1">
          <h2 id="approvals-summary" className="text-lg font-semibold">
            {live.length === 0
              ? s.noneFoundTitle
              : attentionLive.length === 0
                ? checkLive.length > 0
                  ? fill(checkLive.length === 1 ? s.checkOne! : s.checkOther!, { count: checkLive.length })
                  : s.noneAttention
                : attentionLive.length === 1
                  ? s.attentionOne
                  : fill(s.attentionOther!, { count: attentionLive.length })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {live.length === 0
              ? fill(s.noneFoundBody!, { chains: chainNames(report.chains.map((c) => c.chain)) })
              : attentionLive.length === 0
                ? checkLive.length > 0
                  ? s.checkBody
                  : s.noneAttentionBody
                : attentionUsd > 0
                  ? fill(s.attentionBody!, { usd: formatUsd(attentionUsd, locale) })
                  : s.attentionBodyNoPrice}
          </p>
          <p className="text-xs text-muted-foreground">{fill(s.readAt!, { time: timeText, blocks })}</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          {attentionLive.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => startRevoke(attentionLive)}
                className={cn(buttonVariants({ size: "lg" }), "bg-critical")}
              >
                {isOwner
                  ? attentionLive.length === 1
                    ? s.revokeFlaggedOne
                    : fill(s.revokeFlaggedOther!, { count: attentionLive.length })
                  : s.connectToRevoke}
              </button>
              <span className="text-xs text-muted-foreground">{s.revokeFlaggedNote}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RefreshCw aria-hidden="true" className={cn(refreshing && "animate-spin")} />
            {s.checkAgain}
          </button>
        </div>
      </section>

      {live.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={s.statActive!}
            value={String(live.length)}
            detail={fill(s.statActiveDetail!, { tokens: sum.tokens, nfts: sum.nfts, permit2: sum.permit2 })}
          />
          <Stat
            label={s.statAtRisk!}
            value={formatUsd(
              live.reduce((t, r) => t + (r.atRiskUsd ?? 0), 0),
              locale,
            )}
            detail={s.statAtRiskDetail!}
          />
          <Stat label={s.statUnlimited!} value={String(counts.unlimited)} />
          <Stat
            label={s.statAttention!}
            value={String(attentionLive.length)}
            detail={fill(s.statAttentionDetail!, { malicious: sum.malicious, wallets: sum.walletSpenders })}
            tone={attentionLive.length > 0 ? "danger" : undefined}
          />
        </dl>
      )}

      {live.length > 0 && (
        <section aria-labelledby="approvals-list" className="flex flex-col gap-4">
          <div>
            <h2 id="approvals-list" className="text-base font-semibold">
              {s.listTitle}
            </h2>
          </div>
          <div role="group" aria-label={s.filters} className="flex flex-wrap gap-2">
            {(
              [
                ["all", s.all, counts.all],
                ["attention", s.fAttention, counts.attention],
                ["unlimited", s.fUnlimited, counts.unlimited],
                ["tokens", s.fTokens, counts.tokens],
                ["nfts", s.fNfts, counts.nfts],
              ] as const
            ).map(([key, label, count]) => (
              <Pill key={key} active={filter === key} onClick={() => setFilter(key)}>
                {fill(label!, { count })}
              </Pill>
            ))}
            {report.chains.length > 1 && (
              <>
                <Pill active={chainFilter === "all"} onClick={() => setChainFilter("all")}>
                  {s.allChains}
                </Pill>
                {report.chains.map((c) => (
                  <Pill key={c.chain} active={chainFilter === c.chain} onClick={() => setChainFilter(c.chain)}>
                    {chainInfo(c.chain)?.name ?? c.chain}
                  </Pill>
                ))}
              </>
            )}
          </div>

          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <h3 className="text-sm">
                <span className={cn("font-semibold", g.key === "attention" && "text-critical")}>
                  {fill(g.title!, { count: g.rows.length })}
                </span>
                <span className="text-muted-foreground"> · {g.note}</span>
              </h3>
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="hidden gap-3 border-b bg-muted px-4 py-2 text-xs text-muted-foreground lg:grid lg:grid-cols-[3fr_4fr_3fr_2fr_2fr_auto]">
                  <span>{s.colToken}</span>
                  <span>{s.colSpender}</span>
                  <span>{s.colAllowance}</span>
                  <span>{s.colAtRisk}</span>
                  <span>{s.colLast}</span>
                  <span className="sr-only">{s.revoke}</span>
                </div>
                <ul>
                  {g.rows.map((r) => (
                    <ApprovalRow
                      key={r.id}
                      row={r}
                      s={s}
                      locale={locale}
                      chain={chainInfo(r.chain)}
                      tokenPath={tokenPath}
                      addressPath={addressPath}
                      canRevoke={isOwner}
                      onRevoke={() => startRevoke([r])}
                    />
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">{s.howTitle}</span> {s.how}
        </p>
        <p>{s.howSafety}</p>
        <p>{s.batchNote}</p>
      </div>

      {queue && (
        <RevokeDialog
          queue={queue}
          strings={s}
          locale={locale}
          onRevoked={(id) => setRevoked((prev) => new Set(prev).add(id))}
          onClose={() => {
            setQueue(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "danger" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-xl font-semibold tabular-nums", tone === "danger" && "text-critical")}>{value}</dd>
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

/** A non-zero amount that rounds to 0 shows as "< 0.0001". */
function tinyOr(formatted: string, locale: string): string {
  return /^[0.,\s]+$/.test(formatted) ? `< ${(0.0001).toLocaleString(locale)}` : formatted;
}

/** Permit2 deployments, by address (product names are not translated). */
const PERMIT2_NAMES: Record<string, string> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
  "0x31c2f6fcff4f8759b3bd5bf0e1084a055615c768": "PancakeSwap Permit2",
};

const riskTone: Record<RatedApproval["risk"], string> = {
  malicious: "bg-critical/8 text-critical",
  high: "bg-critical/8 text-critical",
  check: "bg-high/14 text-high",
  known: "bg-low/14 text-low",
  normal: "bg-muted text-muted-foreground",
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", className)}>{children}</span>;
}

function ApprovalRow({
  row: r,
  s,
  locale,
  chain,
  tokenPath,
  addressPath,
  canRevoke,
  onRevoke,
}: {
  row: Row;
  s: ApprovalsStrings;
  locale: string;
  chain: ApprovalsChainInfo | undefined;
  tokenPath: string;
  addressPath: string;
  canRevoke: boolean;
  onRevoke: () => void;
}) {
  const decimals = r.token.decimals;
  const hold =
    r.balance === null
      ? s.holdUnknown!
      : r.kind === "nft-all"
        ? fill(s.youHoldNfts!, { count: Number(r.balance).toLocaleString(locale) })
        : decimals === null
          ? s.holdUnknown!
          : fill(s.youHold!, { amount: formatAmount(r.balance, decimals, locale, 4) });
  const spenderKind =
    r.spender.type === "wallet"
      ? s.spenderWallet
      : r.spender.type === "delegated"
        ? s.spenderDelegated
        : r.spender.type === null
          ? s.spenderUnreadable
          : (r.spender.name ?? s.spenderContract);
  const permit2Name = PERMIT2_NAMES[r.permit2?.toLowerCase() ?? ""] ?? "Permit2";
  const spenderTitle =
    r.kind === "permit2" ? fill(s.viaPermit2!, { permit2: permit2Name, name: spenderKind! }) : spenderKind;
  const riskLabel = {
    malicious: s.badgeMalicious,
    high: s.badgeHigh,
    check: s.badgeCheck,
    known: s.badgeKnown,
    normal: s.badgeNormal,
  }[r.risk];
  const allowance =
    r.kind === "nft-all"
      ? s.allItems
      : r.unlimited
        ? s.unlimited
        : decimals !== null && r.allowance !== null
          ? `${tinyOr(formatAmount(r.allowance, decimals, locale, 4), locale)} ${r.token.symbol}`
          : r.allowance;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const last = r.lastChange;
  const days = Math.max(0, Math.round(((r.lastChange?.at ?? 0) - (r.spender.createdAt ?? 0)) / 86_400));
  const reasonText: Record<NonNullable<RatedApproval["reason"]>, string> = {
    malicious: fill(s.reasonMalicious!, { symbol: r.token.symbol }),
    wallet: s.reasonWallet!,
    disputed: fill(s.reasonDisputed!, { name: r.spender.name ?? "" }),
    newContract: fill(s.reasonNewContract!, { days }),
    unknownContract: s.reasonUnknownContract!,
    unreadable: s.reasonUnreadable!,
    spamToken: s.reasonSpamToken!,
    unused: fill(s.reasonUnused!, { symbol: r.token.symbol }),
  };
  const reason = r.reason ? reasonText[r.reason] : null;

  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-[3fr_4fr_3fr_2fr_2fr_auto]">
        <div className="flex min-w-0 flex-col">
          <Link
            href={`${tokenPath}/${r.chain}/${r.token.address}`}
            prefetch={false}
            className="truncate font-semibold hover:underline"
          >
            {r.token.symbol}
            <span className="ms-1 text-xs font-normal text-muted-foreground">{chain?.name}</span>
          </Link>
          <span className="text-xs text-muted-foreground">{hold}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm">{spenderTitle}</span>
          <span className="flex flex-wrap gap-1">
            <Badge className={riskTone[r.risk]}>{riskLabel}</Badge>
            {r.spender.type === "contract" && r.spender.sourceVerified === true && (
              <Badge className="bg-muted text-muted-foreground">{s.badgeSourceVerified}</Badge>
            )}
            {r.spender.type === "contract" && r.spender.sourceVerified === false && (
              <Badge className="bg-high/14 text-high">{s.badgeSourceMissing}</Badge>
            )}
            {r.spender.goplus?.doubt && !r.spender.goplus.malicious && (
              <Badge className="bg-high/14 text-high">{s.badgeGoplusDoubt}</Badge>
            )}
            {r.reason === "disputed" && <Badge className="bg-high/14 text-high">{s.badgeDisputed}</Badge>}
            {r.reason === "newContract" && <Badge className="bg-high/14 text-high">{s.badgeNewContract}</Badge>}
            {r.unused && <Badge className="bg-muted text-muted-foreground">{s.badgeUnused}</Badge>}
            {r.spamToken && <Badge className="bg-muted text-muted-foreground">{s.badgeSpam}</Badge>}
          </span>
          {!r.spender.name && r.spender.goplusName && (
            <span className="text-xs text-muted-foreground">{fill(s.goplusName!, { name: r.spender.goplusName })}</span>
          )}
          <Link
            href={`${addressPath}/${r.spender.address}`}
            prefetch={false}
            className="technical text-xs text-muted-foreground hover:underline"
          >
            {shortenId(r.spender.address)}
          </Link>
        </div>
        {/* Phone: allowance, value and date side by side; wider screens: table cells. */}
        <div className="grid grid-cols-3 gap-2 sm:contents">
          <div className="flex min-w-0 flex-col text-sm">
            <span className={cn("break-all", r.unlimited && "font-semibold")}>{allowance}</span>
            {r.kind === "token" && r.unlimited && (
              <span className="text-xs text-muted-foreground">{s.unlimitedNote}</span>
            )}
            {r.kind === "permit2" && r.expiresAt && (
              <span className="text-xs text-muted-foreground">
                {fill(s.expires!, { date: dateFmt.format(r.expiresAt * 1000) })}
              </span>
            )}
          </div>
          <div className="min-w-0 text-sm tabular-nums break-all">
            {r.kind === "nft-all"
              ? r.balance !== null
                ? fill(s.nftCount!, { count: r.balance })
                : "—"
              : r.atRiskUsd !== null
                ? formatUsd(r.atRiskUsd, locale)
                : s.noPrice}
          </div>
          <div className="flex flex-col text-xs text-muted-foreground">
            <span>{last?.at ? dateFmt.format(last.at * 1000) : s.unknownDate}</span>
            {last?.tx && (
              <Link
                href={`${tokenPath.replace(/\/token$/, "/tx")}/${last.tx}`}
                prefetch={false}
                className="technical hover:underline"
              >
                {fill(s.tx!, { hash: shortenId(last.tx, 4, 2) })}
              </Link>
            )}
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={onRevoke}
            title={canRevoke ? undefined : s.connectToRevoke}
            className={cn(
              buttonVariants({ variant: r.attention ? "default" : "outline", size: "sm" }),
              r.attention && "bg-critical",
            )}
          >
            {s.revoke}
          </button>
        </div>
      </div>
      {reason && (
        <p className={cn("rounded-lg px-3 py-2 text-xs", r.attention ? "bg-critical/8" : "bg-muted")}>{reason}</p>
      )}
    </li>
  );
}
