import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import {
  ArrowDownUp,
  ArrowRight,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  FileCode2,
  Flame,
  Info,
  KeyRound,
  Layers,
  Send,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";
import { ChainIcon } from "@/components/chain-icon";
import type { ChainConfig } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import type { TxDetails } from "@/lib/chains/types";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import { localePath } from "@/lib/routes";
import type { EvidenceLevel } from "@/lib/tx/assets";
import type { AssetAmount, Evidence, Interpretation, Party } from "@/lib/tx/interpret";
import { buildRoute } from "@/lib/tx/route";
import { cn } from "@/lib/utils";
import { eventTopics, protocolTopics } from "@/server/chains/evm/tx-logs";
import { CopyText, LocalTime } from "./tx-client";
import { formatSmall } from "./tx-sections";

type T = Awaited<ReturnType<typeof getTranslations>>;

export interface StoryContext {
  tx: TxDetails;
  it: Interpretation;
  chain: ChainConfig;
  locale: Locale;
  t: T;
  explorerName: string;
}

/** Blocks after which we call a transaction final (conservative; Ethereum ≈ 2 epochs, BNB Chain fast finality + margin). */
const FINAL_AFTER: Record<string, number> = { ethereum: 64, bsc: 15 };
/** Typical seconds per block, for the pending explanation. */
const BLOCK_SECONDS: Record<string, number> = { ethereum: 12, bsc: 1 };

const s = (t: T, key: string, values?: Record<string, string | number>) => t(`entity.tx.story.${key}`, values);

// ---------- formatting ----------

export function partyLabel(party: Party | null | undefined): string {
  if (!party) return "";
  return party.known?.name ?? shortenId(party.address);
}

function tokenSymbol(ctx: StoryContext, token: string | undefined): string {
  if (!token) return "";
  const info = ctx.tx.tokens[token.toLowerCase()];
  return info?.symbol || info?.name || shortenId(token);
}

export function formatAsset(ctx: StoryContext, asset: AssetAmount | undefined): string {
  if (!asset) return "";
  const { locale, t } = ctx;
  const symbol = asset.token === "native" ? ctx.chain.nativeSymbol : asset.symbol || shortenId(asset.token);
  if (asset.standard === "erc721") return `${s(t, "nft", { id: shortenId(asset.tokenId ?? "", 8, 4) })} ${symbol}`;
  const amount =
    asset.decimals === null
      ? s(t, "units", { amount: asset.raw })
      : `${formatSmall(asset.raw, asset.decimals, locale)}`;
  if (asset.standard === "erc1155")
    return `${amount} × ${s(t, "nft", { id: shortenId(asset.tokenId ?? "", 8, 4) })} ${symbol}`;
  return `${amount} ${symbol}`;
}

/** USD value, preferring the price at the transaction's block. Never mixes the two sources. */
export function usdOfAsset(ctx: StoryContext, asset: AssetAmount): number | null {
  if (asset.decimals === null || asset.standard === "erc721" || asset.standard === "erc1155") return null;
  const prices = ctx.tx.pricesAtTx ?? ctx.tx.prices;
  const price = prices[asset.token === "native" ? "native" : asset.token.toLowerCase()];
  if (price === undefined) return null;
  return (Number(BigInt(asset.raw)) / 10 ** asset.decimals) * price;
}

export function usdText(value: number, locale: string): string {
  return value > 0 && value < 0.01 ? `< ${formatUsd(0.01, locale)}` : formatUsd(value, locale);
}

function nativeUsd(ctx: StoryContext, raw: string | null): number | null {
  if (raw === null) return null;
  return usdOfAsset(ctx, { token: "native", standard: "native", raw, decimals: 18, symbol: ctx.chain.nativeSymbol });
}

export function feeText(ctx: StoryContext): string | null {
  const { tx, chain, locale } = ctx;
  if (tx.fee === null) return null;
  const coin = `${formatSmall(tx.fee, 18, locale)} ${chain.nativeSymbol}`;
  const usd = nativeUsd(ctx, tx.fee);
  return usd !== null ? `${usdText(usd, locale)} (${coin})` : coin;
}

function priceLabel(ctx: StoryContext) {
  return s(ctx.t, ctx.tx.pricesAtTx ? "usd.atTx" : "usd.today");
}

// ---------- headline ----------

function approvalMain(ctx: StoryContext) {
  return ctx.tx.approvals.find((a) => !a.revoke) ?? ctx.tx.approvals[0];
}

export function intentText(ctx: StoryContext): string {
  const { it, t } = ctx;
  const v = it.values;
  const values = {
    amount: formatAsset(ctx, v.amount),
    to: partyLabel(v.to),
    spender: partyLabel(v.spender),
    token: tokenSymbol(ctx, v.token),
    fn: v.fn ?? "",
  };
  const key =
    it.kind === "native-send" ||
    it.kind === "token-send" ||
    it.kind === "approval" ||
    it.kind === "revoke" ||
    it.kind === "swap" ||
    it.kind === "creation" ||
    it.kind === "contract-call"
      ? it.kind
      : "unknown-call";
  return s(t, `intent.${key}`, values);
}

export function headlineText(ctx: StoryContext): { title: string; sub: string } {
  const { tx, it, t } = ctx;
  const v = it.values;
  const fee = feeText(ctx);
  const from = partyLabel(v.from) || shortenId(tx.from);
  const values: Record<string, string | number> = {
    amount: formatAsset(ctx, v.amount),
    to: partyLabel(v.to),
    from,
    spender: partyLabel(v.spender),
    token: tokenSymbol(ctx, v.token),
    fn: v.fn ?? "",
    out: formatAsset(ctx, v.amountOut),
    in: formatAsset(ctx, v.amountIn),
    poolOut: formatAsset(ctx, v.poolOut),
    via: v.via ?? "",
    outCount: v.outCount ?? 0,
    inCount: v.inCount ?? 0,
    actor: shortenId(tx.from),
  };

  if (tx.status === "pending") {
    const seconds = BLOCK_SECONDS[ctx.chain.key];
    const sub = [s(t, "sub.pending", { intent: intentText(ctx) })];
    if (seconds) sub.push(s(t, "sub.pendingTime", { chain: t(`chains.${ctx.chain.key}`), seconds }));
    return { title: s(t, "headline.pending"), sub: sub.join(" ") };
  }
  if (tx.status === "reverted") {
    return {
      title: s(t, "headline.failed", { intent: intentText(ctx) }),
      sub: fee ? s(t, "sub.failed", { fee }) : s(t, "sub.failedNoFee"),
    };
  }

  let titleKey: string = it.kind;
  let subKey: string = it.kind;
  if (it.kind === "token-send" && v.from && v.from.address.toLowerCase() !== tx.from.toLowerCase()) {
    titleKey = subKey = "token-move";
  }
  if (it.kind === "swap" && ((v.outCount ?? 1) > 1 || (v.inCount ?? 1) > 1)) titleKey = subKey = "swapMany";
  if (it.kind === "swap" && !v.amountIn) titleKey = subKey = v.via ? "swapPartialVia" : "swapPartial";
  if (it.kind === "approval") {
    const main = approvalMain(ctx);
    titleKey =
      main?.kind === "all"
        ? "approvalAll"
        : v.unlimited
          ? "approvalUnlimited"
          : v.amount
            ? "approval"
            : "approvalNoAmount";
  }
  const sub = [s(t, `sub.${subKey}`, values)];
  if (it.kind === "swap" && v.amountIn) {
    if (v.via) sub.push(s(t, "sub.via", { dex: v.via }));
    if (v.app) sub.push(s(t, "sub.app", { app: v.app }));
    const fee = buildRoute(tx, it.set, ctx.chain.nativeSymbol)?.side.find((e) => e.possibleFee);
    if (fee) sub.push(s(t, "sub.possibleFee", { amount: formatAsset(ctx, fee.asset), to: shortenId(fee.to) }));
  }
  if (it.kind === "contract-call" || it.kind === "unknown-call") {
    sub.push(v.movements ? s(t, "sub.movements", { count: v.movements }) : s(t, "sub.noMovements"));
  }
  if (fee && tx.fee !== "0") sub.push(s(t, "sub.fee", { fee }));
  return { title: s(t, `headline.${titleKey}`, values), sub: sub.join(" ") };
}

/** Plain text for "Copy summary" and the text report. No private data: only public chain facts. */
export function summaryText(ctx: StoryContext, url: string): string {
  const { tx, t, chain } = ctx;
  const { title, sub } = headlineText(ctx);
  const time =
    tx.timestamp !== null ? `${new Date(tx.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC` : "—";
  return [
    title,
    sub,
    "",
    `${s(t, "flow.from")}: ${tx.from}`,
    `${s(t, "flow.to")}: ${tx.to ?? tx.createdContract ?? "—"}`,
    `${t("entity.tx.chain")}: ${t(`chains.${chain.key}`)}`,
    `${s(t, "cost.time")}: ${time}`,
    `${t("entity.tx.facts.fee")}: ${feeText(ctx) ?? "—"}`,
    `${s(t, "advanced.hash")}: ${tx.hash}`,
    url,
  ].join("\n");
}

// ---------- small pieces ----------

const levelTone: Record<EvidenceLevel, string> = {
  chain: "border-low/40 text-low",
  protocol: "border-low/40 text-low",
  event: "border-primary/40 text-primary",
  reported: "border-primary/40 text-primary",
  interpreted: "border-high/40 text-high",
  unknown: "border-border text-muted-foreground",
};

export function LevelChip({ ctx, level, label }: { ctx: StoryContext; level: EvidenceLevel; label?: string }) {
  return (
    <span
      title={ctx.t(`entity.tx.story.level.${level}Tip`)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4",
        levelTone[level],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? ctx.t(`entity.tx.story.level.${level}`)}
    </span>
  );
}

const evidenceTone: Record<Evidence, string> = {
  confirmed: "border-low/40 text-low",
  decoded: "border-primary/40 text-primary",
  reported: "border-primary/40 text-primary",
  likely: "border-high/40 text-high",
  unknown: "border-border text-muted-foreground",
};

export function EvidenceChip({ level, label }: { level: Evidence; label: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", evidenceTone[level])}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Tip({ text }: { text: string }) {
  return (
    <span title={text} className="ms-1 inline-flex align-[-3px] text-muted-foreground">
      <Info className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function Box({
  title,
  icon: Icon,
  right,
  className,
  children,
  id,
}: {
  title: string;
  icon: typeof Info;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon className="size-[18px] text-primary" aria-hidden="true" />
        <h2 id={id} className="font-sans text-base font-semibold">
          {title}
        </h2>
        {right && <span className="ms-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function AssetChip({ ctx, asset, muted = false }: { ctx: StoryContext; asset: AssetAmount; muted?: boolean }) {
  const usd = usdOfAsset(ctx, asset);
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
      {asset.token === "native" ? (
        <ChainIcon chain={ctx.chain.key} size={18} />
      ) : (
        <Layers className="size-4 shrink-0 text-primary" aria-hidden="true" />
      )}
      <bdi className={cn("truncate font-semibold tabular-nums", muted && "text-muted-foreground")}>
        {formatAsset(ctx, asset)}
      </bdi>
      {usd !== null && !muted && <span className="text-xs text-muted-foreground">{usdText(usd, ctx.locale)}</span>}
    </span>
  );
}

// ---------- headline card ----------

const kindIcon: Record<string, typeof Info> = {
  swap: ArrowDownUp,
  approval: KeyRound,
  revoke: KeyRound,
  creation: Sparkles,
  mint: Sparkles,
  burn: Flame,
  "contract-call": FileCode2,
  "unknown-call": FileCode2,
};

export function StoryHeadline(ctx: StoryContext) {
  const { tx, it, t, chain } = ctx;
  const { title, sub } = headlineText(ctx);
  const tone =
    tx.status === "reverted" ? "bad" : tx.status === "pending" ? "wait" : it.kind === "approval" ? "info" : "ok";
  const Icon = tx.status === "reverted" ? CircleX : tx.status === "pending" ? Clock : (kindIcon[it.kind] ?? Send);
  const kindLabel = s(t, `kinds.${it.kind}`);
  const evidence: { level: Evidence; label: string } =
    tx.status === "pending"
      ? { level: "confirmed", label: s(t, "evidence.seen") }
      : tx.status === "reverted"
        ? { level: "confirmed", label: s(t, "evidence.confirmed") }
        : { level: it.evidence, label: s(t, `evidence.${it.evidence}`) };
  return (
    <section
      aria-labelledby="tx-headline"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:p-6",
        tone === "ok" && "border-low/35 bg-low/5",
        tone === "bad" && "border-critical/35 bg-critical/6",
        tone === "wait" && "border-high/40 bg-high/6",
        tone === "info" && "border-primary/35 bg-primary/5",
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-xl",
          tone === "ok" && "bg-low/15 text-low",
          tone === "bad" && "bg-critical/15 text-critical",
          tone === "wait" && "bg-high/15 text-high",
          tone === "info" && "bg-primary/15 text-primary",
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium",
              tx.status === "success" && "bg-low/15 text-low",
              tx.status === "reverted" && "bg-critical/15 text-critical",
              tx.status === "pending" && "bg-high/15 text-high",
            )}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {s(t, `status.${tx.status}`)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5">
            <ChainIcon chain={chain.key} size={14} />
            {t(`chains.${chain.key}`)}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5">
            {tx.status === "success" ? kindLabel : s(t, "attempted", { kind: kindLabel })}
          </span>
          <WhenText ctx={ctx} />
          <span className="sm:ms-auto">
            <EvidenceChip {...evidence} />
          </span>
        </div>
        <h1 id="tx-headline" className="text-2xl leading-tight font-bold text-balance sm:text-[28px]">
          <bdi>{title}</bdi>
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          <bdi>{sub}</bdi>
        </p>
      </div>
    </section>
  );
}

function WhenText({ ctx }: { ctx: StoryContext }) {
  const { tx, t, locale } = ctx;
  if (tx.status === "pending") {
    const time = new Intl.DateTimeFormat(locale, { timeStyle: "medium", timeZone: "UTC" }).format(
      new Date(tx.checkedAt),
    );
    return <span className="text-muted-foreground">{s(t, "pending.checked", { time: `${time} UTC` })}</span>;
  }
  if (tx.timestamp === null) return null;
  const utc = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(
    new Date(tx.timestamp * 1000),
  );
  return (
    <span className="text-muted-foreground">
      {relativeTime(tx.timestamp, locale)} · <LocalTime timestamp={tx.timestamp} template={s(t, "cost.yourTime")} />{" "}
      {s(t, "utc", { time: utc })}
    </span>
  );
}

export function relativeTime(timestamp: number, locale: string): string {
  const seconds = Math.round(timestamp - Date.now() / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(seconds, "second");
}

// ---------- flow ----------

function PartyCard({
  ctx,
  role,
  party,
  highlight = false,
}: {
  ctx: StoryContext;
  role: string;
  party: Party | null;
  highlight?: boolean;
}) {
  const { t, locale } = ctx;
  if (!party) return null;
  const isContract = party.isContract;
  const name =
    party.known?.name ??
    (isContract === true ? s(t, "flow.contract") : isContract === false ? s(t, "flow.wallet") : s(t, "flow.address"));
  const Icon = isContract ? FileCode2 : User;
  return (
    <div className={cn("min-w-0 rounded-xl border bg-card p-4", highlight && "border-primary")}>
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{role}</p>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="flex items-center gap-1.5">
            <Link
              href={localePath(locale, `/address/${party.address}`)}
              prefetch={false}
              className="technical text-[13px] text-primary hover:underline"
              title={party.address}
              dir="ltr"
            >
              {shortenId(party.address)}
            </Link>
            <CopyText
              text={party.address}
              label={s(t, "flow.copy")}
              copiedLabel={t("entity.copied")}
              iconOnly
              className="inline-flex text-muted-foreground hover:text-foreground"
            />
          </p>
        </div>
      </div>
      {isContract !== null && (
        <span
          className={cn(
            "mt-3 inline-block rounded px-2 py-0.5 text-xs",
            isContract ? "bg-high/14 text-high" : "bg-low/14 text-low",
          )}
        >
          {isContract ? (party.known ? s(t, "flow.known") : s(t, "flow.contract")) : s(t, "flow.wallet")}
        </span>
      )}
    </div>
  );
}

function Arrow({
  tone = "primary",
  dashed = false,
  reverse = false,
}: {
  tone?: "primary" | "low" | "high" | "muted";
  dashed?: boolean;
  reverse?: boolean;
}) {
  const color = { primary: "text-primary", low: "text-low", high: "text-high", muted: "text-muted-foreground" }[tone];
  return (
    <span aria-hidden="true" className={cn("flex w-full items-center", color, reverse && "flex-row-reverse")}>
      <span className={cn("h-0 flex-1 border-t-2", dashed ? "border-dashed" : "border-solid", "border-current")} />
      <ArrowRight className={cn("-ms-1 size-4", reverse ? "rotate-180 rtl:rotate-0" : "rtl:rotate-180")} />
    </span>
  );
}

function Middle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-2 py-2 md:px-6">{children}</div>
  );
}

function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-center text-xs text-muted-foreground", className)}>{children}</span>;
}

export function StoryFlow(ctx: StoryContext) {
  const { tx, it, t } = ctx;
  const flow = it.flow;
  const failed = tx.status === "reverted";
  const pending = tx.status === "pending";
  const roles: Record<string, [string, string]> = {
    transfer: failed ? [s(t, "flow.triedFrom"), s(t, "flow.intendedTo")] : [s(t, "flow.from"), s(t, "flow.to")],
    exchange: [s(t, "flow.sender"), s(t, "flow.through")],
    permission: [s(t, "flow.owner"), s(t, "flow.spender")],
    creation: [s(t, "flow.sender"), s(t, "flow.newContract")],
    call: [s(t, "flow.from"), s(t, "flow.to")],
    self: [s(t, "flow.sender"), ""],
  };
  const [leftRole, rightRole] = roles[flow.mode]!;
  const chips = (assets: AssetAmount[], muted = false) => (
    <span className="flex max-w-full flex-wrap justify-center gap-2">
      {assets.slice(0, 4).map((asset, i) => (
        <AssetChip key={i} ctx={ctx} asset={asset} muted={muted} />
      ))}
    </span>
  );

  let middle: React.ReactNode;
  if (flow.mode === "exchange" && !failed && !pending) {
    middle = (
      <Middle>
        <div className="flex w-full flex-col items-center gap-1.5">
          <Caption>{s(t, "flow.sent")}</Caption>
          {chips(flow.out)}
          <Arrow />
        </div>
        <div className="flex w-full flex-col items-center gap-1.5">
          <Arrow tone="low" reverse />
          {flow.back.length > 0 && chips(flow.back)}
          <Caption>{s(t, "flow.receivedBack")}</Caption>
        </div>
      </Middle>
    );
  } else if (flow.mode === "permission") {
    const main = approvalMain(ctx);
    const symbol = tokenSymbol(ctx, it.values.token);
    const label =
      main?.kind === "all"
        ? s(t, "approval.all")
        : it.values.unlimited
          ? `${s(t, "flow.unlimited")} ${symbol}`
          : formatAsset(ctx, it.values.amount) || symbol;
    middle = (
      <Middle>
        <div className="flex w-full flex-col items-center gap-1.5">
          <Caption>{s(t, "flow.permission")}</Caption>
          <span className="rounded-lg border border-high/40 bg-background px-3 py-1.5 font-semibold text-high">
            <bdi>{label}</bdi>
          </span>
          <Arrow tone="high" dashed />
          <Caption>{s(t, "flow.permissionOnly")}</Caption>
        </div>
      </Middle>
    );
  } else if (flow.mode === "creation") {
    middle = (
      <Middle>
        <Caption>{s(t, "flow.created")}</Caption>
        <Arrow />
      </Middle>
    );
  } else if (flow.mode === "self") {
    middle = (
      <Middle>
        <Caption>{s(t, "flow.self")}</Caption>
      </Middle>
    );
  } else {
    middle = (
      <Middle>
        <div className="flex w-full flex-col items-center gap-1.5">
          <Caption>
            {failed
              ? s(t, "flow.triedToMove")
              : flow.mode === "call"
                ? (it.values.fn ?? s(t, "flow.calls"))
                : s(t, "flow.sent")}
          </Caption>
          {flow.out.length > 0 && chips(flow.out, failed)}
          <Arrow tone={failed ? "muted" : pending ? "high" : "primary"} dashed={failed || pending} />
          {failed && (
            <Caption className="flex items-center gap-1.5 text-critical">
              <CircleX className="size-3.5" aria-hidden="true" />
              {s(t, "flow.stoppedBy", { name: partyLabel(flow.right ?? undefined) || shortenId(tx.to ?? "") })}
            </Caption>
          )}
          {pending && <Caption>{s(t, "flow.afterConfirm")}</Caption>}
        </div>
        {!failed && !pending && flow.back.length > 0 && (
          <div className="flex w-full flex-col items-center gap-1.5">
            <Arrow tone="low" reverse />
            {chips(flow.back)}
            <Caption>{s(t, "flow.receivedBack")}</Caption>
          </div>
        )}
      </Middle>
    );
  }

  return (
    <section
      aria-label={s(t, "flow.label")}
      className="flex flex-col items-stretch gap-3 rounded-2xl border bg-background p-4 md:flex-row md:items-center md:p-5"
    >
      <div className="md:w-72 md:shrink-0">
        <PartyCard
          ctx={ctx}
          role={leftRole}
          party={flow.left}
          highlight={flow.left.address.toLowerCase() === tx.from.toLowerCase()}
        />
      </div>
      {middle}
      {flow.right && (
        <div className="md:w-72 md:shrink-0">
          <PartyCard ctx={ctx} role={rightRole} party={flow.right} />
        </div>
      )}
    </section>
  );
}

// ---------- progress ----------

export function StoryProgress(ctx: StoryContext) {
  const { tx, t, chain, locale } = ctx;
  const failed = tx.status === "reverted";
  const pending = tx.status === "pending";
  const confirmations = tx.confirmations ?? 0;
  const final = confirmations >= (FINAL_AFTER[chain.key] ?? 32);
  const steps = [
    {
      title: s(t, "progress.sent"),
      sub: pending ? s(t, "progress.seen") : s(t, "progress.sentBy", { from: shortenId(tx.from) }),
      state: "done",
    },
    {
      title: s(t, "progress.included"),
      sub: tx.blockNumber
        ? s(t, "progress.block", { block: new Intl.NumberFormat(locale).format(BigInt(tx.blockNumber)) })
        : s(t, "progress.waiting"),
      state: pending ? "wait" : "done",
    },
    failed
      ? { title: s(t, "progress.failed"), sub: s(t, "progress.reverted"), state: "bad" }
      : {
          title: s(t, "progress.final"),
          sub: pending ? "—" : s(t, "progress.confirmations", { count: confirmations }),
          state: pending ? "todo" : final ? "done" : "wait",
        },
  ];
  return (
    <section aria-label={s(t, "progress.label")} className="rounded-xl border bg-card px-5 py-4">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex flex-1 items-start gap-2.5">
            {step.state === "done" ? (
              <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-low" aria-hidden="true" />
            ) : step.state === "bad" ? (
              <CircleX className="mt-0.5 size-[18px] shrink-0 text-critical" aria-hidden="true" />
            ) : step.state === "wait" ? (
              <Clock className="mt-0.5 size-[18px] shrink-0 text-high" aria-hidden="true" />
            ) : (
              <span aria-hidden="true" className="mt-1 size-3 shrink-0 rounded-full border-2 border-border" />
            )}
            <span>
              <span className={cn("block text-sm font-semibold", step.state === "todo" && "text-muted-foreground")}>
                {step.title}
              </span>
              <span className="block text-xs text-muted-foreground">{step.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- boxes ----------

export function StoryChanges(ctx: StoryContext) {
  const { tx, it, t, chain, locale } = ctx;
  if (tx.status !== "success" || it.changes.length === 0) return null;
  const fee = tx.fee && tx.fee !== "0" ? tx.fee : null;
  const measured = it.changes.some((c) => c.asset.token === "native" && c.evidence === "chain" && tx.nativeBalance);
  const reported = it.changes.some((c) => c.evidence === "reported");
  return (
    <Box id="tx-changes" title={s(t, "changes.title", { wallet: shortenId(it.focus) })} icon={Wallet}>
      <ul className="divide-y border-t">
        {it.changes.map((change, i) => {
          const usd = usdOfAsset(ctx, change.asset);
          return (
            <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
              {change.asset.token === "native" ? (
                <ChainIcon chain={chain.key} size={20} />
              ) : (
                <Layers className="size-5 text-primary" aria-hidden="true" />
              )}
              {change.asset.token === "native" ? (
                <span>{chain.nativeSymbol}</span>
              ) : (
                <Link
                  href={localePath(locale, `/token/${chain.key}/${change.asset.token}`)}
                  prefetch={false}
                  className="min-w-0 truncate hover:underline"
                >
                  <bdi>{change.asset.symbol || shortenId(change.asset.token)}</bdi>
                </Link>
              )}
              <span
                dir="ltr"
                className={cn("ms-auto font-semibold tabular-nums", change.sign > 0 ? "text-low" : "text-critical")}
              >
                {change.sign > 0 ? "+" : "−"}
                {formatAsset(ctx, change.asset).replace(/\s\S+$/, "")}
              </span>
              <span className="w-24 text-end text-muted-foreground tabular-nums">
                {usd !== null ? usdText(usd, locale) : "—"}
              </span>
              <span className="hidden w-32 justify-end sm:flex">
                <LevelChip ctx={ctx} level={change.evidence} label={s(t, `changes.source.${change.evidence}`)} />
              </span>
            </li>
          );
        })}
        {fee && (
          <li className="flex items-center gap-3 py-2.5 text-sm text-muted-foreground">
            <ChainIcon chain={chain.key} size={20} />
            {s(t, "changes.fee")}
            <span dir="ltr" className="ms-auto tabular-nums">
              −{formatSmall(fee, 18, locale)} {chain.nativeSymbol}
            </span>
            <span className="w-24 text-end tabular-nums">
              {nativeUsd(ctx, fee) !== null ? usdText(nativeUsd(ctx, fee)!, locale) : "—"}
            </span>
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {s(t, measured ? "changes.noteMeasured" : reported ? "changes.noteReported" : "changes.note", {
          block: tx.blockNumber ?? "",
        })}{" "}
        ({priceLabel(ctx)})
      </p>
    </Box>
  );
}

export function StoryCost(ctx: StoryContext) {
  const { tx, t, chain, locale } = ctx;
  if (tx.status === "pending") {
    const limit = BigInt(tx.gasLimit);
    const price = tx.gasPrice ? BigInt(tx.gasPrice) : null;
    if (price === null) return null;
    const max = (limit * price).toString();
    const usd = nativeUsd(ctx, max);
    return (
      <Box
        id="tx-cost"
        title={s(t, "cost.estimateTitle")}
        icon={Flame}
        right={<EvidenceChip level="likely" label={s(t, "evidence.estimate")} />}
      >
        <p className="text-2xl font-bold">
          {usd !== null
            ? s(t, "cost.upTo", { usd: usdText(usd, locale) })
            : s(t, "cost.upToCoin", { amount: `${formatSmall(max, 18, locale)} ${chain.nativeSymbol}` })}
          {usd !== null && (
            <span className="ms-2 text-sm font-medium text-muted-foreground">
              {formatSmall(max, 18, locale)} {chain.nativeSymbol}
            </span>
          )}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {s(t, "cost.estimateNote")}
          <Tip text={s(t, "cost.estimateTip")} />
        </p>
      </Box>
    );
  }
  const usd = nativeUsd(ctx, tx.fee);
  return (
    <Box id="tx-cost" title={s(t, "cost.title")} icon={Flame}>
      {tx.fee === "0" ? (
        <p className="text-sm">{s(t, "cost.free")}</p>
      ) : (
        <p className="text-2xl font-bold">
          <bdi>
            {usd !== null ? usdText(usd, locale) : `${formatSmall(tx.fee ?? "0", 18, locale)} ${chain.nativeSymbol}`}
          </bdi>
          {usd !== null && (
            <bdi className="ms-2 text-sm font-medium text-muted-foreground">
              {formatSmall(tx.fee ?? "0", 18, locale)} {chain.nativeSymbol}
            </bdi>
          )}
        </p>
      )}
      <p className="mt-1.5 text-sm text-muted-foreground">
        {s(t, "cost.networkFee")}
        <Tip text={s(t, "cost.tip")} />
      </p>
      {tx.status === "reverted" && <p className="mt-2 text-sm text-high">{s(t, "cost.failed")}</p>}
      {tx.timestamp !== null && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t pt-3 text-sm">
          <dt className="text-muted-foreground">{s(t, "cost.time")}</dt>
          <dd>
            <LocalTime timestamp={tx.timestamp} template={s(t, "cost.yourTime")} />
          </dd>
          <dt className="text-muted-foreground">{s(t, "cost.network")}</dt>
          <dd className="flex items-center gap-1.5">
            <ChainIcon chain={chain.key} size={14} />
            {t(`chains.${chain.key}`)}
          </dd>
        </dl>
      )}
    </Box>
  );
}

const helpFor = new Set(["balance", "allowance", "slippage", "deadline", "out-of-gas"]);

export function StoryFailure(ctx: StoryContext) {
  const { tx, it, t, locale } = ctx;
  const failure = it.failure;
  if (tx.status !== "reverted" || !failure) return null;
  const percent =
    tx.gasUsed !== null
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
          Number(tx.gasUsed) / Number(tx.gasLimit),
        )
      : "";
  const evidence: { level: Evidence; label: string } =
    failure.evidence === "decoded"
      ? { level: "decoded", label: s(t, "evidence.explained") }
      : failure.evidence === "likely"
        ? { level: "likely", label: s(t, "evidence.likely") }
        : { level: failure.evidence, label: s(t, `evidence.${failure.evidence}`) };
  return (
    <Box
      id="tx-why"
      title={s(t, "failure.title")}
      icon={CircleX}
      className="border-critical/40"
      right={<EvidenceChip {...evidence} />}
    >
      <p className="text-lg font-semibold">{s(t, `failure.${failure.category}.title`)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{s(t, `failure.${failure.category}.text`, { percent })}</p>
      {failure.raw && (
        <div className="mt-3 rounded-lg border bg-background px-3.5 py-2.5 text-sm">
          <p className="text-xs text-muted-foreground">{s(t, "failure.messageLabel")}</p>
          <p className="technical mt-1 break-all" dir="ltr">
            {failure.raw}
          </p>
        </div>
      )}
      {helpFor.has(failure.category) && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">{s(t, "failure.help")}</span> {s(t, `failure.${failure.category}Help`)}
        </p>
      )}
    </Box>
  );
}

export function StoryApproval(ctx: StoryContext) {
  const { tx, it, t, locale } = ctx;
  if (tx.status !== "success" || (it.kind !== "approval" && it.kind !== "revoke")) return null;
  const main = approvalMain(ctx);
  const when = tx.timestamp !== null ? relativeTime(tx.timestamp, locale) : "";
  return (
    <>
      <Box id="tx-approval-meaning" title={s(t, "approval.meaningTitle")} icon={Info}>
        <ul className="list-disc space-y-1.5 ps-5 text-sm">
          {it.kind === "revoke" ? (
            <li>{s(t, "approval.revoked")}</li>
          ) : (
            <>
              <li>{s(t, "approval.permission")}</li>
              <li>
                {main?.kind === "all"
                  ? s(t, "approval.all")
                  : it.values.unlimited
                    ? s(t, "approval.unlimited")
                    : s(t, "approval.limited", { amount: formatAsset(ctx, it.values.amount) })}
              </li>
              <li>{s(t, "approval.stays")}</li>
            </>
          )}
        </ul>
      </Box>
      {it.kind === "approval" && !it.set.permissions.some((g) => g.now !== null) && (
        <Box
          id="tx-approval-active"
          title={s(t, "approval.activeTitle")}
          icon={KeyRound}
          className="border-high/40"
          right={<EvidenceChip level="unknown" label={s(t, "evidence.notChecked")} />}
        >
          <p className="text-sm">{s(t, "approval.activeText", { when })}</p>
          <p className="mt-2 text-xs text-muted-foreground">{s(t, "approval.checker")}</p>
        </Box>
      )}
    </>
  );
}

export function StoryPending(ctx: StoryContext) {
  const { tx, t } = ctx;
  if (tx.status !== "pending") return null;
  const nonce = new Intl.NumberFormat(ctx.locale).format(tx.nonce);
  const state = tx.nonceUsed === null ? "unknown" : tx.nonceUsed ? "no" : "yes";
  return (
    <Box id="tx-pending" title={s(t, "pending.title")} icon={Eye}>
      <p className="flex gap-2 text-sm">
        {state === "yes" ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-low" aria-hidden="true" />
        ) : state === "no" ? (
          <CircleX className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        {s(t, `pending.${state}`, { nonce })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{s(t, "pending.note")}</p>
    </Box>
  );
}

export function StoryNotes(ctx: StoryContext) {
  const { tx, it, t } = ctx;
  const notes: string[] = [];
  const known = [it.flow.left, it.flow.right].find((p) => p?.known && p.known.kind !== "burn");
  if (known?.known) notes.push(s(t, "notes.known", { name: known.known.name }));
  if (it.kind === "native-send" && it.values.to?.isContract) notes.push(s(t, "notes.toContract"));
  if (it.kind === "burn") notes.push(s(t, "notes.burn"));
  if (it.kind === "self") notes.push(s(t, "notes.self"));
  if (it.kind === "unknown-call" && tx.status === "success" && tx.call) notes.push(s(t, "notes.unknownFn"));
  const nativeShown = it.changes.some((c) => c.asset.token === "native" && c.evidence !== "event");
  if (
    tx.status === "success" &&
    !nativeShown &&
    tx.nativeBalance === null &&
    (it.kind === "swap" || it.kind === "unwrap" || it.kind === "contract-call" || it.kind === "unknown-call")
  ) {
    notes.push(s(t, "notes.nativeMissing"));
  }
  if (it.changes.some((c) => c.evidence === "reported")) notes.push(s(t, "notes.reported"));
  if (tx.status !== "pending" && (it.changes.length > 0 || tx.fee)) {
    notes.push(s(t, tx.pricesAtTx ? "notes.pricesAtTx" : "notes.pricesToday"));
  }
  if (notes.length === 0) return null;
  return (
    <Box id="tx-notes" title={s(t, "notes.title")} icon={Info}>
      <ul className="list-disc space-y-1.5 ps-5 text-sm text-muted-foreground">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </Box>
  );
}

// ---------- advanced ----------

const eventNames: Record<string, string> = {
  [eventTopics.transfer]: "Transfer",
  [eventTopics.approval]: "Approval",
  [eventTopics.approvalForAll]: "ApprovalForAll",
  [eventTopics.transferSingle]: "TransferSingle",
  [eventTopics.transferBatch]: "TransferBatch",
  [eventTopics.deposit]: "Deposit",
  [eventTopics.withdrawal]: "Withdrawal",
  [protocolTopics.v2Swap]: "Swap (v2 pool)",
  [protocolTopics.v2Sync]: "Sync (v2 pool)",
  [protocolTopics.v2Mint]: "Mint (v2 pool)",
  [protocolTopics.v2Burn]: "Burn (v2 pool)",
  [protocolTopics.v3Swap]: "Swap (v3 pool)",
  [protocolTopics.pancakeV3Swap]: "Swap (v3 pool)",
  [protocolTopics.kyberSwapped]: "Swapped",
  [protocolTopics.kyberExchange]: "Exchange",
  [protocolTopics.kyberClientData]: "ClientData",
  [protocolTopics.safeSuccess]: "ExecutionSuccess",
  [protocolTopics.safeFailure]: "ExecutionFailure",
  [protocolTopics.userOperation]: "UserOperationEvent",
};

function Row({
  label,
  tip,
  children,
  mono = false,
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-t py-2.5 first:border-t-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">
        {label}
        {tip && <Tip text={tip} />}
      </dt>
      <dd className={cn("min-w-0 text-sm break-all", mono && "technical")} dir={mono ? "ltr" : undefined}>
        {children}
      </dd>
    </div>
  );
}

const gwei = (raw: string | null, locale: string) => (raw === null ? "—" : `${formatAmount(raw, 9, locale, 4)} gwei`);

export function AdvancedFacts(ctx: StoryContext) {
  const { tx, t, chain, locale, it } = ctx;
  const a = (key: string, values?: Record<string, string | number>) => s(t, `advanced.${key}`, values);
  const usd = nativeUsd(ctx, tx.fee);
  const toKnown = it.flow.right?.known?.name;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="adv-tx" className="rounded-xl border bg-card px-5 py-3">
        <h2 id="adv-tx" className="py-2 font-sans text-base font-semibold">
          {a("transaction")}
        </h2>
        <dl>
          <Row label={a("hash")} mono>
            {tx.hash}
          </Row>
          <Row label={a("chain")}>
            {a("chainValue", { name: t(`chains.${chain.key}`), id: tx.technical.chainId, caip: chain.caip2 })}
          </Row>
          <Row label={a("block")} mono>
            {tx.blockNumber ? new Intl.NumberFormat(locale).format(BigInt(tx.blockNumber)) : "—"}
          </Row>
          {tx.technical.blockHash && (
            <Row label={a("blockHash")} mono>
              {tx.technical.blockHash}
            </Row>
          )}
          {tx.technical.index !== null && (
            <Row label={a("index")} tip={a("indexTip")}>
              {tx.technical.index}
            </Row>
          )}
          {tx.timestamp !== null && (
            <Row label={s(t, "cost.time")}>
              {new Date(tx.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC
            </Row>
          )}
          <Row label={t("entity.tx.from")} mono>
            {tx.from}
          </Row>
          <Row label={t("entity.tx.to")} mono>
            {tx.to ?? t("entity.tx.contractCreation")}
            {toKnown && <span className="ms-2 font-sans text-muted-foreground">· {toKnown}</span>}
          </Row>
          {tx.createdContract && (
            <Row label={t("entity.tx.facts.created")} mono>
              {tx.createdContract}
            </Row>
          )}
          <Row label={t("entity.tx.facts.value")}>
            {formatSmall(tx.value, 18, locale)} {chain.nativeSymbol}
          </Row>
          <Row label={t("entity.tx.facts.nonce")} tip={a("nonceTip")}>
            {tx.nonce}
          </Row>
          <Row label={t("entity.tx.facts.type")}>
            {t.has(`entity.tx.types.${tx.type}`) ? t(`entity.tx.types.${tx.type}`) : tx.type}
          </Row>
        </dl>
      </section>
      <section aria-labelledby="adv-fees" className="rounded-xl border bg-card px-5 py-3">
        <h2 id="adv-fees" className="py-2 font-sans text-base font-semibold">
          {a("fees")}
        </h2>
        <dl>
          <Row label={t("entity.tx.facts.gasLimit")} tip={a("gasLimitTip")}>
            {new Intl.NumberFormat(locale).format(BigInt(tx.gasLimit))}
          </Row>
          {tx.gasUsed !== null && (
            <Row label={t("entity.tx.facts.gasUsed")} tip={a("gasUsedTip")}>
              {new Intl.NumberFormat(locale).format(BigInt(tx.gasUsed))} (
              {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
                Number(tx.gasUsed) / Number(tx.gasLimit),
              )}
              )
            </Row>
          )}
          {tx.technical.baseFee && (
            <Row label={a("baseFee")} tip={a("baseFeeTip")}>
              {gwei(tx.technical.baseFee, locale)}
            </Row>
          )}
          {tx.technical.priorityFee && (
            <Row label={a("priorityFee")} tip={a("priorityFeeTip")}>
              {gwei(tx.technical.priorityFee, locale)}
            </Row>
          )}
          <Row label={tx.status === "pending" ? t("entity.tx.facts.maxGasPrice") : a("effective")}>
            {gwei(tx.gasPrice, locale)}
          </Row>
          {tx.technical.maxFeePerGas && <Row label={a("maxFee")}>{gwei(tx.technical.maxFeePerGas, locale)}</Row>}
          {tx.technical.maxPriorityFeePerGas && (
            <Row label={a("maxPriority")}>{gwei(tx.technical.maxPriorityFeePerGas, locale)}</Row>
          )}
          {tx.burnt && (
            <Row label={t("entity.tx.facts.burnt")}>
              {formatSmall(tx.burnt, 18, locale)} {chain.nativeSymbol}
            </Row>
          )}
          <Row label={a("total")}>
            {tx.fee === null
              ? t("entity.tx.facts.pendingValue")
              : `${formatSmall(tx.fee, 18, locale)} ${chain.nativeSymbol}`}
            {usd !== null && (
              <span className="text-muted-foreground">
                {" "}
                · {usdText(usd, locale)} ({priceLabel(ctx)})
              </span>
            )}
          </Row>
        </dl>
      </section>
    </div>
  );
}

export function AdvancedEvents(ctx: StoryContext) {
  const { tx, t, locale, chain, explorerName, it } = ctx;
  if (tx.logCount === 0) return null;
  // The same actions the Simple view lists, so both views agree on what each event means.
  const explainedBy = new Map<number, string>();
  for (const action of it.set.actions)
    for (const index of action.logs) if (!explainedBy.has(index)) explainedBy.set(index, action.type);
  const a = (key: string, values?: Record<string, string | number>) => s(t, `advanced.${key}`, values);
  return (
    <section aria-labelledby="adv-events" className="flex flex-col gap-3">
      <h2 id="adv-events" className="flex items-baseline gap-2 font-sans text-lg font-semibold">
        {a("events")}{" "}
        <span className="text-sm font-normal text-muted-foreground">{a("eventsCount", { count: tx.logCount })}</span>
      </h2>
      <ol className="flex flex-col divide-y rounded-xl border bg-card">
        {tx.events.map((event) => {
          const name = eventNames[event.topics[0] ?? ""];
          const token = tx.tokens[event.address.toLowerCase()];
          return (
            <li key={event.index}>
              <details className="group px-4 py-2.5 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="w-10 text-muted-foreground tabular-nums">#{event.index}</span>
                  <span className={cn("w-36 font-medium", !name && "text-muted-foreground")}>
                    {name ?? a("notStandard")}
                  </span>
                  <Link
                    href={localePath(
                      locale,
                      token?.decimals != null ? `/token/${chain.key}/${event.address}` : `/address/${event.address}`,
                    )}
                    prefetch={false}
                    className="technical text-primary hover:underline"
                    dir="ltr"
                  >
                    {shortenId(event.address)}
                  </Link>
                  {token?.symbol && <span className="text-muted-foreground">{token.symbol}</span>}
                  <span className="ms-auto text-xs">
                    {explainedBy.has(event.index) ? (
                      <span className="text-low">{s(t, `actionLabel.${explainedBy.get(event.index)}`)}</span>
                    ) : (
                      <span className="text-muted-foreground">{s(t, "actions.notIdentified")}</span>
                    )}
                  </span>
                </summary>
                <dl className="mt-2 grid gap-1 ps-14 text-xs">
                  <dt className="text-muted-foreground">{a("topics")}</dt>
                  {event.topics.map((topic, i) => (
                    <dd key={i} className="technical break-all" dir="ltr">
                      [{i}] {topic}
                    </dd>
                  ))}
                  <dt className="mt-1 text-muted-foreground">
                    {a("data")} · {a("dataBytes", { count: event.dataBytes })}
                  </dt>
                  <dd className="technical break-all" dir="ltr">
                    {event.data}
                    {event.data.length < 2 + event.dataBytes * 2 && "…"}
                  </dd>
                </dl>
              </details>
            </li>
          );
        })}
      </ol>
      {tx.events.length < tx.logCount && (
        <p className="text-sm text-muted-foreground">
          {a("moreEvents", { count: tx.events.length, explorer: explorerName })}
        </p>
      )}
    </section>
  );
}
