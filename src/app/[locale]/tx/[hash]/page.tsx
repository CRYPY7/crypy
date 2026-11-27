import type { Metadata } from "next";
import { RecordVisit } from "@/components/recent/recent";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EntitySkeleton, Notice } from "@/components/entity/entity-parts";
import { Download, ExternalLink } from "lucide-react";
import { AutoRefresh } from "@/components/entity/auto-refresh";
import { CopyText, ShowAdvanced, ViewToggle, txViewInitScript } from "@/components/entity/tx-client";
import { TxApprovals, TxCall, TxInput, TxTransfers, type TxView } from "@/components/entity/tx-sections";
import {
  AdvancedEvents,
  AdvancedFacts,
  type StoryContext,
  StoryApproval,
  StoryChanges,
  StoryCost,
  StoryFailure,
  StoryFlow,
  StoryHeadline,
  StoryNotes,
  StoryPending,
  StoryProgress,
  headlineText,
  summaryText,
} from "@/components/entity/tx-story";
import { StoryActions, StoryParties, StoryPermissions, StoryRoute, showsRoute } from "@/components/entity/tx-intel";
import { siteUrl } from "@/config/env";
import { interpret } from "@/lib/tx/interpret";
import { getChain } from "@/config/chains";
import { isLocale } from "@/i18n/locales";
import { shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { pageAccess } from "@/server/page-guard";
import { SavedNotice } from "@/components/entity/freshness";
import { cachedResolve, cachedTxDetails, explorerLink } from "@/server/services/lookups";
import { observe } from "@/server/outcomes/record";
import { classifyTransaction } from "@/lib/outcomes/classify";

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

async function TxContent({ params, searchParams }: Props) {
  const [{ hash }, query, locale] = await Promise.all([params, searchParams, localeParam()]);
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();

  const access = await pageAccess();
  if (access !== "ok")
    return <Notice tone="warning">{t(access === "crawler" ? "entity.crawler" : "entity.rateLimited")}</Notice>;

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
    // The same hash on several chains (rare): the visitor chooses.
    if (result.status === "tx" && result.choices.length > 1) {
      return (
        <div className="flex flex-col gap-4">
          <p>{t("search.result.choose")}</p>
          <ul className="flex flex-col gap-2">
            {result.choices.map((choice) => (
              <li key={choice.path}>
                <Link
                  href={localePath(locale, choice.path)}
                  prefetch={false}
                  className="block rounded-xl border bg-card p-4 font-semibold hover:border-primary"
                >
                  {t(`chains.${choice.chain}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return <Notice tone="warning">{t("search.result.not-found-tx")}</Notice>;
  }

  let tx;
  try {
    tx = await observe("transaction", () => cachedTxDetails(chain.key, hash), classifyTransaction);
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
  const it = interpret(tx, chain.nativeSymbol);
  const ctx: StoryContext = { tx, it, chain, locale, t, explorerName: chain.explorer.name };
  const legacy: TxView = { tx, chain, locale, t, explorerName: chain.explorer.name };
  const st = (key: string) => t(`entity.tx.story.${key}`);
  const pageUrl = `${siteUrl.origin}${localePath(locale, `/tx/${tx.hash}?chain=${chain.key}`)}`;
  const api = (format: string) =>
    `/api/v1/tx/${tx.hash}?chain=${chain.key}&format=${format}&locale=${locale}&download=1`;
  // The left column holds the failure, permission, pending or wallet-change boxes; without any, the rest spreads out.
  const hasMainColumn =
    tx.status !== "success" ||
    it.kind === "approval" ||
    it.kind === "revoke" ||
    it.changes.length > 0 ||
    it.set.actions.length > 1 ||
    it.set.coverage.unexplained.length > 0;
  const extraTransfers = tx.transfers.length > Math.max(1, it.changes.filter((c) => c.asset.token !== "native").length);

  return (
    <div className="flex flex-col gap-5">
      {/* Restores the visitor's Simple/Advanced choice before the views paint (both are server-rendered). */}
      <script dangerouslySetInnerHTML={{ __html: txViewInitScript }} />
      <RecordVisit path={`/tx/${tx.hash}?chain=${chain.key}`} kind="tx" value={tx.hash} chain={chain.key} />
      {tx.status === "pending" && <AutoRefresh />}
      {tx.savedAt && (
        <SavedNotice
          at={tx.savedAt}
          locale={locale}
          chain={chainName}
          title={t.raw("entity.freshness.savedTitle") as string}
          pending={t.raw("entity.freshness.savedPending") as string}
          body={t.raw("entity.freshness.savedTx") as string}
          labels={{ retry: t("entity.freshness.retry"), retrying: t("entity.freshness.retrying") }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Breadcrumbs
          label={t("nav.breadcrumb")}
          items={[
            { label: t("nav.home"), href: localePath(locale) },
            { label: t("entity.tx.title") },
            { label: shortenId(tx.hash), mono: true },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
          <ViewToggle label={st("view.label")} simple={st("view.simple")} advanced={st("view.advanced")} />
          <CopyText
            text={summaryText(ctx, pageUrl)}
            label={st("actions.copySummary")}
            copiedLabel={st("actions.copied")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:border-primary"
          />
          <details className="relative">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm hover:border-primary">
              <Download className="size-4" aria-hidden="true" />
              {st("actions.export")}
            </summary>
            <div className="absolute end-0 z-20 mt-1 flex w-64 flex-col rounded-lg border bg-popover p-1 text-sm shadow-lg">
              <a href={api("text")} className="rounded-md px-3 py-2 hover:bg-muted">
                {st("actions.report")}
              </a>
              <a href={api("json")} className="rounded-md px-3 py-2 hover:bg-muted">
                {st("actions.json")}
              </a>
              <a href={api("raw")} className="rounded-md px-3 py-2 hover:bg-muted">
                {st("actions.raw")}
              </a>
              <CopyText
                text={pageUrl}
                label={st("actions.copyLink")}
                copiedLabel={st("actions.copied")}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-start hover:bg-muted"
              />
            </div>
          </details>
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:border-primary"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {chain.explorer.name}
            </a>
          )}
        </div>
      </div>

      <div className="tx-simple flex flex-col gap-4">
        <StoryHeadline {...ctx} />
        {showsRoute(ctx) ? <StoryRoute {...ctx} /> : <StoryFlow {...ctx} />}
        <StoryProgress {...ctx} />
        {hasMainColumn ? (
          <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-4">
              <StoryFailure {...ctx} />
              <StoryApproval {...ctx} />
              <StoryPending {...ctx} />
              <StoryActions {...ctx} />
              <StoryChanges {...ctx} />
            </div>
            <div className="flex flex-col gap-4">
              <StoryPermissions {...ctx} />
              <StoryParties {...ctx} />
              <StoryCost {...ctx} />
              <StoryNotes {...ctx} />
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <StoryCost {...ctx} />
            <StoryNotes {...ctx} />
          </div>
        )}
        {extraTransfers && (
          <details className="rounded-xl border bg-card px-5 py-3.5">
            <summary className="cursor-pointer">
              <span className="font-semibold">{t("entity.tx.story.events.title", { count: tx.transfers.length })}</span>{" "}
              <span className="text-sm text-muted-foreground">{st("events.hint")}</span>
            </summary>
            <div className="mt-4">
              <TxTransfers {...legacy} />
            </div>
          </details>
        )}
        <ShowAdvanced title={st("view.showTechnical")} hint={st("view.showTechnicalHint")} />
      </div>

      <div id="tx-advanced" className="tx-advanced flex flex-col gap-5">
        <section className="rounded-xl border bg-card px-5 py-4">
          <p className="text-sm text-muted-foreground">{t(`entity.tx.story.status.${tx.status}`)}</p>
          <p className="mt-1 text-lg font-semibold">
            <bdi>{headlineText(ctx).title}</bdi>
          </p>
        </section>
        <StoryFailure {...ctx} />
        <AdvancedFacts {...ctx} />
        <StoryActions {...ctx} idSuffix="-adv" />
        <TxTransfers {...legacy} />
        <TxApprovals {...legacy} />
        <TxCall {...legacy} />
        <AdvancedEvents {...ctx} />
        <TxInput {...legacy} />
      </div>
    </div>
  );
}
