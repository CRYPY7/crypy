import type { Metadata } from "next";
import { ChainIcon } from "@/components/chain-icon";
import { RecordVisit } from "@/components/recent/recent";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EntityHeader, EntitySkeleton, Notice } from "@/components/entity/entity-parts";
import { AutoRefresh } from "@/components/entity/auto-refresh";
import {
  FailureReason,
  TxApprovals,
  TxCall,
  TxFootnote,
  TxInput,
  TxOverview,
  TxSummary,
  TxTransfers,
  type TxView,
} from "@/components/entity/tx-sections";
import { getChain } from "@/config/chains";
import { isLocale } from "@/i18n/locales";
import { shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { pageRequestAllowed } from "@/server/page-guard";
import { cachedResolve, cachedTxDetails, explorerLink } from "@/server/services/lookups";

type Props = PageProps<"/[locale]/tx/[hash]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const t = await getTranslations("entity.tx");
  return { title: t("metaTitle", { short: shortenId(hash, 10, 6) }), robots: { index: false, follow: false } };
}

export default function TxPage(props: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Suspense fallback={<EntitySkeleton />}>
        <TxContent {...props} />
      </Suspense>
    </div>
  );
}

const statusStyle = {
  success: "bg-low/15 text-low",
  reverted: "bg-critical/15 text-critical",
  pending: "bg-high/15 text-high",
} as const;

async function TxContent({ params, searchParams }: Props) {
  const [{ hash }, query, locale] = await Promise.all([params, searchParams, localeParam()]);
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();

  if (!(await pageRequestAllowed())) return <Notice tone="warning">{t("entity.rateLimited")}</Notice>;

  const chainKey = typeof query.chain === "string" ? query.chain : undefined;
  const chain = chainKey ? getChain(chainKey) : undefined;

  // No (valid) chain in the URL: find it, then redirect to the canonical URL.
  if (!chain) {
    const result = await cachedResolve(hash).catch(() => null);
    if (result?.status === "tx" && result.target) redirect(localePath(locale, result.target));
    if (result?.status === "unavailable" || result === null) {
      return <Notice tone="warning">{t("search.result.unavailable")}</Notice>;
    }
    if (result.status === "invalid" || result.status === "bad-checksum") notFound();
    return <Notice tone="warning">{t("search.result.not-found-tx")}</Notice>;
  }

  let tx;
  try {
    tx = await cachedTxDetails(chain.key, hash);
  } catch {
    return <Notice tone="warning">{t("search.result.unavailable")}</Notice>;
  }
  const chainName = t(`chains.${chain.key}`);
  if (!tx) {
    return (
      <Notice tone="warning" title={t("entity.tx.notFound", { chain: chainName })}>
        {t("entity.tx.notFoundHelp")}{" "}
        <Link href={localePath(locale, `/search?q=${hash}`)} prefetch={false} className="text-primary hover:underline">
          {t("entity.tx.searchAll")}
        </Link>
      </Notice>
    );
  }

  const explorer = explorerLink(chain.key, "tx", tx.hash);
  const view: TxView = { tx, chain, locale, t, explorerName: chain.explorer.name };
  const relative = tx.timestamp !== null ? relativeTime(tx.timestamp, locale) : null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("entity.tx.title") },
          { label: shortenId(tx.hash), mono: true },
        ]}
      />
      <RecordVisit path={`/tx/${tx.hash}?chain=${chain.key}`} kind="tx" value={tx.hash} chain={chain.key} />
      {tx.status === "pending" && <AutoRefresh />}
      <EntityHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 font-medium text-foreground">
            <ChainIcon chain={chain.key} size={14} />
            {chainName}
          </span>
        }
        title={t("entity.tx.title")}
        id={tx.hash}
        copyLabel={t("entity.copy")}
        copiedLabel={t("entity.copied")}
        links={explorer ? [{ href: explorer, label: t("entity.viewOn", { explorer: chain.explorer.name }) }] : []}
      >
        <span className="flex flex-wrap items-center gap-3">
          <span className={cn("w-fit rounded-full px-3 py-1 text-sm font-semibold", statusStyle[tx.status])}>
            {t(`entity.tx.status.${tx.status}`)}
          </span>
          {relative && <span className="text-sm text-muted-foreground">{relative}</span>}
        </span>
      </EntityHeader>

      <TxSummary {...view} />
      <FailureReason {...view} />
      <TxOverview {...view} />
      <TxTransfers {...view} />
      <TxApprovals {...view} />
      <TxCall {...view} />
      <TxInput {...view} />
      <TxFootnote {...view} />
    </div>
  );
}

function relativeTime(timestamp: number, locale: string): string {
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
